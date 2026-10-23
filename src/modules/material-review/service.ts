import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb, serializeDatabaseWrite } from "@/lib/db";
import {
  eventMaterials,
  eventRegistrations,
  eventAssets,
  users,
  businessAuditLogs,
  managedContent,
} from "@/lib/schema";
import { eventRegistry } from "../event-board/config";
import type { EventDefinition } from "../event-board/contracts";
import { authorizeAdmin, appendBusinessAudit } from "../admin/service";
import type { AuthUser } from "../auth/contracts";
import type {
  DecisionInput,
  MaterialReviewDetail,
  MaterialReviewItem,
  ReviewFilters,
  ReviewStatus,
  MaterialReviewSnapshot,
  MaterialReviewList,
  CoordinationInput,
  RevokeApprovalInput,
} from "./contracts";
import { MaterialReviewError } from "./errors";
import {
  assertReviewOpen,
  eventDefinition,
  inputObject,
  note,
  policyDto,
  readReviewPolicy,
  type ReviewReader,
} from "./policy";
import { materialReviewPolicies } from "./schema";
type Db = Awaited<ReturnType<typeof getDb>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export function reviewStatus(material: {
  status: string;
  result: string | null;
}): ReviewStatus {
  return material.status === "pending"
    ? "pending"
    : material.status === "processed" && material.result === "accepted"
      ? "approved"
      : "rejected";
}
function id(value: string) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new MaterialReviewError("INVALID_INPUT");
  return value;
}
const statusCondition = (status: ReviewStatus): SQL =>
  status === "pending"
    ? eq(eventMaterials.status, "pending")
    : status === "approved"
      ? and(
          eq(eventMaterials.status, "processed"),
          eq(eventMaterials.result, "accepted"),
        )!
      : or(
          eq(eventMaterials.status, "needs_changes"),
          and(
            eq(eventMaterials.status, "processed"),
            eq(eventMaterials.result, "rejected"),
          ),
        )!;
const decisionActions = [
  "material.approved",
  "material.rejected",
  "material.approval_revoked",
];
async function recentActions(db: ReviewReader, ids: string[]) {
  if (!ids.length) return new Map<string, MaterialReviewItem["recentAction"]>();
  const audits = await db
    .selectDistinctOn([businessAuditLogs.resourceId], {
      resourceId: businessAuditLogs.resourceId,
      actor: businessAuditLogs.actor,
      createdAt: businessAuditLogs.createdAt,
      action: businessAuditLogs.action,
    })
    .from(businessAuditLogs)
    .where(
      and(
        eq(businessAuditLogs.resourceType, "material"),
        inArray(businessAuditLogs.resourceId, ids),
        inArray(businessAuditLogs.action, decisionActions),
      ),
    )
    .orderBy(
      businessAuditLogs.resourceId,
      desc(businessAuditLogs.createdAt),
      desc(businessAuditLogs.id),
    );
  return new Map(
    audits.map((a) => [
      a.resourceId,
      {
        actor: a.actor,
        action: a.action,
        createdAt: a.createdAt.toISOString(),
      },
    ]),
  );
}
export async function reviewEventOptions(db: ReviewReader) {
  const content = await db
    .select({
      id: managedContent.id,
      draft: managedContent.draft,
      live: managedContent.live,
    })
    .from(managedContent)
    .where(eq(managedContent.kind, "event"));
  const registry = new Map(eventRegistry.map((event) => [event.id, event]));
  for (const row of content)
    registry.set(row.id, (row.live ?? row.draft) as EventDefinition);
  const policies = await db.select().from(materialReviewPolicies);
  const byId = new Map(policies.map((policy) => [policy.eventId, policy]));
  const now = new Date();
  return [...registry.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((event) => ({
      id: event.id,
      name: event.name,
      tracks: event.tracks,
      reviewPolicy: policyDto(event, byId.get(event.id), now),
    }));
}
export async function listMaterials(
  user: AuthUser,
  filters: ReviewFilters = {},
): Promise<MaterialReviewList> {
  const db = await getDb();
  await authorizeAdmin(db, user, "admin:materials");
  inputObject(filters, [
    "page",
    "eventId",
    "status",
    "q",
    "trackId",
    "coordination",
    "sort",
  ]);
  const page = filters.page ?? 1;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000 ||
    (filters.status &&
      !["pending", "approved", "rejected"].includes(filters.status)) ||
    (filters.coordination &&
      !["required", "none"].includes(filters.coordination)) ||
    (filters.sort && !["newest", "oldest"].includes(filters.sort)) ||
    (filters.q !== undefined &&
      (typeof filters.q !== "string" || filters.q.length > 200)) ||
    (filters.trackId !== undefined &&
      (typeof filters.trackId !== "string" || filters.trackId.length > 250))
  )
    throw new MaterialReviewError("INVALID_INPUT");
  // One read transaction gives rows and statistics the same database snapshot.
  return serializeDatabaseWrite(() =>
    db.transaction(async (tx) => {
      await authorizeAdmin(tx, user, "admin:materials");
      const events = await reviewEventOptions(tx),
        byId = new Map(events.map((event) => [event.id, event]));
      if (filters.eventId && !byId.has(filters.eventId))
        throw new MaterialReviewError("NOT_FOUND", 404);
      const conditions: SQL[] = [isNotNull(eventMaterials.official)];
      if (filters.eventId)
        conditions.push(eq(eventMaterials.eventId, filters.eventId));
      if (filters.q?.trim()) {
        const search = `%${filters.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
        conditions.push(
          sql`(${eventMaterials.official}->>'name' ILIKE ${search} OR ${eventRegistrations.displayName} ILIKE ${search})`,
        );
      }
      if (filters.trackId) {
        // Compound value in the overview prevents tracks in different events colliding.
        const separator = filters.trackId.indexOf(":");
        if (separator >= 0)
          conditions.push(
            eq(eventMaterials.eventId, filters.trackId.slice(0, separator)),
            sql`${eventMaterials.official}->>'trackId' = ${filters.trackId.slice(separator + 1)}`,
          );
        else if (filters.eventId)
          conditions.push(
            sql`${eventMaterials.official}->>'trackId' = ${filters.trackId}`,
          );
        else conditions.push(sql`false`);
      }
      if (filters.coordination)
        conditions.push(
          eq(
            eventMaterials.coordinationRequired,
            filters.coordination === "required",
          ),
        );
      const base = and(...conditions);
      const [statistics] = await tx
        .select({
          total: count(),
          pending: sql<number>`count(*) filter (where ${statusCondition("pending")})::int`,
          approved: sql<number>`count(*) filter (where ${statusCondition("approved")})::int`,
          rejected: sql<number>`count(*) filter (where ${statusCondition("rejected")})::int`,
          coordination: sql<number>`count(*) filter (where ${eventMaterials.coordinationRequired})::int`,
        })
        .from(eventMaterials)
        .innerJoin(
          eventRegistrations,
          and(
            eq(eventRegistrations.userId, eventMaterials.userId),
            eq(eventRegistrations.eventId, eventMaterials.eventId),
          ),
        )
        .where(base);
      if (filters.status) conditions.push(statusCondition(filters.status));
      const where = and(...conditions);
      const [{ total }] = await tx
        .select({ total: count() })
        .from(eventMaterials)
        .innerJoin(
          eventRegistrations,
          and(
            eq(eventRegistrations.userId, eventMaterials.userId),
            eq(eventRegistrations.eventId, eventMaterials.eventId),
          ),
        )
        .where(where);
      const found = await tx
        .select({
          id: eventMaterials.id,
          eventId: eventMaterials.eventId,
          projectName: sql<string>`${eventMaterials.official}->>'name'`,
          tagline: sql<string>`${eventMaterials.official}->>'tagline'`,
          trackId: sql<string>`${eventMaterials.official}->>'trackId'`,
          participantName: eventRegistrations.displayName,
          status: eventMaterials.status,
          result: eventMaterials.result,
          revision: eventMaterials.revision,
          submittedRevision: eventMaterials.submittedRevision,
          submittedAt: eventMaterials.submittedAt,
          processedAt: eventMaterials.processedAt,
          coordinationRequired: eventMaterials.coordinationRequired,
          coordinationSubmittedRevision:
            eventMaterials.coordinationSubmittedRevision,
        })
        .from(eventMaterials)
        .innerJoin(
          eventRegistrations,
          and(
            eq(eventRegistrations.userId, eventMaterials.userId),
            eq(eventRegistrations.eventId, eventMaterials.eventId),
          ),
        )
        .where(where)
        .orderBy(
          filters.sort === "oldest"
            ? asc(eventMaterials.submittedAt)
            : desc(eventMaterials.submittedAt),
          eventMaterials.id,
        )
        .limit(20)
        .offset((page - 1) * 20);
      const recent = await recentActions(
        tx,
        found.map((row) => row.id),
      );
      const items: MaterialReviewItem[] = found.map((row) => {
        const event = byId.get(row.eventId)!;
        return {
          ...row,
          status: reviewStatus(row),
          eventName: event.name,
          trackName: event.tracks.find((track) => track.id === row.trackId)
            ?.name ?? { zh: row.trackId, en: row.trackId },
          reviewPolicy: event.reviewPolicy,
          submittedAt: row.submittedAt?.toISOString() ?? null,
          processedAt: row.processedAt?.toISOString() ?? null,
          recentAction: recent.get(row.id) ?? null,
          reason: null,
        };
      });
      return {
        items,
        total,
        page,
        pageSize: 20,
        totalPages: Math.ceil(total / 20),
        statistics,
        events,
        serverNow: new Date().toISOString(),
      };
    }),
  );
}
async function detail(
  db: ReviewReader,
  materialId: string,
): Promise<MaterialReviewDetail> {
  const [row] = await db
    .select({
      material: eventMaterials,
      registration: eventRegistrations,
      email: users.email,
    })
    .from(eventMaterials)
    .innerJoin(
      eventRegistrations,
      and(
        eq(eventRegistrations.userId, eventMaterials.userId),
        eq(eventRegistrations.eventId, eventMaterials.eventId),
      ),
    )
    .innerJoin(users, eq(users.id, eventMaterials.userId))
    .where(
      and(
        eq(eventMaterials.id, id(materialId)),
        isNotNull(eventMaterials.official),
      ),
    )
    .limit(1);
  if (!row) throw new MaterialReviewError("NOT_FOUND", 404);
  const m = row.material,
    p = m.official!,
    r = row.registration;
  const event = await eventDefinition(db, m.eventId),
    policy = await readReviewPolicy(db, m.eventId);
  const refs = [p.coverId, ...p.screenshotIds, p.documentId].filter(
    (value): value is string => Boolean(value),
  );
  const assets = refs.length
    ? await db
        .select()
        .from(eventAssets)
        .where(
          and(
            eq(eventAssets.eventId, m.eventId),
            eq(eventAssets.userId, m.userId),
            inArray(eventAssets.id, refs),
          ),
        )
    : [];
  const audits = await db
    .select()
    .from(businessAuditLogs)
    .where(
      and(
        eq(businessAuditLogs.resourceType, "material"),
        eq(businessAuditLogs.resourceId, m.id),
      ),
    )
    .orderBy(desc(businessAuditLogs.createdAt), desc(businessAuditLogs.id));
  const recent = audits.find((a) => decisionActions.includes(a.action)),
    status = reviewStatus(m),
    open = policy.state === "open";
  return {
    id: m.id,
    eventId: m.eventId,
    eventName: event.name,
    projectName: p.name,
    tagline: p.tagline,
    participantName: r.displayName,
    trackId: p.trackId,
    trackName: event.tracks.find((track) => track.id === p.trackId)?.name ?? {
      zh: p.trackId,
      en: p.trackId,
    },
    registration: {
      id: r.id,
      email: row.email,
      displayName: r.displayName,
      role: r.role,
      country: r.country,
      organization: r.organization,
      contact: r.contact,
      acceptedTerms: r.acceptedTerms,
      createdAt: r.createdAt.toISOString(),
    },
    status,
    revision: m.revision,
    submittedRevision: m.submittedRevision,
    submittedAt: m.submittedAt?.toISOString() ?? null,
    processedAt: m.processedAt?.toISOString() ?? null,
    reason: m.publicNote,
    official: p,
    internalNote: m.internalNote,
    coordinationRequired: m.coordinationRequired,
    coordinationSubmittedRevision: m.coordinationSubmittedRevision,
    reviewNotice: m.reviewNotice,
    reviewPolicy: policy,
    canDecide: open && status === "pending",
    canRevoke: open && status === "approved",
    canAnnotate: open,
    readOnlyReason: policy.state === "open" ? null : policy.state,
    recentAction: recent
      ? {
          actor: recent.actor,
          action: recent.action,
          createdAt: recent.createdAt.toISOString(),
        }
      : null,
    assets: assets.map((a) => ({
      id: a.id,
      purpose: a.purpose,
      originalName: a.originalName,
      mediaType: a.mediaType,
      size: a.size,
      url: `/api/admin/materials/${m.id}/files/${a.id}`,
    })),
    history: audits.map((a) => {
      const after = a.after as MaterialReviewSnapshot;
      return {
        id: a.id,
        actor: a.actor,
        action: a.action,
        ...after,
        before: a.before as MaterialReviewSnapshot | null,
        after,
        createdAt: a.createdAt.toISOString(),
      };
    }),
  };
}
export async function getMaterial(user: AuthUser, materialId: string) {
  const db = await getDb();
  await authorizeAdmin(db, user, "admin:materials");
  return detail(db, materialId);
}
function revisions(value: { revision: number; submittedRevision: number }) {
  if (
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Number.isSafeInteger(value.submittedRevision) ||
    value.submittedRevision < 1
  )
    throw new MaterialReviewError("INVALID_INPUT");
}
function snapshot(
  value: typeof eventMaterials.$inferSelect,
): MaterialReviewSnapshot {
  return {
    revision: value.revision,
    submittedRevision: value.submittedRevision,
    status: reviewStatus(value),
    reason: value.publicNote,
    internalNote: value.internalNote,
    coordinationRequired: value.coordinationRequired,
    coordinationSubmittedRevision: value.coordinationSubmittedRevision,
    reviewNotice: value.reviewNotice,
  };
}
async function writable(
  tx: Tx,
  user: AuthUser,
  materialId: string,
  input: { revision: number; submittedRevision: number },
) {
  await authorizeAdmin(tx, user, "admin:materials");
  revisions(input);
  const [old] = await tx
    .select()
    .from(eventMaterials)
    .where(eq(eventMaterials.id, id(materialId)))
    .limit(1);
  if (!old?.official) throw new MaterialReviewError("NOT_FOUND", 404);
  if (
    old.revision !== input.revision ||
    old.submittedRevision !== input.submittedRevision
  )
    throw new MaterialReviewError("REVISION_CONFLICT", 409);
  return old;
}
async function finish(
  tx: Tx,
  user: AuthUser,
  old: typeof eventMaterials.$inferSelect,
  changes: Partial<typeof eventMaterials.$inferInsert>,
  action: string,
) {
  // No channel calls or other external work while holding the write lock.
  const policy = await assertReviewOpen(tx, old.eventId);
  const [next] = await tx
    .update(eventMaterials)
    .set({ ...changes, revision: old.revision + 1, updatedAt: new Date() })
    .where(
      and(
        eq(eventMaterials.id, old.id),
        policy.mode === "unlimited"
          ? sql`true`
          : sql`${policy.opensAt}::timestamptz <= clock_timestamp() and clock_timestamp() < ${policy.closesAt}::timestamptz`,
      ),
    )
    .returning();
  if (!next) throw new MaterialReviewError("REVIEW_CLOSED", 409);
  await appendBusinessAudit(tx, {
    actor: user,
    action,
    resourceType: "material",
    resourceId: old.id,
    eventId: old.eventId,
    before: snapshot(old),
    after: snapshot(next),
  });
  return detail(tx, old.id);
}
export async function decideMaterialInTransaction(
  tx: Tx,
  user: AuthUser,
  materialId: string,
  value: DecisionInput,
) {
  inputObject(value, [
    "revision",
    "submittedRevision",
    "action",
    "reason",
    "internalNote",
  ]);
  if (!["approved", "rejected"].includes(value.action))
    throw new MaterialReviewError("INVALID_INPUT");
  const reason = note(value.reason, value.action === "rejected");
  const internalNote =
    value.internalNote === undefined ? undefined : note(value.internalNote);
  const old = await writable(tx, user, materialId, value);
  if (old.status !== "pending")
    throw new MaterialReviewError("NOT_PENDING", 409);
  return finish(
    tx,
    user,
    old,
    {
      status: "processed",
      result: value.action === "approved" ? "accepted" : "rejected",
      publicNote: reason,
      reviewNotice: null,
      ...(internalNote === undefined
        ? {}
        : {
            internalNote,
            ...(internalNote !== old.internalNote
              ? { coordinationSubmittedRevision: old.submittedRevision }
              : {}),
          }),
      processedBy: user.id,
      processedAt: new Date(),
    },
    `material.${value.action}`,
  );
}
export async function decideMaterial(
  user: AuthUser,
  materialId: string,
  value: DecisionInput,
) {
  return serializeDatabaseWrite(async () =>
    (await getDb()).transaction((tx) =>
      decideMaterialInTransaction(tx, user, materialId, value),
    ),
  );
}
export async function revokeApproval(
  user: AuthUser,
  materialId: string,
  input: RevokeApprovalInput,
) {
  inputObject(input, [
    "revision",
    "submittedRevision",
    "reason",
    "internalNote",
  ]);
  const reason = note(input.reason, true),
    internalNote =
      input.internalNote === undefined ? undefined : note(input.internalNote);
  return serializeDatabaseWrite(async () =>
    (await getDb()).transaction(async (tx) => {
      const old = await writable(tx, user, materialId, input);
      if (reviewStatus(old) !== "approved")
        throw new MaterialReviewError("NOT_APPROVED", 409);
      return finish(
        tx,
        user,
        old,
        {
          status: "pending",
          result: null,
          publicNote: reason,
          reviewNotice: "approval_revoked",
          processedBy: null,
          processedAt: null,
          ...(internalNote === undefined
            ? {}
            : {
                internalNote,
                ...(internalNote !== old.internalNote
                  ? { coordinationSubmittedRevision: old.submittedRevision }
                  : {}),
              }),
        },
        "material.approval_revoked",
      );
    }),
  );
}
export async function saveCoordination(
  user: AuthUser,
  materialId: string,
  input: CoordinationInput,
) {
  inputObject(input, [
    "revision",
    "submittedRevision",
    "coordinationRequired",
    "internalNote",
  ]);
  if (typeof input.coordinationRequired !== "boolean")
    throw new MaterialReviewError("INVALID_INPUT");
  const internalNote = note(input.internalNote);
  return serializeDatabaseWrite(async () =>
    (await getDb()).transaction(async (tx) => {
      const old = await writable(tx, user, materialId, input);
      return finish(
        tx,
        user,
        old,
        {
          coordinationRequired: input.coordinationRequired,
          internalNote,
          coordinationSubmittedRevision: old.submittedRevision,
        },
        "material.coordination_saved",
      );
    }),
  );
}

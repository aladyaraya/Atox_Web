import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, serializeDatabaseWrite } from "@/lib/db";
import type { AuthUser } from "../auth/contracts";
import { authorizeAdmin, appendBusinessAudit } from "../admin/service";
import { businessAuditLogs } from "../admin/schema";
import { getAccountProfile } from "../auth/profile";
import { readContent, readPublishedEvent } from "../content-management/store";
import { eventRegistrations } from "../event-participation/schema";
import { submittedProjects, projectAssets, projectVersions } from "./schema";
import type {
  ManagedProject,
  OwnerProject,
  Page,
  ProjectFilters,
  ProjectInput,
  ProjectOptions,
  VersionInput,
} from "./contracts";
import { emptyProject } from "./contracts";
import { ProjectSubmissionError as E } from "./errors";
import { object, refs, revision, text, uuid, validatePayload } from "./rules";
import {
  assetDto,
  checkEditable,
  editFence,
  formalVersion,
  owned,
  projectRow,
  projectMetadata,
  summary,
  toPublic,
  type Reader,
  type Row,
  type Tx,
} from "./store";
const write = <T>(fn: (db: Tx) => Promise<T>) =>
  serializeDatabaseWrite(async () => (await getDb()).transaction(fn));
const match = (expected: number, current: number) => {
  revision(expected);
  if (expected !== current) throw new E("REVISION_CONFLICT", 409);
};
function versionMatch(input: VersionInput, row: Row) {
  match(input.revision, row.revision);
  match(input.submittedRevision, row.submittedRevision);
}
function auditSnapshot(row: Row) {
  return {
    revision: row.revision,
    submittedRevision: row.submittedRevision,
    liveRevision: row.liveRevision,
    reviewState: row.reviewState,
    publicationState: row.publicationState,
    publicNote: row.publicNote,
    internalNote: row.internalNote,
    consentRevoked: row.consentRevoked,
  };
}
async function audit(
  db: Tx,
  user: AuthUser,
  action: string,
  before: Row | null,
  after: Row,
  extra: unknown = null,
) {
  await appendBusinessAudit(db, {
    actor: user,
    action,
    resourceType: "project",
    resourceId: after.id,
    eventId: after.eventId,
    before: before ? auditSnapshot(before) : null,
    after: { ...auditSnapshot(after), detail: extra },
  });
}
async function assetsFor(db: Reader, row: Row, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(projectAssets)
    .where(
      and(eq(projectAssets.projectId, row.id), inArray(projectAssets.id, ids)),
    );
}
async function validateAssets(db: Reader, row: Row, payload: ProjectInput) {
  const wanted = refs(payload),
    assets = await assetsFor(db, row, wanted);
  if (
    assets.length !== wanted.length ||
    assets.some(
      (a) =>
        a.ownerId !== row.ownerId ||
        (a.id === payload.coverId && a.purpose !== "cover") ||
        (a.id === payload.documentId && a.purpose !== "document") ||
        (payload.screenshotIds.includes(a.id) && a.purpose !== "screenshot"),
    )
  )
    throw new E("INVALID_FILE");
}
export async function projectOptions(user: AuthUser): Promise<ProjectOptions> {
  const db = await getDb(),
    registrations = await db
      .select({ eventId: eventRegistrations.eventId })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.userId, user.id));
  const events = [];
  for (const r of registrations) {
    const e = await readPublishedEvent(r.eventId, db);
    if (e)
      events.push({
        id: e.id,
        name: e.name,
        opensAt: e.submissionOpensAt,
        closesAt: e.submissionClosesAt,
      });
  }
  return { events };
}
export async function createProject(
  user: AuthUser,
  input: { requestId: string },
): Promise<{ id: string }> {
  object(input, ["requestId"]);
  if (!uuid(input.requestId)) throw new E("INVALID_INPUT");
  return write(async (db) => {
    const [existing] = await db
      .select({ id: submittedProjects.id })
      .from(submittedProjects)
      .where(
        and(
          eq(submittedProjects.ownerId, user.id),
          eq(submittedProjects.creationKey, input.requestId),
        ),
      );
    if (existing) return existing;
    const id = randomUUID(),
      profile = await getAccountProfile(user, db);
    const [row] = await db
      .insert(submittedProjects)
      .values({
        id,
        source: "user",
        ownerId: user.id,
        creationKey: input.requestId,
        draft: emptyProject(profile.nickname ?? ""),
      })
      .returning(projectMetadata);
    await audit(db, user, "project.created", null, row);
    return { id };
  });
}
export async function getOwnProject(
  user: AuthUser,
  id: string,
): Promise<OwnerProject> {
  const db = await getDb(),
    row = await owned(db, user, id),
    formal = await formalVersion(db, row);
  let editReason: string | null = null;
  try {
    await checkEditable(db, user, row);
  } catch (error) {
    if (error instanceof E) editReason = error.code;
    else throw error;
  }
  return {
    ...summary(row, row.draft),
    draft: row.draft!,
    submitted: formal?.payload ?? null,
    publicNote: row.publicNote,
    live: row.publicationState === "published" ? row.live : null,
    consentRevoked: row.consentRevoked,
    canEdit: editReason === null,
    editReason,
    assets: (
      await assetsFor(db, row, [
        ...new Set([...refs(row.draft), ...refs(formal?.payload)]),
      ])
    ).map(assetDto),
  };
}
function paginate<T>(items: T[], page = 1, pageSize = 20): Page<T> {
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
    throw new E("INVALID_INPUT");
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total: items.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
  };
}
export async function listOwnProjects(user: AuthUser, page = 1) {
  const rows = await (
    await getDb()
  )
    .select()
    .from(submittedProjects)
    .where(eq(submittedProjects.ownerId, user.id))
    .orderBy(desc(submittedProjects.createdAt), submittedProjects.id);
  return paginate(
    rows.map((r) => summary(r, r.draft)),
    page,
  );
}
export async function saveDraft(
  user: AuthUser,
  id: string,
  input: { draftRevision: number; payload: ProjectInput },
) {
  object(input, ["draftRevision", "payload"]);
  const payload = validatePayload(input.payload);
  await write(async (db) => {
    const row = await owned(db, user, id);
    match(input.draftRevision, row.draftRevision);
    await checkEditable(db, user, row, payload.eventId);
    await validateAssets(db, row, payload);
    const [after] = await db
      .update(submittedProjects)
      .set({
        draft: payload,
        eventId: payload.eventId,
        draftRevision: row.draftRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(eq(submittedProjects.id, id), await editFence(db, payload.eventId)),
      )
      .returning(projectMetadata);
    if (!after) throw new E("CLOSED", 409);
    await audit(db, user, "project.draft_saved", row, after, {
      draftRevision: after.draftRevision,
    });
  });
  return getOwnProject(user, id);
}
export async function submitProject(
  user: AuthUser,
  id: string,
  input: { draftRevision: number; revision: number },
) {
  object(input, ["draftRevision", "revision"]);
  await write(async (db) => {
    const row = await owned(db, user, id);
    match(input.draftRevision, row.draftRevision);
    match(input.revision, row.revision);
    const payload = validatePayload(row.draft!, true);
    await checkEditable(db, user, row, payload.eventId);
    await validateAssets(db, row, payload);
    const now = new Date();
    await db.insert(projectVersions).values({
      id: randomUUID(),
      projectId: id,
      number: row.submittedRevision + 1,
      payload,
      submittedAt: now,
    });
    // Recheck immediately before the write, including a queued request crossing the deadline.
    await checkEditable(db, user, row, payload.eventId);
    const [after] = await db
      .update(submittedProjects)
      .set({
        submittedRevision: row.submittedRevision + 1,
        reviewState: "pending",
        publicNote: null,
        internalNote: null,
        consentRevoked: false,
        revision: row.revision + 1,
        updatedAt: now,
      })
      .where(
        and(eq(submittedProjects.id, id), await editFence(db, payload.eventId)),
      )
      .returning(projectMetadata);
    if (!after) throw new E("CLOSED", 409);
    await audit(db, user, "project.submitted", row, after, {
      version: after.submittedRevision,
    });
  });
  return getOwnProject(user, id);
}
export async function withdrawProject(
  user: AuthUser,
  id: string,
  input: { revision: number; reason: string },
) {
  object(input, ["revision", "reason"]);
  const reason = text(input.reason, 5000, true);
  await write(async (db) => {
    const row = await owned(db, user, id);
    match(input.revision, row.revision);
    if (row.publicationState !== "published") throw new E("NOT_PUBLISHED", 409);
    const [after] = await db
      .update(submittedProjects)
      .set({
        publicationState: "withdrawn",
        consentRevoked: true,
        draft: { ...row.draft!, publicConsent: false },
        draftRevision: row.draftRevision + 1,
        revision: row.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(submittedProjects.id, id))
      .returning(projectMetadata);
    await audit(db, user, "project.owner_withdrawn", row, after, { reason });
  });
  return getOwnProject(user, id);
}
export async function managedProject(
  user: AuthUser,
  id: string,
): Promise<ManagedProject> {
  const db = await getDb();
  await authorizeAdmin(db, user, "admin:projects");
  const row = await projectRow(db, id),
    formal = await formalVersion(db, row);
  if (row.source === "user" && !formal) throw new E("NOT_SUBMITTED", 404);
  const history = await db
    .select()
    .from(businessAuditLogs)
    .where(
      and(
        eq(businessAuditLogs.resourceType, "project"),
        eq(businessAuditLogs.resourceId, id),
      ),
    )
    .orderBy(desc(businessAuditLogs.createdAt), desc(businessAuditLogs.id))
    .limit(100);
  return {
    ...summary(row, formal?.payload),
    submitted: formal?.payload ?? null,
    submittedAt: formal?.submittedAt.toISOString() ?? null,
    live: row.live,
    preview: formal ? toPublic(row, formal.payload) : row.live,
    publicNote: row.publicNote,
    internalNote: row.internalNote,
    consentRevoked: row.consentRevoked,
    assets: (await assetsFor(db, row, refs(formal?.payload))).map(assetDto),
    history: history
      .filter((h) => h.action !== "project.draft_saved")
      .map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
  };
}
export async function listManagedProjects(
  user: AuthUser,
  filters: ProjectFilters = {},
) {
  object(filters, [
    "q",
    "source",
    "eventId",
    "category",
    "reviewState",
    "publicationState",
    "page",
  ]);
  const db = await getDb();
  await authorizeAdmin(db, user, "admin:projects");
  const q = text(filters.q ?? "", 200),
    page = filters.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000)
    throw new E("INVALID_INPUT");
  const escaped = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  const condition = and(
    sql`(${submittedProjects.source}='demo' OR ${submittedProjects.submittedRevision}>0)`,
    q
      ? sql`concat_ws(' ',coalesce(${projectVersions.payload}->>'name',${submittedProjects.live}#>>'{name,zh}'),coalesce(${projectVersions.payload}#>>'{translation,name}',${submittedProjects.live}#>>'{name,en}'),coalesce(${projectVersions.payload}->>'creator',${submittedProjects.live}#>>'{creator,zh}')) ILIKE ${escaped}`
      : undefined,
    filters.source
      ? sql`${submittedProjects.source}=${filters.source}`
      : undefined,
    filters.eventId
      ? filters.eventId === "independent"
        ? isNull(submittedProjects.eventId)
        : eq(submittedProjects.eventId, filters.eventId)
      : undefined,
    filters.category
      ? sql`coalesce(${projectVersions.payload}->>'category',${submittedProjects.live}->>'category')=${filters.category}`
      : undefined,
    filters.reviewState
      ? sql`${submittedProjects.reviewState}=${filters.reviewState}`
      : undefined,
    filters.publicationState
      ? sql`${submittedProjects.publicationState}=${filters.publicationState}`
      : undefined,
  );
  const join = and(
    eq(projectVersions.projectId, submittedProjects.id),
    eq(projectVersions.number, submittedProjects.submittedRevision),
  );
  return serializeDatabaseWrite(async () =>
    db.transaction(async (tx) => {
      await authorizeAdmin(tx, user, "admin:projects");
      const [{ total }] = await tx
        .select({ total: count() })
        .from(submittedProjects)
        .leftJoin(projectVersions, join)
        .where(condition);
      const rows = await tx
        .select({ row: projectMetadata, payload: projectVersions.payload })
        .from(submittedProjects)
        .leftJoin(projectVersions, join)
        .where(condition)
        .orderBy(desc(submittedProjects.updatedAt), submittedProjects.id)
        .limit(20)
        .offset((page - 1) * 20);
      const eventIds = await tx
        .selectDistinct({ eventId: submittedProjects.eventId })
        .from(submittedProjects)
        .where(
          sql`${submittedProjects.eventId} IS NOT NULL AND (${submittedProjects.source}='demo' OR ${submittedProjects.submittedRevision}>0)`,
        );
      const events = [];
      for (const value of eventIds) {
        const e = await readContent("event", value.eventId!, tx);
        if (e) {
          const definition = (e.live ??
            e.draft) as import("../event-board/contracts").EventDefinition;
          events.push({ id: definition.id, name: definition.name });
        }
      }
      return {
        items: rows.map(({ row, payload }) => summary(row, payload)),
        total,
        page,
        pageSize: 20,
        totalPages: Math.max(1, Math.ceil(total / 20)),
        options: { events },
      };
    }),
  );
}
export async function decideProject(
  user: AuthUser,
  id: string,
  input: VersionInput & {
    action: "approved" | "rejected";
    reason: string;
    internalNote?: string;
  },
) {
  object(input, [
    "revision",
    "submittedRevision",
    "action",
    "reason",
    "internalNote",
  ]);
  if (!["approved", "rejected"].includes(input.action))
    throw new E("INVALID_INPUT");
  const reason = text(input.reason, 5000, input.action === "rejected"),
    internalNote = text(input.internalNote ?? "", 5000);
  await write(async (db) => {
    await authorizeAdmin(db, user, "admin:projects");
    const row = await projectRow(db, id);
    versionMatch(input, row);
    if (row.source !== "user" || row.reviewState !== "pending")
      throw new E("NOT_PENDING", 409);
    const [after] = await db
      .update(submittedProjects)
      .set({
        reviewState: input.action,
        publicNote: reason || null,
        internalNote: internalNote || null,
        revision: row.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(submittedProjects.id, id))
      .returning(projectMetadata);
    await audit(db, user, `project.${input.action}`, row, after);
  });
  return managedProject(user, id);
}
export async function publishProject(
  user: AuthUser,
  id: string,
  input: VersionInput & { action: "publish" | "withdraw"; reason?: string },
) {
  object(input, ["revision", "submittedRevision", "action", "reason"]);
  if (!["publish", "withdraw"].includes(input.action))
    throw new E("INVALID_INPUT");
  const reason = text(input.reason ?? "", 5000, input.action === "withdraw");
  await write(async (db) => {
    await authorizeAdmin(db, user, "admin:projects");
    const row = await projectRow(db, id);
    versionMatch(input, row);
    let live = row.live;
    if (input.action === "publish") {
      if (
        row.consentRevoked ||
        (row.source === "user" && row.reviewState !== "approved")
      )
        throw new E("NOT_APPROVED", 409);
      const formal = await formalVersion(db, row);
      if (row.source === "user") {
        if (!formal?.payload.publicConsent)
          throw new E("DECLARATIONS_REQUIRED");
        live = toPublic(row, formal.payload);
      }
      if (
        !live ||
        (live.eventId && !(await readPublishedEvent(live.eventId, db)))
      )
        throw new E("EVENT_UNAVAILABLE", 409);
    } else if (row.publicationState !== "published")
      throw new E("NOT_PUBLISHED", 409);
    const [after] = await db
      .update(submittedProjects)
      .set({
        publicationState:
          input.action === "publish" ? "published" : "withdrawn",
        live,
        liveRevision:
          input.action === "publish" ? row.submittedRevision : row.liveRevision,
        publishedAt:
          input.action === "publish"
            ? (row.publishedAt ?? new Date())
            : row.publishedAt,
        revision: row.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(submittedProjects.id, id))
      .returning(projectMetadata);
    await audit(
      db,
      user,
      `project.${input.action === "publish" ? "published" : "withdrawn"}`,
      row,
      after,
      { reason },
    );
  });
  return managedProject(user, id);
}

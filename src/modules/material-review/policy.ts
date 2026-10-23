import { and, desc, eq } from "drizzle-orm";
import { getDb, serializeDatabaseWrite } from "@/lib/db";
import { authorizeAdmin, appendBusinessAudit } from "../admin/service";
import { businessAuditLogs } from "../admin/schema";
import type { AuthUser } from "../auth/contracts";
import { readContent } from "../content-management/store";
import type { EventDefinition } from "../event-board/contracts";
import { materialReviewPolicies } from "./schema";
import type { ReviewPolicy, ReviewPolicyInput } from "./contracts";
import { policyState } from "./rules";
export { policyState } from "./rules";
import { MaterialReviewError } from "./errors";
type Db = Awaited<ReturnType<typeof getDb>>;
export type ReviewReader = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
export function policyDto(
  event: Pick<EventDefinition, "id" | "timeZone" | "startsAt" | "endsAt">,
  value: typeof materialReviewPolicies.$inferSelect | undefined,
  now = new Date(),
): ReviewPolicy {
  const mode = value?.mode ?? "event";
  const effective = {
    mode,
    enabled: value?.enabled ?? true,
    opensAt:
      mode === "event"
        ? event.startsAt
        : mode === "custom"
          ? (value?.opensAt?.toISOString() ?? null)
          : null,
    closesAt:
      mode === "event"
        ? event.endsAt
        : mode === "custom"
          ? (value?.closesAt?.toISOString() ?? null)
          : null,
  };
  return {
    eventId: event.id,
    timeZone: event.timeZone,
    ...effective,
    revision: value?.revision ?? 0,
    updatedAt: value?.updatedAt.toISOString() ?? null,
    updatedBy: value?.updatedBy ?? null,
    state: policyState(effective, now),
    serverNow: now.toISOString(),
  };
}
export async function eventDefinition(db: ReviewReader, eventId: string) {
  const value = await readContent("event", eventId, db);
  if (!value) throw new MaterialReviewError("NOT_FOUND", 404);
  return (value.live ?? value.draft) as EventDefinition;
}
export async function readReviewPolicy(db: ReviewReader, eventId: string) {
  const event = await eventDefinition(db, eventId);
  const [value] = await db
    .select()
    .from(materialReviewPolicies)
    .where(eq(materialReviewPolicies.eventId, eventId));
  return policyDto(event, value);
}
/** Invoked inside the shared write transaction immediately before mutation. */
export async function assertReviewOpen(db: ReviewReader, eventId: string) {
  const policy = await readReviewPolicy(db, eventId);
  if (policy.state !== "open")
    throw new MaterialReviewError(`REVIEW_${policy.state.toUpperCase()}`, 409);
  return policy;
}
export async function getReviewPolicy(user: AuthUser, eventId: string) {
  const db = await getDb();
  await authorizeAdmin(db, user, "admin:materials");
  const policy = await readReviewPolicy(db, eventId);
  const history = await db
    .select()
    .from(businessAuditLogs)
    .where(
      and(
        eq(businessAuditLogs.resourceType, "review_policy"),
        eq(businessAuditLogs.resourceId, eventId),
      ),
    )
    .orderBy(desc(businessAuditLogs.createdAt), desc(businessAuditLogs.id))
    .limit(50);
  return {
    policy,
    history: history.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}
export function inputObject(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new MaterialReviewError("INVALID_INPUT");
}
export function note(value: unknown, required = false): string | null {
  if (
    typeof value !== "string" ||
    value.length > 5000 ||
    /\u0000/.test(value) ||
    (required && !value.trim())
  )
    throw new MaterialReviewError("INVALID_INPUT");
  return value.trim() || null;
}
function instant(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new MaterialReviewError("INVALID_INPUT");
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?/.test(timePart)
  )
    throw new MaterialReviewError("INVALID_INPUT");
  return new Date(value);
}
export async function setReviewPolicy(
  user: AuthUser,
  eventId: string,
  input: ReviewPolicyInput,
) {
  inputObject(input, [
    "revision",
    "enabled",
    "mode",
    "opensAt",
    "closesAt",
    "reason",
  ]);
  if (
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    typeof input.enabled !== "boolean"
  )
    throw new MaterialReviewError("INVALID_INPUT");
  const reason = note(input.reason, true)!;
  const mode = input.mode ?? "custom";
  if (!["event", "unlimited", "custom"].includes(mode))
    throw new MaterialReviewError("INVALID_INPUT");
  const opensAt = mode === "custom" ? instant(input.opensAt) : null,
    closesAt = mode === "custom" ? instant(input.closesAt) : null;
  if (opensAt && closesAt && +opensAt >= +closesAt)
    throw new MaterialReviewError("INVALID_INPUT");
  return serializeDatabaseWrite(async () =>
    (await getDb()).transaction(async (tx) => {
      await authorizeAdmin(tx, user, "admin:materials");
      const before = await readReviewPolicy(tx, eventId);
      if (before.revision !== input.revision)
        throw new MaterialReviewError("REVISION_CONFLICT", 409);
      const now = new Date();
      if (input.enabled && closesAt && +closesAt <= +now)
        throw new MaterialReviewError("REVIEW_DEADLINE_REQUIRED", 409);
      const value = {
        eventId,
        enabled: input.enabled,
        mode,
        opensAt,
        closesAt,
        revision: before.revision + 1,
        updatedAt: now,
        updatedBy: user.id,
      };
      await tx.insert(materialReviewPolicies).values(value).onConflictDoUpdate({
        target: materialReviewPolicies.eventId,
        set: value,
      });
      const after = policyDto(await eventDefinition(tx, eventId), value, now);
      await appendBusinessAudit(tx, {
        actor: user,
        action: "review_policy.changed",
        resourceType: "review_policy",
        resourceId: eventId,
        eventId,
        before,
        after: { ...after, reason },
      });
      return { policy: after };
    }),
  );
}

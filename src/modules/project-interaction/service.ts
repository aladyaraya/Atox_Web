import { createHash, randomUUID } from "node:crypto";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, serializeDatabaseWrite } from "@/lib/db";
import type { AuthUser } from "../auth/contracts";
import {
  getAccountProfile,
  getPublicNicknames,
  type ProfileReader,
} from "../auth/profile";
import { authorizeAdmin, appendBusinessAudit } from "../admin/service";
import { resolvePublicProject } from "../project-board/visibility";
import { projectRegistry } from "../project-board/config";
import { projectLikes, projectComments } from "./schema";
import { ProjectInteractionError as E } from "./errors";
import type {
  CommentPage,
  CommentReceipt,
  InteractionStats,
  ManagedCommentPage,
  CommentStatus,
} from "./contracts";
type Reader = ProfileReader;
const empty = (): InteractionStats => ({
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
});
export async function requireProject(id: string, db?: Reader) {
  const p = await resolvePublicProject(id, db);
  if (!p) throw new E("NOT_FOUND", 404);
  return p;
}
function object(value: unknown, keys: string[]) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new E("INVALID_INPUT");
  return value as Record<string, unknown>;
}
const uuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function pageNumber(value: unknown = 1) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 1000000
  )
    throw new E("INVALID_INPUT");
  return value;
}
export async function getInteractionStats(
  ids: string[],
  user?: AuthUser | null,
  db?: Reader,
) {
  db ??= await getDb();
  const result = new Map(ids.map((id) => [id, empty()]));
  if (!ids.length) return result;
  const likes = await db
    .select({ projectId: projectLikes.projectId, total: count() })
    .from(projectLikes)
    .where(inArray(projectLikes.projectId, ids))
    .groupBy(projectLikes.projectId);
  const comments = await db
    .select({ projectId: projectComments.projectId, total: count() })
    .from(projectComments)
    .where(
      and(
        inArray(projectComments.projectId, ids),
        eq(projectComments.status, "visible"),
      ),
    )
    .groupBy(projectComments.projectId);
  for (const row of likes) result.get(row.projectId)!.likeCount = row.total;
  for (const row of comments)
    result.get(row.projectId)!.commentCount = row.total;
  if (user) {
    const mine = await db
      .select({ projectId: projectLikes.projectId })
      .from(projectLikes)
      .where(
        and(
          inArray(projectLikes.projectId, ids),
          eq(projectLikes.userId, user.id),
        ),
      );
    for (const row of mine) result.get(row.projectId)!.likedByMe = true;
  }
  return result;
}
export async function setLike(
  user: AuthUser,
  id: string,
  input: unknown,
): Promise<InteractionStats> {
  const v = object(input, ["liked"]);
  if (typeof v.liked !== "boolean") throw new E("INVALID_INPUT");
  return serializeDatabaseWrite(async () =>
    (await getDb()).transaction(async (tx) => {
      await requireProject(id, tx);
      if (v.liked)
        await tx
          .insert(projectLikes)
          .values({
            id: randomUUID(),
            projectId: id,
            userId: user.id,
            createdAt: new Date(),
          })
          .onConflictDoNothing();
      else
        await tx
          .delete(projectLikes)
          .where(
            and(
              eq(projectLikes.projectId, id),
              eq(projectLikes.userId, user.id),
            ),
          );
      return (await getInteractionStats([id], user, tx)).get(id)!;
    }),
  );
}
export async function listComments(
  id: string,
  user?: AuthUser | null,
  page = 1,
): Promise<CommentPage> {
  pageNumber(page);
  const db = await getDb();
  await requireProject(id, db);
  const condition = and(
    eq(projectComments.projectId, id),
    eq(projectComments.status, "visible"),
  );
  const [{ total }] = await db
    .select({ total: count() })
    .from(projectComments)
    .where(condition);
  const rows = await db
    .select()
    .from(projectComments)
    .where(condition)
    .orderBy(desc(projectComments.createdAt), desc(projectComments.id))
    .limit(20)
    .offset((page - 1) * 20);
  const names = await getPublicNicknames(
    rows.map((r) => r.userId),
    db,
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      body: r.body!,
      nickname: names.get(r.userId) ?? "User",
      createdAt: r.createdAt.toISOString(),
      isMine: r.userId === user?.id,
    })),
    total,
    page,
    pageSize: 20,
    totalPages: Math.ceil(total / 20),
  };
}
export async function addComment(
  user: AuthUser,
  id: string,
  input: unknown,
): Promise<CommentReceipt> {
  const v = object(input, ["body", "requestId"]);
  if (typeof v.body !== "string" || !uuid(v.requestId))
    throw new E("INVALID_INPUT");
  const body = v.body.trim(),
    requestId = (v.requestId as string).toLowerCase();
  if (
    !body ||
    Array.from(body).length > 1000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(body)
  )
    throw new E("INVALID_INPUT");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  return serializeDatabaseWrite(async () =>
    (await getDb()).transaction(async (tx) => {
      await requireProject(id, tx);
      const [previous] = await tx
        .select()
        .from(projectComments)
        .where(
          and(
            eq(projectComments.userId, user.id),
            eq(projectComments.requestId, requestId),
          ),
        )
        .limit(1);
      if (previous) {
        if (previous.projectId !== id || previous.bodyHash !== bodyHash)
          throw new E("IDEMPOTENCY_CONFLICT", 409);
        return { commentId: previous.id, status: previous.status };
      }
      if (!(await getAccountProfile(user, tx)).nickname)
        throw new E("NICKNAME_REQUIRED", 409);
      const now = new Date();
      const history = await tx
        .select({ createdAt: projectComments.createdAt })
        .from(projectComments)
        .where(
          and(
            eq(projectComments.userId, user.id),
            gte(projectComments.createdAt, new Date(now.getTime() - 3600000)),
          ),
        );
      const minute = history.filter(
        (r) => r.createdAt.getTime() > now.getTime() - 60000,
      );
      if (minute.length >= 3 || history.length >= 20) {
        const windowRows = minute.length >= 3 ? minute : history;
        const windowMs = minute.length >= 3 ? 60000 : 3600000;
        const retry = Math.max(
          1,
          Math.ceil(
            (Math.min(...windowRows.map((r) => r.createdAt.getTime())) +
              windowMs -
              now.getTime()) /
              1000,
          ),
        );
        throw new E("RATE_LIMITED", 429, retry);
      }
      const commentId = randomUUID();
      await tx
        .insert(projectComments)
        .values({
          id: commentId,
          projectId: id,
          userId: user.id,
          body,
          bodyHash,
          requestId,
          status: "visible",
          revision: 1,
          createdAt: now,
          updatedAt: now,
        });
      return { commentId, status: "visible" };
    }),
  );
}
export async function deleteComment(
  user: AuthUser,
  id: string,
  commentId: string,
) {
  if (!uuid(commentId)) throw new E("NOT_FOUND", 404);
  return serializeDatabaseWrite(async () =>
    (await getDb()).transaction(async (tx) => {
      await requireProject(id, tx);
      const [row] = await tx
        .select()
        .from(projectComments)
        .where(
          and(
            eq(projectComments.id, commentId),
            eq(projectComments.projectId, id),
          ),
        )
        .limit(1);
      if (!row) throw new E("NOT_FOUND", 404);
      if (row.userId !== user.id) throw new E("FORBIDDEN", 403);
      if (row.status !== "deleted")
        await tx
          .update(projectComments)
          .set({
            body: null,
            reason: null,
            status: "deleted",
            revision: row.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(projectComments.id, commentId));
      return { ok: true };
    }),
  );
}
export async function listManagedComments(
  user: AuthUser,
  input: {
    page?: number;
    projectId?: string;
    status?: string;
    commentId?: string;
  } = {},
): Promise<ManagedCommentPage> {
  const page = pageNumber(input.page ?? 1),
    db = await getDb();
  await authorizeAdmin(db, user, "admin:project-comments");
  if (input.status && !["visible", "hidden", "deleted"].includes(input.status))
    throw new E("INVALID_INPUT");
  if (input.projectId && !projectRegistry.some((p) => p.id === input.projectId))
    throw new E("INVALID_INPUT");
  if (input.commentId && !uuid(input.commentId)) throw new E("INVALID_INPUT");
  const condition = and(
    input.projectId
      ? eq(projectComments.projectId, input.projectId)
      : undefined,
    input.status
      ? eq(projectComments.status, input.status as CommentStatus)
      : undefined,
    input.commentId ? eq(projectComments.id, input.commentId) : undefined,
  );
  const [{ total }] = await db
    .select({ total: count() })
    .from(projectComments)
    .where(condition);
  const rows = await db
    .select()
    .from(projectComments)
    .where(condition)
    .orderBy(desc(projectComments.createdAt), desc(projectComments.id))
    .limit(20)
    .offset((page - 1) * 20);
  const names = await getPublicNicknames(
    rows.map((r) => r.userId),
    db,
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: projectRegistry.find((p) => p.id === r.projectId)?.name ?? {
        zh: r.projectId,
        en: r.projectId,
      },
      body: r.status === "deleted" ? null : r.body,
      nickname: names.get(r.userId) ?? "User",
      status: r.status,
      revision: r.revision,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize: 20,
    totalPages: Math.ceil(total / 20),
  };
}
export async function moderateComment(
  user: AuthUser,
  commentId: string,
  input: unknown,
) {
  const v = object(input, ["revision", "action", "reason"]);
  if (
    !uuid(commentId) ||
    !Number.isSafeInteger(v.revision) ||
    (v.revision as number) < 1 ||
    !["hide", "restore"].includes(v.action as string) ||
    (v.reason !== undefined && typeof v.reason !== "string")
  )
    throw new E("INVALID_INPUT");
  const reason = (v.reason as string | undefined)?.trim() ?? "";
  if ((v.action === "hide" && !reason) || Array.from(reason).length > 500)
    throw new E("INVALID_INPUT");
  return serializeDatabaseWrite(async () =>
    (await getDb()).transaction(async (tx) => {
      await authorizeAdmin(tx, user, "admin:project-comments");
      const [row] = await tx
        .select()
        .from(projectComments)
        .where(eq(projectComments.id, commentId))
        .limit(1);
      if (!row) throw new E("NOT_FOUND", 404);
      if (
        row.revision !== v.revision ||
        row.status === "deleted" ||
        (v.action === "hide"
          ? row.status !== "visible"
          : row.status !== "hidden")
      )
        throw new E("REVISION_CONFLICT", 409);
      const status = v.action === "hide" ? "hidden" : "visible";
      await tx
        .update(projectComments)
        .set({
          status,
          reason: status === "hidden" ? reason : null,
          revision: row.revision + 1,
          updatedAt: new Date(),
        })
        .where(eq(projectComments.id, commentId));
      await appendBusinessAudit(tx, {
        actor: user,
        action: "project_comment." + v.action,
        resourceType: "project_comment",
        resourceId: commentId,
        eventId: projectRegistry.find((p) => p.id === row.projectId)?.eventId,
        before: {
          projectId: row.projectId,
          status: row.status,
          revision: row.revision,
          reason: row.reason,
        },
        after: {
          projectId: row.projectId,
          status,
          revision: row.revision + 1,
          reason: status === "hidden" ? reason : null,
        },
      });
      return { ok: true };
    }),
  );
}

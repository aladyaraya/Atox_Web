import { randomUUID } from "node:crypto";
import {
  putPrivateFile,
  readPrivateFile,
  removePrivateFile,
  listPrivateFiles,
} from "@/lib/private-storage";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, serializeDatabaseWrite } from "@/lib/db";
import { normalizeUpload } from "@/lib/upload-content";
import type { AuthUser } from "../auth/contracts";
import { authorizeAdmin } from "../admin/service";
import { readPublishedEvent } from "../content-management/store";
import { projectAssets, projectVersions, submittedProjects } from "./schema";
import { assetDto, checkEditable, editFence, owned, projectRow } from "./store";
import { refs, uuid } from "./rules";
import { ProjectSubmissionError as E } from "./errors";
export const FILE_LIMITS = {
  imageMaxBytes: 5 * 1024 * 1024,
  documentMaxBytes: 20 * 1024 * 1024,
};
export async function uploadProjectFile(
  user: AuthUser,
  id: string,
  purpose: string,
  buffer: Buffer,
  name: string,
) {
  if (
    !["cover", "screenshot", "document"].includes(purpose) ||
    typeof name !== "string" ||
    name.length > 1000
  )
    throw new E("INVALID_FILE");
  const db = await getDb();
  await checkEditable(db, user, await owned(db, user, id));
  let content: Awaited<ReturnType<typeof normalizeUpload>>;
  try {
    content = await normalizeUpload(
      purpose as "cover" | "screenshot" | "document",
      buffer,
      FILE_LIMITS,
    );
  } catch {
    throw new E("INVALID_FILE");
  }
  const storageName = `${randomUUID()}.${content.extension}`;
  await putPrivateFile("projects", storageName, content.buffer);
  try {
    return await serializeDatabaseWrite(async () =>
      db.transaction(async (tx) => {
        const row = await owned(tx, user, id);
        await checkEditable(tx, user, row);
        const clean =
          name
            .split(/[\\/]/)
            .pop()!
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .slice(0, 160) || "upload";
        const [asset] = await tx
          .insert(projectAssets)
          .select(
            tx
              .select({
                id: sql<string>`${randomUUID()}::uuid`.as("id"),
                projectId: sql<string>`${id}`.as("projectId"),
                ownerId: sql<string>`${user.id}::uuid`.as("ownerId"),
                purpose: sql<
                  "cover" | "screenshot" | "document"
                >`${purpose}`.as("purpose"),
                name: sql<string>`${clean}`.as("name"),
                storageName: sql<string>`${storageName}`.as("storageName"),
                mediaType: sql<string>`${content.mediaType}`.as("mediaType"),
                size: sql<number>`${content.buffer.length}::integer`.as("size"),
                createdAt: sql<Date>`clock_timestamp()`.as("createdAt"),
              })
              .from(submittedProjects)
              .where(
                and(
                  eq(submittedProjects.id, id),
                  await editFence(tx, row.eventId),
                ),
              ),
          )
          .returning();
        if (!asset) throw new E("CLOSED", 409);
        return assetDto(asset);
      }),
    );
  } catch (error) {
    await removePrivateFile("projects", storageName).catch(() => undefined);
    throw error;
  }
}
export async function readProjectFile(user: AuthUser | null, id: string) {
  if (!uuid(id)) throw new E("NOT_FOUND", 404);
  const db = await getDb(),
    [asset] = await db
      .select()
      .from(projectAssets)
      .where(eq(projectAssets.id, id));
  if (!asset) throw new E("NOT_FOUND", 404);
  const row = await projectRow(db, asset.projectId);
  let allowed = Boolean(user && user.id === asset.ownerId);
  if (!allowed && user) {
    try {
      await authorizeAdmin(db, user, "admin:projects");
      const versions = await db
        .select({ payload: projectVersions.payload })
        .from(projectVersions)
        .where(eq(projectVersions.projectId, row.id));
      allowed = versions.some((v) => refs(v.payload).includes(id));
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "FORBIDDEN"
      ))
        throw error;
    }
  }
  if (
    !allowed &&
    asset.purpose !== "document" &&
    row.publicationState === "published" &&
    !row.consentRevoked &&
    row.live
  ) {
    const src = `/api/project-files/${id}`;
    allowed =
      (row.live.cover === src ||
        row.live.details.media.some((m) => m.src === src)) &&
      (!row.live.eventId ||
        Boolean(await readPublishedEvent(row.live.eventId, db)));
  }
  if (!allowed) throw new E("NOT_FOUND", 404);
  try {
    return {
      asset: assetDto(asset),
      buffer: await readPrivateFile("projects", asset.storageName),
    };
  } catch {
    throw new E("NOT_FOUND", 404);
  }
}
/** Offline CLI only. Never share the same PGlite directory with a running server. */
export async function cleanupProjectFiles(
  olderThan = new Date(Date.now() - 86400000),
) {
  return serializeDatabaseWrite(async () => {
    const db = await getDb(),
      rows = await db
        .select({
          draft: submittedProjects.draft,
          live: submittedProjects.live,
        })
        .from(submittedProjects),
      versions = await db
        .select({ payload: projectVersions.payload })
        .from(projectVersions);
    const referenced = new Set([
      ...rows.flatMap((r) => refs(r.draft)),
      ...versions.flatMap((v) => refs(v.payload)),
    ]);
    for (const row of rows)
      for (const m of row.live?.details.media ?? []) {
        const id = m.src.split("/api/project-files/")[1];
        if (id) referenced.add(id);
      }
    const candidates = await db
      .select()
      .from(projectAssets)
      .where(lt(projectAssets.createdAt, olderThan));
    let removed = 0;
    for (const asset of candidates)
      if (!referenced.has(asset.id)) {
        await db.transaction(async (tx) => {
          await tx.delete(projectAssets).where(eq(projectAssets.id, asset.id));
          await removePrivateFile("projects", asset.storageName).catch(
            (error) => {
              if (error.code !== "ENOENT") throw error;
            },
          );
        });
        removed++;
      }
    const tracked = new Set(
      (
        await db.select({ name: projectAssets.storageName }).from(projectAssets)
      ).map((r) => r.name),
    );
    if (process.env.STORAGE_DRIVER === "oss") return { removed };
    for (const file of await listPrivateFiles("projects")) {
      const name = file.name;
      if (
        /^[a-f0-9-]{36}\.(png|jpeg|webp|pdf)$/.test(name) &&
        !tracked.has(name)
      ) {
        if (file.modifiedAt < olderThan) {
          await removePrivateFile("projects", name);
          removed++;
        }
      }
    }
    return { removed };
  });
}

import { and, eq, sql, getTableColumns } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { AuthUser } from "../auth/contracts";
import { readPublishedEvent } from "../content-management/store";
import { eventRegistrations } from "../event-participation/schema";
import { projectAssets, projectVersions, submittedProjects } from "./schema";
import type {
  ProjectInput,
  PublicProject,
  ProjectSummary,
  AssetDto,
} from "./contracts";
import { ProjectSubmissionError as E } from "./errors";
import { localized } from "./rules";
export type Reader =
  | Awaited<ReturnType<typeof getDb>>
  | Parameters<
      Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]
    >[0];
export type Tx = Parameters<
  Parameters<Awaited<ReturnType<typeof getDb>>["transaction"]>[0]
>[0];
export type Row = typeof submittedProjects.$inferSelect;
export const projectMetadata = {
  ...getTableColumns(submittedProjects),
  draft: sql<ProjectInput | null>`NULL`.as("draft"),
};
export async function projectRow(db: Reader, id: string, includeDraft = false) {
  if (typeof id !== "string" || id.length > 100) throw new E("NOT_FOUND", 404);
  const [row] = await db
    .select(includeDraft ? getTableColumns(submittedProjects) : projectMetadata)
    .from(submittedProjects)
    .where(eq(submittedProjects.id, id));
  if (!row) throw new E("NOT_FOUND", 404);
  return row;
}
export async function owned(db: Reader, user: AuthUser, id: string) {
  const row = await projectRow(db, id, true);
  if (row.ownerId !== user.id || row.source !== "user")
    throw new E("FORBIDDEN", 403);
  return row;
}
export async function formalVersion(db: Reader, row: Row) {
  if (!row.submittedRevision) return null;
  const [version] = await db
    .select()
    .from(projectVersions)
    .where(
      and(
        eq(projectVersions.projectId, row.id),
        eq(projectVersions.number, row.submittedRevision),
      ),
    );
  if (!version) throw new E("NOT_FOUND", 404);
  return version;
}
export async function checkEvent(
  db: Reader,
  user: AuthUser,
  eventId: string | null,
  now = new Date(),
) {
  if (!eventId) return;
  const event = await readPublishedEvent(eventId, db);
  if (!event) throw new E("EVENT_UNAVAILABLE", 409);
  const [registration] = await db
    .select({ id: eventRegistrations.id })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.userId, user.id),
      ),
    );
  if (!registration) throw new E("REGISTRATION_REQUIRED", 403);
  if (+now < Date.parse(event.submissionOpensAt)) throw new E("NOT_OPEN", 409);
  if (+now >= Date.parse(event.submissionClosesAt)) throw new E("CLOSED", 409);
}
export async function checkEditable(
  db: Reader,
  user: AuthUser,
  row: Row,
  targetEvent = row.eventId,
) {
  if (row.submittedRevision && row.eventId !== targetEvent)
    throw new E("EVENT_LOCKED", 409);
  // Check persisted scope first; changing the form cannot bypass an expired event.
  await checkEvent(db, user, row.eventId);
  if (targetEvent !== row.eventId) await checkEvent(db, user, targetEvent);
}
/** Use the database clock in the actual mutation, not the transaction-start timestamp. */
export async function editFence(db: Reader, eventId: string | null) {
  if (!eventId) return sql`true`;
  const event = await readPublishedEvent(eventId, db);
  if (!event) throw new E("EVENT_UNAVAILABLE", 409);
  return sql`${event.submissionOpensAt}::timestamptz <= clock_timestamp() AND clock_timestamp() < ${event.submissionClosesAt}::timestamptz`;
}
export function toPublic(
  row: Pick<Row, "id" | "publishedAt">,
  input: ProjectInput,
  now = new Date(),
): PublicProject {
  const name = localized(input.name, input.translation.name, input.language);
  return {
    id: row.id,
    name,
    introduction: localized(
      input.tagline,
      input.translation.tagline,
      input.language,
    ),
    creator: { zh: input.creator, en: input.creator },
    category: input.category,
    tags: input.tags.map((v) => ({ zh: v, en: v })),
    eventId: input.eventId,
    demo: false,
    published: true,
    publishedAt: (row.publishedAt ?? now).toISOString(),
    cover: `/api/project-files/${input.coverId}`,
    details: {
      description: [
        localized(
          input.description,
          input.translation.description,
          input.language,
        ),
      ],
      media: [input.coverId, ...input.screenshotIds]
        .filter(Boolean)
        .map((id) => ({ src: `/api/project-files/${id}`, alt: name })),
      links: (
        [
          ["demo", input.demoUrl, { zh: "体验项目", en: "Try project" }],
          ["code", input.codeUrl, { zh: "代码", en: "Code" }],
          ["video", input.videoUrl, { zh: "演示视频", en: "Demo video" }],
        ] as const
      )
        .filter((v) => Boolean(v[1]))
        .map(([kind, href, label]) => ({ kind, href, label })),
    },
  };
}
export function summary(
  row: Row,
  payload?: ProjectInput | null,
): ProjectSummary {
  const publicData = row.live;
  return {
    id: row.id,
    source: row.source,
    name: payload
      ? localized(payload.name, payload.translation.name, payload.language)
      : (publicData?.name ?? { zh: "未命名草稿", en: "Untitled draft" }),
    creator: payload?.creator ?? publicData?.creator.zh ?? "",
    category: payload?.category ?? publicData?.category ?? "other",
    eventId: row.eventId,
    reviewState: row.reviewState,
    publicationState: row.publicationState,
    revision: row.revision,
    draftRevision: row.draftRevision,
    submittedRevision: row.submittedRevision,
    liveRevision: row.liveRevision,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function assetDto(row: typeof projectAssets.$inferSelect): AssetDto {
  return {
    id: row.id,
    purpose: row.purpose,
    name: row.name,
    mediaType: row.mediaType,
    size: row.size,
    href: `/api/project-files/${row.id}`,
  };
}
export async function readPublicProjects(
  db?: Reader,
): Promise<PublicProject[]> {
  db ??= await getDb();
  const rows = await db
    .select({ live: submittedProjects.live })
    .from(submittedProjects)
    .where(
      and(
        eq(submittedProjects.publicationState, "published"),
        eq(submittedProjects.consentRevoked, false),
      ),
    );
  const result: PublicProject[] = [];
  for (const { live } of rows)
    if (live && (!live.eventId || (await readPublishedEvent(live.eventId, db))))
      result.push(live);
  return result;
}
export async function readPublicProject(id: string, db?: Reader) {
  db ??= await getDb();
  const [row] = await db
    .select({ live: submittedProjects.live })
    .from(submittedProjects)
    .where(
      and(
        eq(submittedProjects.id, id),
        eq(submittedProjects.publicationState, "published"),
        eq(submittedProjects.consentRevoked, false),
      ),
    );
  if (
    !row?.live ||
    (row.live.eventId && !(await readPublishedEvent(row.live.eventId, db)))
  )
    return null;
  return row.live;
}

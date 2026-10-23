import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  uuid,
  jsonb,
  integer,
  timestamp,
  boolean,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { users } from "../auth/schema";
import type {
  ProjectInput,
  PublicProject,
  ReviewState,
  PublicationState,
} from "./contracts";
const date = (name: string) => timestamp(name, { withTimezone: true });
export const submittedProjects = pgTable(
  "submitted_projects",
  {
    id: text("id").primaryKey(),
    source: text("source").$type<"user" | "demo">().notNull(),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    creationKey: uuid("creation_key"),
    eventId: text("event_id"),
    draft: jsonb("draft").$type<ProjectInput>(),
    draftRevision: integer("draft_revision").notNull().default(0),
    submittedRevision: integer("submitted_revision").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    reviewState: text("review_state").$type<ReviewState>(),
    publicNote: text("public_note"),
    internalNote: text("internal_note"),
    publicationState: text("publication_state")
      .$type<PublicationState>()
      .notNull()
      .default("unpublished"),
    live: jsonb("live").$type<PublicProject>(),
    liveRevision: integer("live_revision"),
    consentRevoked: boolean("consent_revoked").notNull().default(false),
    publishedAt: date("published_at"),
    createdAt: date("created_at").notNull().defaultNow(),
    updatedAt: date("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("submitted_project_creation_unique").on(
      t.ownerId,
      t.creationKey,
    ),
    index("submitted_project_owner_idx").on(t.ownerId, t.createdAt),
    index("submitted_project_management_idx").on(
      t.publicationState,
      t.reviewState,
      t.updatedAt,
    ),
    check(
      "submitted_project_source",
      sql`(${t.source}='user' AND ${t.ownerId} IS NOT NULL AND ${t.draft} IS NOT NULL AND ${t.creationKey} IS NOT NULL) OR (${t.source}='demo' AND ${t.ownerId} IS NULL AND ${t.draft} IS NULL)`,
    ),
    check(
      "submitted_project_review",
      sql`${t.reviewState} IS NULL OR ${t.reviewState} IN ('pending','approved','rejected')`,
    ),
    check(
      "submitted_project_publication",
      sql`${t.publicationState} IN ('unpublished','published','withdrawn')`,
    ),
    check(
      "submitted_project_live",
      sql`${t.publicationState}<>'published' OR (${t.live} IS NOT NULL AND ${t.liveRevision} IS NOT NULL AND NOT ${t.consentRevoked})`,
    ),
    check(
      "submitted_project_versions",
      sql`${t.revision}>0 AND ${t.draftRevision}>=0 AND ${t.submittedRevision}>=0`,
    ),
  ],
);
export const projectVersions = pgTable(
  "project_submission_versions",
  {
    id: uuid("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => submittedProjects.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    payload: jsonb("payload").$type<ProjectInput>().notNull(),
    submittedAt: date("submitted_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_submission_version_unique").on(t.projectId, t.number),
    check("project_submission_version_positive", sql`${t.number}>0`),
  ],
);
export const projectAssets = pgTable(
  "project_submission_assets",
  {
    id: uuid("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => submittedProjects.id, { onDelete: "restrict" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    purpose: text("purpose")
      .$type<"cover" | "screenshot" | "document">()
      .notNull(),
    name: text("name").notNull(),
    storageName: text("storage_name").notNull().unique(),
    mediaType: text("media_type").notNull(),
    size: integer("size").notNull(),
    createdAt: date("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("project_submission_assets_project_idx").on(t.projectId),
    check(
      "project_submission_asset_purpose",
      sql`${t.purpose} IN ('cover','screenshot','document')`,
    ),
    check("project_submission_asset_size", sql`${t.size}>0`),
  ],
);

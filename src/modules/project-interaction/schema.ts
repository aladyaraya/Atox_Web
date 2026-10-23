import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../auth/schema";
import type { CommentStatus } from "./contracts";
const date = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
export const projectLikes = pgTable(
  "project_likes",
  {
    id: uuid("id").primaryKey(),
    projectId: text("project_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: date("created_at").notNull(),
  },
  (t) => [uniqueIndex("project_likes_project_user").on(t.projectId, t.userId)],
);
export const projectComments = pgTable(
  "project_comments",
  {
    id: uuid("id").primaryKey(),
    projectId: text("project_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body"),
    bodyHash: text("body_hash").notNull(),
    requestId: uuid("request_id").notNull(),
    status: text("status").$type<CommentStatus>().notNull().default("visible"),
    revision: integer("revision").notNull().default(1),
    reason: text("reason"),
    createdAt: date("created_at").notNull(),
    updatedAt: date("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("project_comments_request").on(t.userId, t.requestId),
    index("project_comments_list").on(t.projectId, t.status, t.createdAt),
    index("project_comments_account_rate").on(t.userId, t.createdAt),
    check(
      "project_comments_status",
      sql`${t.status} IN ('visible','hidden','deleted')`,
    ),
    check("project_comments_revision", sql`${t.revision} > 0`),
    check(
      "project_comments_deleted_body",
      sql`(${t.status} = 'deleted' AND ${t.body} IS NULL) OR (${t.status} != 'deleted' AND ${t.body} IS NOT NULL)`,
    ),
  ],
);

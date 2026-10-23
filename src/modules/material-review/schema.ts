import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "../auth/schema";
import type { ReviewMode } from "./contracts";
export const materialReviewPolicies = pgTable(
  "material_review_policies",
  {
    eventId: text("event_id").primaryKey(),
    enabled: boolean("enabled").notNull(),
    mode: text("mode").$type<ReviewMode>().notNull().default("custom"),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    revision: integer("revision").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (table) => [
    check(
      "material_review_policy_period_valid",
      sql`(${table.mode} = 'custom' AND ${table.opensAt} IS NOT NULL AND ${table.closesAt} IS NOT NULL AND ${table.opensAt} < ${table.closesAt}) OR (${table.mode} IN ('event','unlimited') AND ${table.opensAt} IS NULL AND ${table.closesAt} IS NULL)`,
    ),
    check(
      "material_review_policy_mode_valid",
      sql`${table.mode} IN ('event','unlimited','custom')`,
    ),
    check(
      "material_review_policy_revision_positive",
      sql`${table.revision} > 0`,
    ),
  ],
);

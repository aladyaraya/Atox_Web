import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema";
export const accountProfiles = pgTable(
  "account_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    nickname: text("nickname").notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (t) => [check("account_profile_revision", sql`${t.revision} > 0`)],
);

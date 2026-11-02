import { getTableColumns, is, sql } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { schema, type Database } from "./db";

/** Check public structure without reading user rows or granting migration access. */
export async function assertDatabaseSchema(db: Pick<Database, "select">) {
  const columns = await db
    .select({
      table: sql<string>`table_name`,
      column: sql<string>`column_name`,
    })
    .from(sql`information_schema.columns`)
    .where(sql`table_schema = 'public'`);
  const available = new Set(columns.map((row) => row.table + "." + row.column));
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue;
    const name = getTableConfig(value).name;
    for (const column of Object.values(getTableColumns(value)))
      if (!available.has(name + "." + column.name))
        throw new Error("Database schema is not current");
  }
  const indexes = await db
    .select({ name: sql<string>`indexname` })
    .from(sql`pg_indexes`)
    .where(
      sql`schemaname = 'public' AND indexname = 'send_events_created_at_idx'`,
    );
  if (indexes.length !== 1) throw new Error("Database schema is not current");
}

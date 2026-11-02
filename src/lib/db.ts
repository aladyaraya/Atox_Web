import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import { migrate as postgresMigrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import path from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

export { schema };

function createLocalDatabase() {
  // Runtime data is not a build asset; keep it out of Next.js file tracing.
  const dataDirectory = path.resolve(
    /* turbopackIgnore: true */ process.env.DB_PATH || ".data/pglite",
  );
  mkdirSync(path.dirname(dataDirectory), { recursive: true });
  const client = new PGlite(dataDirectory);
  return { client, db: drizzle(client, { schema }) };
}

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
const globalDb = globalThis as typeof globalThis & {
  __hackathonDatabase?: Promise<Database>;
  __hackathonClient?: PGlite;
  __hackathonPool?: Pool;
  __databaseWriteQueue?: Promise<unknown>;
};

/** Writes share one queue across business modules and HMR.
 * Queue the complete transaction; never call recursively from a queued write.
 */
export async function serializeDatabaseWrite<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const result = (globalDb.__databaseWriteQueue ?? Promise.resolve()).then(
    operation,
    operation,
  );
  globalDb.__databaseWriteQueue = result.catch(() => undefined);
  return result;
}

export async function getDb(): Promise<Database> {
  if (!globalDb.__hackathonDatabase) {
    globalDb.__hackathonDatabase = (async () => {
      if (process.env.DATABASE_DRIVER === "postgres") {
        const connectionString = process.env.DATABASE_URL;
        if (
          !connectionString ||
          !/^postgres(?:ql)?:\/\//.test(connectionString)
        )
          throw new Error("PostgreSQL configuration is missing");
        const pool = new Pool({
          connectionString,
          max: 10,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          application_name: "atox-web",
        });
        // Never log driver errors: connection details can contain credentials.
        pool.on("error", () =>
          console.error("PostgreSQL idle connection failed"),
        );
        globalDb.__hackathonPool = pool;
        const db = postgresDrizzle(pool, { schema });
        try {
          await pool.query("SELECT 1");
          if (process.env.DATABASE_AUTO_MIGRATE === "true") {
            if (process.env.NODE_ENV === "production")
              throw new Error("Production migrations must run offline");
            await postgresMigrate(db, {
              migrationsFolder: path.resolve("drizzle"),
            });
          }
          return db;
        } catch {
          await pool.end();
          delete globalDb.__hackathonPool;
          throw new Error("PostgreSQL initialization failed");
        }
      }
      if (
        process.env.DATABASE_DRIVER &&
        process.env.DATABASE_DRIVER !== "pglite"
      )
        throw new Error("Unknown database driver");
      if (process.env.DEPLOYMENT_MODE === "production")
        throw new Error("Released websites require PostgreSQL");
      const { client, db } = createLocalDatabase();
      globalDb.__hackathonClient = client;
      try {
        await migrate(db, { migrationsFolder: path.resolve("drizzle") });
        return db;
      } catch (error) {
        await client.close();
        delete globalDb.__hackathonClient;
        throw error;
      }
    })().catch((error) => {
      delete globalDb.__hackathonDatabase;
      throw error;
    });
  }
  return globalDb.__hackathonDatabase;
}

/** Call only after requests/transactions have stopped (tests and migration CLI). */
export async function closeDb(): Promise<void> {
  const initializing = globalDb.__hackathonDatabase;
  if (!initializing) return;
  try {
    await initializing;
    await globalDb.__hackathonClient?.close();
    await globalDb.__hackathonPool?.end();
  } finally {
    delete globalDb.__hackathonDatabase;
    delete globalDb.__hackathonClient;
    delete globalDb.__hackathonPool;
  }
}

/** Dedicated offline deployment job; does not alter historical migration SQL. */
export async function migrateDatabase() {
  if (process.env.DATABASE_DRIVER !== "postgres") {
    await getDb();
    return;
  }
  const db = await getDb();
  if (!globalDb.__hackathonPool)
    throw new Error("PostgreSQL is not initialized");
  // A single deployment operator owns this session lock across all migrations.
  const lock = await globalDb.__hackathonPool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock(160016)");
    await postgresMigrate(
      db as ReturnType<typeof postgresDrizzle<typeof schema>>,
      { migrationsFolder: path.resolve("drizzle") },
    );
  } finally {
    await lock.query("SELECT pg_advisory_unlock(160016)");
    lock.release();
  }
}

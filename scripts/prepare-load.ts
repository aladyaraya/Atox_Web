/** Offline synthetic fixtures ONLY. Refuses the real deployment database name. */
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/lib/db";
import { users, sessions } from "../src/modules/auth/schema";
import { eventRegistrations } from "../src/modules/event-participation/schema";
import { managedContent } from "../src/modules/content-management/schema";
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (
    process.env.DATABASE_DRIVER !== "postgres" ||
    !/^atox_load_[a-z0-9_]+$/.test(url.pathname.slice(1)) ||
    process.env.LOAD_ACK !== "synthetic-isolated-data-only"
  )
    throw new Error();
  const eventId = process.env.LOAD_EVENT_ID;
  const db = await getDb();
  const [content] = await db
    .select()
    .from(managedContent)
    .where(eq(managedContent.id, eventId || ""));
  const event =
    content?.kind === "event" && content.state === "published"
      ? content.live
      : null;
  if (
    !event ||
    !("submissionClosesAt" in event) ||
    event.demo ||
    !event.published ||
    Date.now() < Date.parse(event.submissionOpensAt) ||
    Date.now() >= Date.parse(event.submissionClosesAt)
  )
    throw new Error(
      "Publish an explicitly open non-demo staging activity first; this script never changes its dates",
    );
  const existing = await db.select({ id: users.id }).from(users).limit(2);
  if (
    existing.length !== 1 ||
    existing[0].id !== process.env.LOAD_OPERATOR_USER_ID
  )
    throw new Error(
      "Only the explicitly identified staging operator may exist before seeding",
    );
  const fixtures: Array<{ id: string; cookie: string }> = [];
  for (let batch = 0; batch < 10; batch++) {
    const userRows: Array<typeof users.$inferInsert> = [],
      sessionRows: Array<typeof sessions.$inferInsert> = [],
      registrations: Array<typeof eventRegistrations.$inferInsert> = [];
    for (let i = 0; i < 1000; i++) {
      const id = randomUUID(),
        token = randomBytes(32).toString("hex"),
        now = new Date();
      userRows.push({
        id,
        email: `synthetic-${batch}-${i}@load.example.test`,
        createdAt: now,
      });
      sessionRows.push({
        id: randomUUID(),
        userId: id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        createdAt: now,
        expiresAt: new Date(Date.now() + 86400000),
      });
      registrations.push({
        id: randomUUID(),
        eventId: eventId!,
        userId: id,
        displayName: "Synthetic load fixture",
        role: "developer" as const,
        country: "TEST",
        acceptedTerms: true,
      });
      fixtures.push({ id, cookie: token });
    }
    await db.transaction(async (tx) => {
      await tx.insert(users).values(userRows);
      await tx.insert(sessions).values(sessionRows);
      await tx.insert(eventRegistrations).values(registrations);
    });
  }
  const directory = path.resolve(".data/load");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "fixtures.json"),
    JSON.stringify({ eventId, users: fixtures }),
    { mode: 0o600 },
  );
  await writeFile(
    path.join(directory, "upload.png"),
    await sharp({
      create: { width: 12, height: 12, channels: 3, background: "#b899ff" },
    })
      .png()
      .toBuffer(),
    { mode: 0o600 },
  );
  console.log(
    "Prepared 10000 synthetic accounts and sessions in an isolated load DB. Fixture cookies are private and expire in 24h. Do not upload fixtures/results.",
  );
}
main()
  .catch(() => {
    console.error(
      "Load preparation refused or failed; verify dedicated atox_load_* database, acknowledgment and published activity. Do not reset a nonempty database.",
    );
    process.exitCode = 1;
  })
  .finally(closeDb);

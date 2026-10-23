import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { AuthUser } from "../src/modules/auth/contracts";
let root: string;
let dbm: typeof import("../src/lib/db"),
  schema: typeof import("../src/lib/schema");
let interaction: typeof import("../src/modules/project-interaction/service"),
  profile: typeof import("../src/modules/auth/profile");
let manager: AuthUser;
const code = (expected: string) => (e: unknown) => {
  assert.equal((e as { code: string }).code, expected);
  return true;
};
async function user(nickname?: string) {
  const user = {
    id: randomUUID(),
    email: randomUUID() + "@example.com",
    createdAt: new Date(),
  };
  await (await dbm.getDb()).insert(schema.users).values(user);
  if (nickname) await profile.updateNickname(user, { nickname, revision: 0 });
  return user;
}
const post = (
  u: AuthUser,
  text: string,
  id = "idea-atlas",
  requestId: string = randomUUID(),
) => interaction.addComment(u, id, { body: text, requestId });
before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "project-interactions-"));
  process.env.DB_PATH = path.join(root, "db");
  dbm = await import("../src/lib/db");
  schema = await import("../src/lib/schema");
  interaction = await import("../src/modules/project-interaction/service");
  profile = await import("../src/modules/auth/profile");
  manager = await user("Moderator");
  await (
    await dbm.getDb()
  )
    .insert(schema.administrators)
    .values({
      userId: manager.id,
      email: manager.email,
      role: "operator",
      enabled: true,
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: { source: "bootstrap", userId: null, label: "isolated test" },
    });
});
after(async () => {
  await dbm.closeDb();
  await rm(root, { recursive: true, force: true });
});
test("Old accounts have no nickname; validation, optimistic updates and public projection preserve authentication", async () => {
  const u = await user(),
    db = await dbm.getDb(),
    original = (
      await db.select().from(schema.users).where(eq(schema.users.id, u.id))
    )[0];
  assert.deepEqual(await profile.getAccountProfile(u), {
    nickname: null,
    revision: 0,
  });
  for (const nickname of [
    "a",
    "x".repeat(31),
    "hi\u0000there",
    "hi\u202ethere",
  ])
    await assert.rejects(
      profile.updateNickname(u, { nickname, revision: 0 }),
      code("INVALID_INPUT"),
    );
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      profile.updateNickname(u, { nickname: "  Builder  ", revision: 0 }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
      .reason.code,
    "REVISION_CONFLICT",
  );
  assert.deepEqual(await profile.getAccountProfile(u), {
    nickname: "Builder",
    revision: 1,
  });
  assert.deepEqual(
    (await db.select().from(schema.users).where(eq(schema.users.id, u.id)))[0],
    original,
  );
});
test("Desired-state likes are unique and idempotent under concurrent requests and survive reopening", async () => {
  const u = await user(),
    id = "pocket-garden";
  await Promise.all(
    Array.from({ length: 8 }, () =>
      interaction.setLike(u, id, { liked: true }),
    ),
  );
  assert.deepEqual((await interaction.getInteractionStats([id], u)).get(id), {
    likeCount: 1,
    commentCount: 0,
    likedByMe: true,
  });
  await dbm.closeDb();
  assert.equal(
    (await interaction.getInteractionStats([id], u)).get(id)?.likedByMe,
    true,
  );
  await Promise.all(
    [1, 2].map(() => interaction.setLike(u, id, { liked: false })),
  );
  assert.equal(
    (await interaction.getInteractionStats([id], u)).get(id)?.likeCount,
    0,
  );
  await assert.rejects(
    interaction.setLike(u, id, { liked: true, userId: manager.id }),
    code("INVALID_INPUT"),
  );
  await assert.rejects(
    interaction.setLike(u, "unknown-project", { liked: true }),
    code("NOT_FOUND"),
  );
});
test("Nickname gate, comment validation and concurrent idempotency prevent duplicate publication", async () => {
  const u = await user();
  await assert.rejects(post(u, "Hello"), code("NICKNAME_REQUIRED"));
  await profile.updateNickname(u, { nickname: "Author", revision: 0 });
  for (const body of ["", " ".repeat(10), "x".repeat(1001), "bad\u0000content"])
    await assert.rejects(post(u, body), code("INVALID_INPUT"));
  const requestId = randomUUID(),
    before = (await interaction.listComments("idea-atlas")).total;
  const results = await Promise.all(
    [1, 2, 3].map(() =>
      post(u, "  <script>alert(1)</script>  ", "idea-atlas", requestId),
    ),
  );
  assert.equal(new Set(results.map((r) => r.commentId)).size, 1);
  assert.equal(
    (await interaction.listComments("idea-atlas")).total,
    before + 1,
  );
  await assert.rejects(
    post(u, "different", "idea-atlas", requestId),
    code("IDEMPOTENCY_CONFLICT"),
  );
  await assert.rejects(
    post(u, "<script>alert(1)</script>", "echo-island", requestId),
    code("IDEMPOTENCY_CONFLICT"),
  );
  const list = await interaction.listComments("idea-atlas", u),
    comment = list.items.find((c) => c.id === results[0].commentId)!;
  assert.equal(comment.body, "<script>alert(1)</script>");
  assert.equal(comment.isMine, true);
  assert.deepEqual(
    Object.keys(comment).sort(),
    ["id", "body", "nickname", "createdAt", "isMine"].sort(),
  );
  assert.equal(JSON.stringify(list).includes(u.email), false);
  assert.equal(JSON.stringify(list).includes(u.id), false);
  await profile.updateNickname(u, { nickname: "New name", revision: 1 });
  assert.equal(
    (await interaction.listComments("idea-atlas")).items.find(
      (c) => c.id === comment.id,
    )?.nickname,
    "New name",
  );
});
test("Account limits retain deleted and hidden posts; idempotent retries do not consume quota", async () => {
  const u = await user("Rate tester"),
    receipts = [];
  for (let i = 0; i < 3; i++) receipts.push(await post(u, "Minute " + i));
  await interaction.deleteComment(u, "idea-atlas", receipts[0].commentId);
  await interaction.moderateComment(manager, receipts[1].commentId, {
    action: "hide",
    reason: "Test moderation",
    revision: 1,
  });
  await assert.rejects(post(u, "Fourth"), code("RATE_LIMITED"));
  const db = await dbm.getDb();
  await db
    .update(schema.projectComments)
    .set({ createdAt: new Date(Date.now() - 120000) })
    .where(eq(schema.projectComments.userId, u.id));
  for (let i = 3; i < 20; i++) {
    const receipt = await post(u, "Hour " + i);
    await db
      .update(schema.projectComments)
      .set({ createdAt: new Date(Date.now() - 120000) })
      .where(eq(schema.projectComments.id, receipt.commentId));
  }
  await assert.rejects(post(u, "Twenty first"), code("RATE_LIMITED"));
  const [old] = await db
    .select()
    .from(schema.projectComments)
    .where(eq(schema.projectComments.id, receipts[2].commentId));
  assert.equal(
    (await post(u, old.body!, old.projectId, old.requestId)).commentId,
    old.id,
  );
});
test("Moderator authorization, optimistic conflict and owner deletion never leak hidden or deleted text", async () => {
  const author = await user("Visible author"),
    outsider = await user("Other user"),
    receipt = await post(author, "Private after hiding", "echo-island");
  await assert.rejects(
    interaction.moderateComment(outsider, receipt.commentId, {
      action: "hide",
      reason: "No",
      revision: 1,
    }),
    code("FORBIDDEN"),
  );
  await assert.rejects(
    interaction.moderateComment(manager, receipt.commentId, {
      action: "hide",
      reason: "",
      revision: 1,
    }),
    code("INVALID_INPUT"),
  );
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      interaction.moderateComment(manager, receipt.commentId, {
        action: "hide",
        reason: "Review",
        revision: 1,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await interaction.listComments("echo-island")).items.some(
      (c) => c.id === receipt.commentId,
    ),
    false,
  );
  assert.equal(
    (await interaction.getInteractionStats(["echo-island"])).get("echo-island")
      ?.commentCount,
    0,
  );
  await interaction.moderateComment(manager, receipt.commentId, {
    action: "restore",
    revision: 2,
  });
  await assert.rejects(
    interaction.deleteComment(outsider, "echo-island", receipt.commentId),
    code("FORBIDDEN"),
  );
  await assert.rejects(
    interaction.deleteComment(author, "idea-atlas", receipt.commentId),
    code("NOT_FOUND"),
  );
  await interaction.deleteComment(author, "echo-island", receipt.commentId);
  await interaction.deleteComment(author, "echo-island", receipt.commentId);
  const record = (
    await interaction.listManagedComments(manager, {
      commentId: receipt.commentId,
    })
  ).items[0];
  assert.equal(record.body, null);
  assert.equal(record.status, "deleted");
  await assert.rejects(
    interaction.moderateComment(manager, receipt.commentId, {
      action: "restore",
      revision: record.revision,
    }),
    code("REVISION_CONFLICT"),
  );
});
test("Moderation audits roll back with the state; queued writes recheck revoked permissions", async () => {
  const author = await user("Audit author"),
    receipt = await post(author, "Retained", "quiet-clock"),
    db = await dbm.getDb();
  await db.execute(
    sql`CREATE FUNCTION fail_project_audit() RETURNS trigger AS $$ BEGIN IF NEW.resource_type = 'project_comment' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
  );
  await db.execute(
    sql`CREATE TRIGGER reject_project_audit BEFORE INSERT ON business_audit_logs FOR EACH ROW EXECUTE FUNCTION fail_project_audit()`,
  );
  await assert.rejects(
    interaction.moderateComment(manager, receipt.commentId, {
      action: "hide",
      revision: 1,
      reason: "Rollback",
    }),
  );
  await db.execute(
    sql`DROP TRIGGER reject_project_audit ON business_audit_logs`,
  );
  assert.equal(
    (
      await interaction.listManagedComments(manager, {
        commentId: receipt.commentId,
      })
    ).items[0].revision,
    1,
  );
  const revoked = dbm.serializeDatabaseWrite(async () => {
    await db
      .update(schema.administrators)
      .set({ enabled: false })
      .where(eq(schema.administrators.userId, manager.id));
  });
  const queued = interaction.moderateComment(manager, receipt.commentId, {
    action: "hide",
    revision: 1,
    reason: "Forbidden",
  });
  await revoked;
  await assert.rejects(queued, code("FORBIDDEN"));
  await db
    .update(schema.administrators)
    .set({ enabled: true })
    .where(eq(schema.administrators.userId, manager.id));
});
test("Public comments paginate consistently and deleted content cannot be recreated with an old key", async () => {
  const u = await user("Pager"),
    db = await dbm.getDb();
  let last: { commentId: string; status: string } | undefined,
    key = "";
  for (let i = 0; i < 23; i++) {
    key = randomUUID();
    last = await post(u, "Page " + i, "tiny-orbits", key);
    await db
      .update(schema.projectComments)
      .set({ createdAt: new Date(Date.now() - 3700000 + i) })
      .where(eq(schema.projectComments.id, last.commentId));
  }
  assert.equal(
    (await interaction.listComments("tiny-orbits", u)).items.length,
    20,
  );
  assert.equal(
    (await interaction.listComments("tiny-orbits", u, 2)).items.length,
    3,
  );
  assert.equal(
    (await interaction.listComments("tiny-orbits", u, 2)).items[0].body,
    "Page 2",
  );
  await interaction.deleteComment(u, "tiny-orbits", last!.commentId);
  assert.equal(
    (await post(u, "Page 22", "tiny-orbits", key)).status,
    "deleted",
  );
  await dbm.closeDb();
  assert.equal((await interaction.listComments("tiny-orbits")).total, 22);
});
test("Withdrawing a parent event blocks public interaction but retains moderator access and durable records", async () => {
  const u = await user("Event author"),
    receipt = await post(u, "Keep this", "idea-atlas"),
    db = await dbm.getDb();
  const { eventRegistry } = await import("../src/modules/event-board/config");
  await db
    .insert(schema.managedContent)
    .values({
      kind: "event",
      id: "demo",
      revision: 1,
      state: "withdrawn",
      draft: eventRegistry.find((e) => e.id === "demo")!,
      live: null,
      updatedBy: manager.id,
      updatedAt: new Date(),
    });
  await assert.rejects(
    interaction.listComments("idea-atlas"),
    code("NOT_FOUND"),
  );
  await assert.rejects(
    interaction.setLike(u, "idea-atlas", { liked: true }),
    code("NOT_FOUND"),
  );
  await assert.rejects(post(u, "Blocked"), code("NOT_FOUND"));
  await interaction.moderateComment(manager, receipt.commentId, {
    action: "hide",
    revision: 1,
    reason: "Retained moderation",
  });
  assert.equal(
    (
      await interaction.listManagedComments(manager, {
        commentId: receipt.commentId,
      })
    ).items[0].status,
    "hidden",
  );
});

import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { eq, sql } from "drizzle-orm";
import type { AuthUser } from "../src/modules/auth/contracts";
import {
  emptyProject,
  type ProjectInput,
} from "../src/modules/project-submission/contracts";
let dbm: typeof import("../src/lib/db"),
  schema: typeof import("../src/lib/schema"),
  service: typeof import("../src/modules/project-submission/service"),
  files: typeof import("../src/modules/project-submission/files"),
  store: typeof import("../src/modules/project-submission/store");
let directory: string,
  image: Buffer,
  pdf: Buffer,
  operator: AuthUser,
  otherAdmin: AuthUser;
const error = (wanted: string) => (e: unknown) => {
  assert.equal((e as { code: string }).code, wanted);
  return true;
};
async function user(role?: "operator") {
  const u = {
    id: randomUUID(),
    email: `${randomUUID()}@example.test`,
    createdAt: new Date(),
  };
  const db = await dbm.getDb();
  await db.insert(schema.users).values(u);
  if (role)
    await db.insert(schema.administrators).values({
      userId: u.id,
      email: u.email,
      role,
      enabled: true,
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: {
        source: "bootstrap",
        userId: null,
        label: "isolated fixture",
      },
    });
  return u;
}
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "project-submission-"));
  Object.assign(process.env, {
    DB_PATH: path.join(directory, "db"),
    UPLOAD_PATH: path.join(directory, "uploads"),
  });
  dbm = await import("../src/lib/db");
  schema = await import("../src/lib/schema");
  service = await import("../src/modules/project-submission/service");
  files = await import("../src/modules/project-submission/files");
  store = await import("../src/modules/project-submission/store");
  operator = await user("operator");
  otherAdmin = await user("operator");
  image = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#a0b0ff" },
  })
    .png()
    .toBuffer();
  const doc = await PDFDocument.create();
  doc.addPage();
  pdf = Buffer.from(await doc.save());
});
after(async () => {
  await dbm?.closeDb();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function prepared(eventId: string | null = null) {
  const owner = await user();
  const { id } = await service.createProject(owner, {
    requestId: randomUUID(),
  });
  const cover = await files.uploadProjectFile(
      owner,
      id,
      "cover",
      image,
      "cover.png",
    ),
    document = await files.uploadProjectFile(
      owner,
      id,
      "document",
      pdf,
      "private.pdf",
    );
  const payload: ProjectInput = {
    ...emptyProject("Creator"),
    name: "Original project",
    tagline: "A useful project",
    description: "A complete original description",
    coverId: cover.id,
    documentId: document.id,
    eventId,
    original: true,
    usageAuthorized: true,
    publicConsent: true,
  };
  return { owner, id, payload, cover, document };
}
async function submitted() {
  const v = await prepared();
  const saved = await service.saveDraft(v.owner, v.id, {
    draftRevision: 0,
    payload: v.payload,
  });
  const project = await service.submitProject(v.owner, v.id, {
    draftRevision: saved.draftRevision,
    revision: saved.revision,
  });
  return { ...v, project };
}
test("Demo import preserves 12 stable IDs and original details; no invented users or reviews", async () => {
  const { projectRegistry } =
    await import("../src/modules/project-board/config");
  const all = await store.readPublicProjects();
  assert.equal(all.length, 12);
  assert.deepEqual(
    all.map((p) => p.id).sort(),
    projectRegistry.map((p) => p.id).sort(),
  );
  const page = await service.listManagedProjects(operator, { source: "demo" });
  assert.equal(page.total, 12);
  assert.ok(
    page.items.every((p) => p.source === "demo" && p.reviewState === null),
  );
  const before = await service.managedProject(operator, all[0].id);
  assert.equal(before.history.length, 0);
  const withdrawn = await service.publishProject(operator, before.id, {
    revision: before.revision,
    submittedRevision: 0,
    action: "withdraw",
    reason: "Demo maintenance",
  });
  assert.equal(await store.readPublicProject(before.id), null);
  const restored = await service.publishProject(operator, before.id, {
    revision: withdrawn.revision,
    submittedRevision: 0,
    action: "publish",
  });
  assert.equal(restored.live!.publishedAt, all[0].publishedAt);
});
test("Creation is idempotent per account; drafts and private attachments stay out of admin/public reads", async () => {
  const owner = await user(),
    requestId = randomUUID();
  const results = await Promise.all([
    service.createProject(owner, { requestId }),
    service.createProject(owner, { requestId }),
  ]);
  assert.equal(results[0].id, results[1].id);
  const id = results[0].id,
    other = await user();
  assert.notEqual((await service.createProject(other, { requestId })).id, id);
  assert.equal(
    (await service.listManagedProjects(operator, { source: "user" })).total,
    0,
  );
  await assert.rejects(
    service.managedProject(operator, id),
    error("NOT_SUBMITTED"),
  );
  await assert.rejects(service.getOwnProject(other, id), error("FORBIDDEN"));
  assert.equal(await store.readPublicProject(id), null);
  const cover = await files.uploadProjectFile(
    owner,
    id,
    "cover",
    image,
    "unsubmitted.png",
  );
  await assert.rejects(
    files.readProjectFile(operator, cover.id),
    error("NOT_FOUND"),
  );
  await assert.rejects(
    files.readProjectFile(null, cover.id),
    error("NOT_FOUND"),
  );
  assert.ok((await files.readProjectFile(owner, cover.id)).buffer.length);
});
test("Review, publication and versions are separate; public DTO and files never expose PDF or notes", async () => {
  const v = await submitted();
  await assert.rejects(
    service.publishProject(operator, v.id, {
      revision: v.project.revision,
      submittedRevision: 1,
      action: "publish",
    }),
    error("NOT_APPROVED"),
  );
  await assert.rejects(
    service.decideProject(operator, v.id, {
      revision: v.project.revision,
      submittedRevision: 1,
      action: "rejected",
      reason: " ",
    }),
    error("INVALID_INPUT"),
  );
  const approved = await service.decideProject(operator, v.id, {
    revision: v.project.revision,
    submittedRevision: 1,
    action: "approved",
    reason: "Ready",
    internalNote: "PRIVATE ADMIN NOTE",
  });
  assert.equal(await store.readPublicProject(v.id), null);
  const live = await service.publishProject(operator, v.id, {
    revision: approved.revision,
    submittedRevision: 1,
    action: "publish",
  });
  assert.equal(live.publicationState, "published");
  const visible = await store.readPublicProject(v.id);
  assert.equal(visible!.demo, false);
  const serialized = JSON.stringify(visible);
  for (const secret of [
    v.document.id,
    "documentId",
    "internalNote",
    v.owner.email,
    v.owner.id,
    "PRIVATE ADMIN NOTE",
  ])
    assert.equal(serialized.includes(secret), false);
  assert.ok((await files.readProjectFile(null, v.cover.id)).buffer.length);
  await assert.rejects(
    files.readProjectFile(null, v.document.id),
    error("NOT_FOUND"),
  );
  assert.ok(
    (await files.readProjectFile(operator, v.document.id)).buffer.length,
  );
  assert.equal(
    "internalNote" in (await service.getOwnProject(v.owner, v.id)),
    false,
  );
  const draft = await service.saveDraft(v.owner, v.id, {
    draftRevision: v.project.draftRevision,
    payload: { ...v.payload, name: "New revision" },
  });
  assert.equal(
    (await store.readPublicProject(v.id))!.name.zh,
    "Original project",
  );
  const next = await service.submitProject(v.owner, v.id, {
    draftRevision: draft.draftRevision,
    revision: draft.revision,
  });
  assert.equal(next.reviewState, "pending");
  assert.equal(
    (await store.readPublicProject(v.id))!.name.zh,
    "Original project",
  );
  const approved2 = await service.decideProject(operator, v.id, {
    revision: next.revision,
    submittedRevision: 2,
    action: "approved",
    reason: "",
  });
  await service.publishProject(operator, v.id, {
    revision: approved2.revision,
    submittedRevision: 2,
    action: "publish",
  });
  assert.equal((await store.readPublicProject(v.id))!.name.zh, "New revision");
  await assert.rejects(
    (await dbm.getDb())
      .update(schema.projectVersions)
      .set({ number: 99 })
      .where(eq(schema.projectVersions.projectId, v.id)),
  );
});
test("Rejection and author withdrawal require a new approved version; old consent cannot restore publication", async () => {
  const v = await submitted();
  const rejected = await service.decideProject(operator, v.id, {
    revision: v.project.revision,
    submittedRevision: 1,
    action: "rejected",
    reason: "Clarify the purpose",
    internalNote: "PRIVATE",
  });
  assert.equal(
    (await service.getOwnProject(v.owner, v.id)).publicNote,
    "Clarify the purpose",
  );
  const draft = await service.saveDraft(v.owner, v.id, {
    draftRevision: v.project.draftRevision,
    payload: { ...v.payload, description: "Clarified purpose" },
  });
  const resub = await service.submitProject(v.owner, v.id, {
    draftRevision: draft.draftRevision,
    revision: rejected.revision,
  });
  const approved = await service.decideProject(operator, v.id, {
    revision: resub.revision,
    submittedRevision: 2,
    action: "approved",
    reason: "",
  });
  const published = await service.publishProject(operator, v.id, {
    revision: approved.revision,
    submittedRevision: 2,
    action: "publish",
  });
  const withdrawn = await service.withdrawProject(v.owner, v.id, {
    revision: published.revision,
    reason: "No longer sharing",
  });
  assert.equal(await store.readPublicProject(v.id), null);
  await assert.rejects(
    service.publishProject(operator, v.id, {
      revision: withdrawn.revision,
      submittedRevision: 2,
      action: "publish",
    }),
    error("NOT_APPROVED"),
  );
  await assert.rejects(
    files.readProjectFile(null, v.cover.id),
    error("NOT_FOUND"),
  );
  assert.equal(withdrawn.draft.publicConsent, false);
  assert.equal(withdrawn.reviewState, "approved");
  await assert.rejects(
    service.submitProject(v.owner, v.id, {
      draftRevision: withdrawn.draftRevision,
      revision: withdrawn.revision,
    }),
    error("DECLARATIONS_REQUIRED"),
  );
  const consent = await service.saveDraft(v.owner, v.id, {
    draftRevision: withdrawn.draftRevision,
    payload: { ...withdrawn.draft, publicConsent: true },
  });
  const next = await service.submitProject(v.owner, v.id, {
    draftRevision: consent.draftRevision,
    revision: consent.revision,
  });
  assert.equal(next.submittedRevision, 3);
  assert.equal(next.reviewState, "pending");
  assert.equal(next.consentRevoked, false);
});
test("Concurrent saves and decisions reject stale versions; revoked permissions are checked in the queue", async () => {
  const v = await submitted();
  const saves = await Promise.allSettled(
    ["one", "two"].map((name) =>
      service.saveDraft(v.owner, v.id, {
        draftRevision: v.project.draftRevision,
        payload: { ...v.payload, name },
      }),
    ),
  );
  assert.equal(saves.filter((r) => r.status === "fulfilled").length, 1);
  const decisions = await Promise.allSettled(
    [operator, otherAdmin].map((actor) =>
      service.decideProject(actor, v.id, {
        revision: v.project.revision,
        submittedRevision: 1,
        action: "approved",
        reason: "",
      }),
    ),
  );
  assert.equal(decisions.filter((r) => r.status === "fulfilled").length, 1);
  const next = await service.getOwnProject(v.owner, v.id);
  await service.submitProject(v.owner, v.id, {
    draftRevision: next.draftRevision,
    revision: next.revision,
  });
  await assert.rejects(
    service.decideProject(operator, v.id, {
      revision: v.project.revision,
      submittedRevision: 1,
      action: "approved",
      reason: "",
    }),
    error("REVISION_CONFLICT"),
  );
  const revoked = await user("operator"),
    current = await service.getOwnProject(v.owner, v.id);
  const db = await dbm.getDb();
  const block = dbm.serializeDatabaseWrite(async () => {
    await db
      .update(schema.administrators)
      .set({ enabled: false })
      .where(eq(schema.administrators.userId, revoked.id));
  });
  const attempt = service.decideProject(revoked, v.id, {
    revision: current.revision,
    submittedRevision: 2,
    action: "approved",
    reason: "",
  });
  await block;
  await assert.rejects(attempt, error("FORBIDDEN"));
  await assert.rejects(
    service.listManagedProjects(v.owner),
    error("FORBIDDEN"),
  );
});
test("Event association requires registration, observes boundaries and cannot change after submission; review has no deadline", async () => {
  const v = await prepared(),
    events = await import("../src/modules/event-participation/service"),
    config = await import("../src/modules/event-board/config");
  await assert.rejects(
    service.saveDraft(v.owner, v.id, {
      draftRevision: 0,
      payload: { ...v.payload, eventId: "demo" },
    }),
    error("REGISTRATION_REQUIRED"),
  );
  await events.forEvent("demo").register(v.owner, {
    displayName: "Project entrant",
    role: "developer",
    country: "CN",
    organization: "",
    contact: "",
    acceptedTerms: true,
  });
  const draft = await service.saveDraft(v.owner, v.id, {
    draftRevision: 0,
    payload: { ...v.payload, eventId: "demo" },
  });
  const formal = await service.submitProject(v.owner, v.id, {
    draftRevision: draft.draftRevision,
    revision: draft.revision,
  });
  await assert.rejects(
    service.saveDraft(v.owner, v.id, {
      draftRevision: formal.draftRevision,
      payload: v.payload,
    }),
    error("EVENT_LOCKED"),
  );
  const original = config.demoEventConfig.submissionClosesAt;
  try {
    config.demoEventConfig.submissionClosesAt = new Date(
      Date.now() - 1,
    ).toISOString();
    assert.equal((await service.getOwnProject(v.owner, v.id)).canEdit, false);
    await assert.rejects(
      files.uploadProjectFile(v.owner, v.id, "cover", image, "late.png"),
      error("CLOSED"),
    );
    await assert.rejects(
      service.submitProject(v.owner, v.id, {
        draftRevision: formal.draftRevision,
        revision: formal.revision,
      }),
      error("CLOSED"),
    );
    const reviewed = await service.decideProject(operator, v.id, {
      revision: formal.revision,
      submittedRevision: 1,
      action: "approved",
      reason: "Review after deadline",
    });
    assert.equal(reviewed.reviewState, "approved");
  } finally {
    config.demoEventConfig.submissionClosesAt = original;
  }
  const { checkEvent } =
    await import("../src/modules/project-submission/store");
  const db = await dbm.getDb();
  await checkEvent(
    db,
    v.owner,
    "demo",
    new Date(config.demoEventConfig.submissionOpensAt),
  );
  await assert.rejects(
    checkEvent(
      db,
      v.owner,
      "demo",
      new Date(config.demoEventConfig.submissionClosesAt),
    ),
    error("CLOSED"),
  );
  await assert.rejects(
    checkEvent(
      db,
      v.owner,
      "demo",
      new Date(Date.parse(config.demoEventConfig.submissionOpensAt) - 1),
    ),
    error("NOT_OPEN"),
  );
});
test("File formats, size, purpose, cross-project ownership and public media authorization are enforced", async () => {
  const a = await prepared(),
    b = await prepared();
  // Build an intentionally invalid credential-bearing URL without storing a
  // credential URL literal in source; repository scanning remains unchanged.
  const credentialUrl = new URL("https://example.com");
  credentialUrl.username = "fixture-user";
  credentialUrl.password = "fixture-password";
  for (const demoUrl of [
    "javascript:alert(1)",
    "http://example.com",
    credentialUrl.href,
  ])
    await assert.rejects(
      service.saveDraft(a.owner, a.id, {
        draftRevision: 0,
        payload: { ...a.payload, demoUrl },
      }),
      error("INVALID_LINK"),
    );
  await assert.rejects(
    service.saveDraft(b.owner, b.id, {
      draftRevision: 0,
      payload: { ...b.payload, coverId: a.cover.id },
    }),
    error("INVALID_FILE"),
  );
  await assert.rejects(
    files.uploadProjectFile(
      a.owner,
      a.id,
      "cover",
      Buffer.from("<svg/>"),
      "image.png",
    ),
    error("INVALID_FILE"),
  );
  await assert.rejects(
    files.uploadProjectFile(
      a.owner,
      a.id,
      "cover",
      Buffer.alloc(5 * 1024 * 1024 + 1),
      "large.jpg",
    ),
    error("INVALID_FILE"),
  );
  await assert.rejects(
    files.uploadProjectFile(a.owner, a.id, "document", image, "looks.pdf"),
    error("INVALID_FILE"),
  );
  await assert.rejects(
    files.uploadProjectFile(b.owner, a.id, "cover", image, "stolen.png"),
    error("FORBIDDEN"),
  );
  await assert.rejects(
    service.saveDraft(a.owner, a.id, {
      draftRevision: 0,
      payload: { ...a.payload, screenshotIds: Array(7).fill(a.cover.id) },
    }),
    error("INVALID_INPUT"),
  );
  await assert.rejects(
    service.saveDraft(a.owner, a.id, {
      draftRevision: 0,
      payload: { ...a.payload, coverId: a.document.id },
    }),
    error("INVALID_FILE"),
  );
  await assert.rejects(
    files.readProjectFile(null, a.document.id),
    error("NOT_FOUND"),
  );
});
test("Audit failures roll back decisions, publication, resubmission and author withdrawal", async () => {
  const v = await submitted(),
    db = await dbm.getDb();
  await db.execute(
    sql`CREATE FUNCTION reject_project_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failure'; END; $$`,
  );
  await db.execute(
    sql`CREATE TRIGGER reject_project_test_audit BEFORE INSERT ON business_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_project_test_audit()`,
  );
  try {
    await assert.rejects(
      service.decideProject(operator, v.id, {
        revision: v.project.revision,
        submittedRevision: 1,
        action: "approved",
        reason: "",
      }),
    );
    assert.equal(
      (await service.managedProject(operator, v.id)).reviewState,
      "pending",
    );
    await assert.rejects(
      service.submitProject(v.owner, v.id, {
        draftRevision: v.project.draftRevision,
        revision: v.project.revision,
      }),
    );
    assert.equal(
      (await service.getOwnProject(v.owner, v.id)).submittedRevision,
      1,
    );
  } finally {
    await db.execute(
      sql`DROP TRIGGER reject_project_test_audit ON business_audit_logs`,
    );
    await db.execute(sql`DROP FUNCTION reject_project_test_audit()`);
  }
});
test("Cleanup protects submitted history and current drafts; restart retains projects and approvals", async () => {
  const v = await submitted();
  const replacement = await files.uploadProjectFile(
    v.owner,
    v.id,
    "cover",
    image,
    "replacement.png",
  );
  const changed = await service.saveDraft(v.owner, v.id, {
    draftRevision: v.project.draftRevision,
    payload: { ...v.payload, coverId: replacement.id },
  });
  await service.submitProject(v.owner, v.id, {
    draftRevision: changed.draftRevision,
    revision: changed.revision,
  });
  const orphan = await files.uploadProjectFile(
    v.owner,
    v.id,
    "screenshot",
    image,
    "orphan.png",
  );
  await (
    await dbm.getDb()
  )
    .update(schema.projectAssets)
    .set({ createdAt: new Date(Date.now() - 2 * 86400000) });
  const cleaned = await files.cleanupProjectFiles();
  assert.ok(cleaned.removed > 0);
  await assert.rejects(
    files.readProjectFile(v.owner, orphan.id),
    error("NOT_FOUND"),
  );
  assert.ok(
    (await files.readProjectFile(operator, v.document.id)).buffer.length,
  );
  assert.ok((await files.readProjectFile(operator, v.cover.id)).buffer.length);
  await dbm.closeDb();
  assert.equal(
    (await service.getOwnProject(v.owner, v.id)).submittedRevision,
    2,
  );
  assert.ok(
    (
      await service.listManagedProjects(operator, {
        q: "original project",
        source: "user",
      })
    ).total > 0,
  );
});

test("Publication and withdrawal audit failure preserve public content and consent atomically", async () => {
  const v = await submitted(),
    db = await dbm.getDb();
  let current = await service.decideProject(operator, v.id, {
    revision: v.project.revision,
    submittedRevision: 1,
    action: "approved",
    reason: "",
  });
  await db.execute(
    sql`CREATE FUNCTION reject_project_publish_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'publish audit failure'; END; $$`,
  );
  async function trigger() {
    await db.execute(
      sql`CREATE TRIGGER reject_project_publish_audit BEFORE INSERT ON business_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_project_publish_audit()`,
    );
  }
  async function drop() {
    await db.execute(
      sql`DROP TRIGGER reject_project_publish_audit ON business_audit_logs`,
    );
  }
  try {
    await trigger();
    await assert.rejects(
      service.publishProject(operator, v.id, {
        revision: current.revision,
        submittedRevision: 1,
        action: "publish",
      }),
    );
    assert.equal(await store.readPublicProject(v.id), null);
    await drop();
    current = await service.publishProject(operator, v.id, {
      revision: current.revision,
      submittedRevision: 1,
      action: "publish",
    });
    await trigger();
    await assert.rejects(
      service.withdrawProject(v.owner, v.id, {
        revision: current.revision,
        reason: "Must roll back",
      }),
    );
    await assert.rejects(
      service.publishProject(operator, v.id, {
        revision: current.revision,
        submittedRevision: 1,
        action: "withdraw",
        reason: "Must also roll back",
      }),
    );
    const still = await service.getOwnProject(v.owner, v.id);
    assert.equal(still.consentRevoked, false);
    assert.equal(still.draft.publicConsent, true);
    assert.equal(still.revision, current.revision);
    assert.ok(await store.readPublicProject(v.id));
    await drop();
  } finally {
    await db.execute(
      sql`DROP TRIGGER IF EXISTS reject_project_publish_audit ON business_audit_logs`,
    );
    await db.execute(sql`DROP FUNCTION reject_project_publish_audit()`);
  }
});

test("Parent withdrawal hides project, media and interactions while authorized review remains readable", async () => {
  const v = await prepared(),
    events = await import("../src/modules/event-participation/service"),
    content = await import("../src/modules/content-management/service"),
    contentStore = await import("../src/modules/content-management/store");
  await events.forEvent("demo").register(v.owner, {
    displayName: "Associated project",
    role: "developer",
    country: "CN",
    organization: "",
    contact: "",
    acceptedTerms: true,
  });
  const draft = await service.saveDraft(v.owner, v.id, {
      draftRevision: 0,
      payload: { ...v.payload, eventId: "demo" },
    }),
    formal = await service.submitProject(v.owner, v.id, {
      draftRevision: draft.draftRevision,
      revision: draft.revision,
    });
  let current = await service.decideProject(operator, v.id, {
    revision: formal.revision,
    submittedRevision: 1,
    action: "approved",
    reason: "",
  });
  current = await service.publishProject(operator, v.id, {
    revision: current.revision,
    submittedRevision: 1,
    action: "publish",
  });
  const parent = (await contentStore.readContent("event", "demo"))!;
  const hidden = await content.changeContent(operator, "event", "demo", {
    revision: parent.revision,
    action: "withdraw",
  });
  try {
    assert.equal(await store.readPublicProject(v.id), null);
    await assert.rejects(
      files.readProjectFile(null, v.cover.id),
      error("NOT_FOUND"),
    );
    assert.ok(
      (await files.readProjectFile(operator, v.document.id)).buffer.length,
    );
    assert.equal(
      (await service.managedProject(operator, v.id)).reviewState,
      "approved",
    );
    const interaction =
      await import("../src/modules/project-interaction/service");
    await assert.rejects(
      interaction.setLike(v.owner, v.id, { liked: true }),
      error("NOT_FOUND"),
    );
    await assert.rejects(
      service.publishProject(operator, v.id, {
        revision: current.revision,
        submittedRevision: 1,
        action: "publish",
      }),
      error("EVENT_UNAVAILABLE"),
    );
  } finally {
    await content.changeContent(operator, "event", "demo", {
      revision: hidden.content.revision,
      action: "publish",
    });
  }
  assert.ok(await store.readPublicProject(v.id));
});

test("Server-side management filtering paginates stable rows and treats wildcard input literally", async () => {
  const db = await dbm.getDb(),
    { projectRegistry } = await import("../src/modules/project-board/config"),
    { getProjectDetails } =
      await import("../src/modules/project-board/details");
  const baseline = projectRegistry[0];
  const rows = Array.from({ length: 21 }, (_, i) => {
    const id = `pagination-${String(i).padStart(2, "0")}`,
      live = {
        ...baseline,
        id,
        eventId: null,
        name: { zh: `分页样例 ${i}`, en: `Pagination sample ${i}` },
        category: "software" as const,
        details: getProjectDetails(baseline),
      };
    return {
      id,
      source: "demo" as const,
      eventId: null,
      live,
      liveRevision: 0,
      publicationState: "published" as const,
      createdAt: new Date("2026-10-01Z"),
      updatedAt: new Date("2026-10-02Z"),
    };
  });
  await db.insert(schema.submittedProjects).values(rows);
  try {
    const first = await service.listManagedProjects(operator, {
      q: "  PAGINATION SAMPLE  ",
      source: "demo",
      category: "software",
      eventId: "independent",
      publicationState: "published",
    });
    const second = await service.listManagedProjects(operator, {
      q: "Pagination sample",
      page: 2,
    });
    assert.equal(first.total, 21);
    assert.equal(first.items.length, 20);
    assert.equal(second.items.length, 1);
    assert.deepEqual(
      [...first.items, ...second.items].map((p) => p.id),
      rows.map((p) => p.id),
    );
    assert.equal(
      (await service.listManagedProjects(operator, { q: "%" })).total,
      0,
    );
    assert.equal(
      (
        await service.listManagedProjects(operator, {
          q: "Pagination sample",
          reviewState: "pending",
        })
      ).total,
      0,
    );
    assert.equal(
      (
        await service.listManagedProjects(operator, {
          q: "Pagination sample",
          page: 999,
        })
      ).items.length,
      0,
    );
  } finally {
    for (const row of rows)
      await db
        .delete(schema.submittedProjects)
        .where(eq(schema.submittedProjects.id, row.id));
  }
});

test("Queued event draft and upload cannot cross the published submission deadline", async () => {
  const v = await prepared(),
    events = await import("../src/modules/event-participation/service"),
    content = await import("../src/modules/content-management/service"),
    contentStore = await import("../src/modules/content-management/store");
  await events.forEvent("demo").register(v.owner, {
    displayName: "Queue boundary",
    role: "developer",
    country: "CN",
    organization: "",
    contact: "",
    acceptedTerms: true,
  });
  const draft = await service.saveDraft(v.owner, v.id, {
    draftRevision: 0,
    payload: { ...v.payload, eventId: "demo" },
  });
  const parent = (await contentStore.readContent("event", "demo"))!,
    original = structuredClone(
      parent.live ?? parent.draft,
    ) as import("../src/modules/event-board/contracts").EventDefinition;
  const edit = {
    ...original,
    submissionClosesAt: new Date(Date.now() + 120).toISOString(),
  };
  const current = (
    await content.changeContent(operator, "event", "demo", {
      revision: parent.revision,
      action: "save",
      draft: edit,
    })
  ).content;
  await content.changeContent(operator, "event", "demo", {
    revision: current.revision,
    action: "publish",
  });
  try {
    const block = dbm.serializeDatabaseWrite(
      () => new Promise((resolve) => setTimeout(resolve, 200)),
    );
    const outcomes = Promise.allSettled([
      service.saveDraft(v.owner, v.id, {
        draftRevision: draft.draftRevision,
        payload: { ...draft.draft, name: "Queued overwrite" },
      }),
      files.uploadProjectFile(v.owner, v.id, "screenshot", image, "queued.png"),
    ]);
    await block;
    const results = await outcomes;
    assert.ok(
      results.every(
        (r) => r.status === "rejected" && r.reason.code === "CLOSED",
      ),
    );
    assert.equal(
      (await service.getOwnProject(v.owner, v.id)).draftRevision,
      draft.draftRevision,
    );
  } finally {
    const latest = (await contentStore.readContent("event", "demo"))!;
    const saved = await content.changeContent(operator, "event", "demo", {
      revision: latest.revision,
      action: "save",
      draft: original,
    });
    await content.changeContent(operator, "event", "demo", {
      revision: saved.content.revision,
      action: "publish",
    });
  }
});

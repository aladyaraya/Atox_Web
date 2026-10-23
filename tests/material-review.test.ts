import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { openFixtureReview } from "./fixtures/review-policy";
import {
  policyState,
  getReviewPolicy,
  setReviewPolicy,
  policyDto,
} from "../src/modules/material-review/policy";
import { reviewReturn } from "../src/modules/material-review/rules";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { eq, count, sql } from "drizzle-orm";
import type { AuthUser } from "../src/modules/auth/contracts";
import type { MaterialPayload } from "../src/modules/event-participation/contracts";
let dbm: typeof import("../src/lib/db"),
  schema: typeof import("../src/lib/schema"),
  review: typeof import("../src/modules/material-review/service"),
  events: typeof import("../src/modules/event-participation/service"),
  files: typeof import("../src/modules/event-participation/files"),
  admin: typeof import("../src/modules/admin/service");
let directory: string,
  image: Buffer,
  pdf: Buffer,
  operator: AuthUser,
  superAdmin: AuthUser;
const code = (wanted: string) => (error: unknown) => {
  assert.equal((error as { code: string }).code, wanted);
  return true;
};
async function user(role?: "super_admin" | "operator") {
  const value = {
    id: randomUUID(),
    email: `${randomUUID()}@example.com`,
    createdAt: new Date(),
  };
  const db = await dbm.getDb();
  await db.insert(schema.users).values(value);
  if (role)
    await db.insert(schema.administrators).values({
      userId: value.id,
      email: value.email,
      role,
      enabled: true,
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: { source: "bootstrap", userId: null, label: "test fixture" },
    });
  return value;
}
before(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "material-review-"));
  Object.assign(process.env, {
    DB_PATH: path.join(directory, "db"),
    UPLOAD_PATH: path.join(directory, "files"),
  });
  dbm = await import("../src/lib/db");
  schema = await import("../src/lib/schema");
  review = await import("../src/modules/material-review/service");
  events = await import("../src/modules/event-participation/service");
  files = await import("../src/modules/event-participation/files");
  admin = await import("../src/modules/admin/service");
  image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#88aabb" },
  })
    .png()
    .toBuffer();
  const doc = await PDFDocument.create();
  doc.addPage();
  pdf = Buffer.from(await doc.save());
  operator = await user("operator");
  superAdmin = await user("super_admin");
  await openFixtureReview(operator);
});
after(async () => {
  await dbm?.closeDb();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function submission() {
  const owner = await user(),
    service = events.forEvent("demo"),
    assetService = files.filesForEvent("demo");
  await service.register(owner, {
    displayName: "Builder",
    role: "developer",
    country: "CN",
    organization: "",
    contact: "",
    acceptedTerms: true,
  });
  const cover = await assetService.uploadAsset(
      owner,
      "cover",
      image,
      "cover.png",
    ),
    document = await assetService.uploadAsset(
      owner,
      "document",
      pdf,
      "proposal.pdf",
    );
  const payload: MaterialPayload = {
    name: "Official project",
    tagline: "Tagline",
    description: "Proposal",
    trackId: "open",
    coverId: cover.id,
    screenshotIds: [],
    documentId: document.id,
    videoUrl: "",
    experienceUrl: "",
    codeUrl: "",
    original: true,
    usageAuthorized: true,
    publicDisplay: false,
  };
  const draft = await service.saveDraft(owner, { revision: 0, payload });
  const material = await service.submitMaterials(owner, {
    revision: draft.revision,
  });
  return { owner, service, assetService, payload, material };
}
async function auditCount() {
  return (
    await (
      await dbm.getDb()
    )
      .select({ total: count() })
      .from(schema.businessAuditLogs)
  )[0].total;
}
test("Old reviewer email whitelist grants no role or private file access; both effective admin roles can review", async () => {
  const { owner, material, payload, assetService } = await submission(),
    legacy = await user();
  process.env.EVENT_REVIEWER_EMAILS = legacy.email;
  assert.equal(await events.forEvent("demo").isReviewer(legacy), false);
  await assert.rejects(review.listMaterials(legacy), code("FORBIDDEN"));
  await assert.rejects(
    events.forEvent("demo").reviewMaterials(legacy, material.id!, {
      revision: material.revision,
      submittedRevision: material.submittedRevision,
      action: "accepted",
      publicNote: "",
    }),
    code("FORBIDDEN"),
  );
  await assert.rejects(
    assetService.readAsset(legacy, payload.coverId!),
    code("FORBIDDEN"),
  );
  assert.equal(
    (await review.getMaterial(operator, material.id!)).registration.email,
    owner.email,
  );
  assert.equal(
    (await review.getMaterial(superAdmin, material.id!)).id,
    material.id,
  );
});
test("Only official material is visible, approval accepts an empty reason and users never receive private notes", async () => {
  const { owner, service, payload, material } = await submission();
  await service.saveDraft(owner, {
    revision: material.revision,
    payload: { ...payload, name: "PRIVATE DRAFT" },
  });
  const current = await service.getMaterials(owner);
  const detail = await review.getMaterial(operator, material.id!);
  assert.equal(detail.official.name, "Official project");
  assert.equal("draft" in detail, false);
  const decided = await review.decideMaterial(operator, material.id!, {
    revision: current.revision,
    submittedRevision: current.submittedRevision,
    action: "approved",
    reason: "",
    internalNote: "PRIVATE NOTE",
  });
  assert.equal(decided.status, "approved");
  assert.equal(decided.reason, null);
  assert.equal(decided.internalNote, "PRIVATE NOTE");
  assert.equal(decided.history[0].before?.status, "pending");
  assert.equal(decided.history[0].after.status, "approved");
  assert.equal(
    JSON.stringify(decided.history).includes(payload.coverId!),
    false,
  );
  const visible = await service.getMaterials(owner);
  assert.equal("internalNote" in visible, false);
  assert.equal(visible.canEdit, false);
  await assert.rejects(
    service.saveDraft(owner, { revision: visible.revision, payload }),
    code("PROCESSED"),
  );
});
test("Rejection requires a reason, allows open-window resubmission and leaves history without old attachment references", async () => {
  const { owner, service, payload, material } = await submission(),
    before = await auditCount();
  await assert.rejects(
    review.decideMaterial(operator, material.id!, {
      revision: material.revision,
      submittedRevision: 1,
      action: "rejected",
      reason: "  ",
    }),
    code("INVALID_INPUT"),
  );
  assert.equal(await auditCount(), before);
  const rejected = await review.decideMaterial(operator, material.id!, {
    revision: material.revision,
    submittedRevision: 1,
    action: "rejected",
    reason: "Explain the proposal",
    internalNote: "Internal review",
  });
  assert.equal(rejected.status, "rejected");
  assert.equal((await service.getMaterials(owner)).canEdit, true);
  const draft = await service.saveDraft(owner, {
    revision: rejected.revision,
    payload: { ...payload, description: "Clarified proposal" },
  });
  const next = await service.submitMaterials(owner, {
    revision: draft.revision,
  });
  assert.equal(next.status, "pending");
  assert.equal(next.submittedRevision, 2);
  assert.equal(next.publicNote, null);
  const detail = await review.getMaterial(operator, next.id!);
  assert.equal(detail.history.length, 1);
  assert.equal(detail.history[0].submittedRevision, 1);
  assert.equal(detail.internalNote, "Internal review");
  assert.equal(detail.coordinationSubmittedRevision, 1);
});
test("Concurrent decisions produce one revision and one durable business audit", async () => {
  const { material } = await submission(),
    before = await auditCount();
  const results = await Promise.allSettled(
    ["approved", "rejected"].map((action) =>
      review.decideMaterial(operator, material.id!, {
        revision: material.revision,
        submittedRevision: 1,
        action: action as "approved" | "rejected",
        reason: "Decision",
      }),
    ),
  );
  assert.equal(
    results.filter((value) => value.status === "fulfilled").length,
    1,
  );
  assert.equal(
    (
      results.find(
        (value) => value.status === "rejected",
      ) as PromiseRejectedResult
    ).reason.code,
    "REVISION_CONFLICT",
  );
  assert.equal(await auditCount(), before + 1);
});
test("Permission removal is checked again in queued decision transaction", async () => {
  const { material } = await submission(),
    revoked = await user("operator");
  const revoke = admin.updateAdministrator(superAdmin, revoked.id, {
    role: "operator",
    enabled: false,
    revision: 1,
  });
  const pending = review.decideMaterial(revoked, material.id!, {
    revision: material.revision,
    submittedRevision: 1,
    action: "approved",
    reason: "",
  });
  await revoke;
  await assert.rejects(pending, code("FORBIDDEN"));
  assert.equal(
    (await review.getMaterial(operator, material.id!)).status,
    "pending",
  );
});
test("Business audit insertion failure rolls back decision status and revision", async () => {
  const { material } = await submission(),
    db = await dbm.getDb();
  await db.execute(
    sql`CREATE FUNCTION reject_business_audit_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit test failure'; END; $$`,
  );
  await db.execute(
    sql`CREATE TRIGGER reject_business_audit_test BEFORE INSERT ON business_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_business_audit_test()`,
  );
  try {
    await assert.rejects(
      review.decideMaterial(operator, material.id!, {
        revision: material.revision,
        submittedRevision: 1,
        action: "approved",
        reason: "",
      }),
    );
    const current = await review.getMaterial(operator, material.id!);
    assert.equal(current.status, "pending");
    assert.equal(current.revision, material.revision);
    assert.equal(current.history.length, 0);
  } finally {
    await db.execute(
      sql`DROP TRIGGER reject_business_audit_test ON business_audit_logs`,
    );
    await db.execute(sql`DROP FUNCTION reject_business_audit_test()`);
  }
});
test("Historical needs_changes maps to rejected and cannot be reviewed without a new pending revision", async () => {
  const { material } = await submission();
  await (
    await dbm.getDb()
  )
    .update(schema.eventMaterials)
    .set({ status: "needs_changes", publicNote: "Old change request" })
    .where(eq(schema.eventMaterials.id, material.id!));
  assert.equal(
    (await review.getMaterial(operator, material.id!)).status,
    "rejected",
  );
  assert.ok(
    (
      await review.listMaterials(operator, {
        eventId: "demo",
        status: "rejected",
      })
    ).items.some((item) => item.id === material.id),
  );
  await assert.rejects(
    review.decideMaterial(operator, material.id!, {
      revision: material.revision,
      submittedRevision: 1,
      action: "approved",
      reason: "",
    }),
    code("NOT_PENDING"),
  );
  await dbm.closeDb();
  assert.equal(
    (await review.getMaterial(operator, material.id!)).status,
    "rejected",
  );
});

test("Review window boundaries and safe list return targets are explicit", () => {
  const policy = {
    enabled: true,
    opensAt: "2026-10-23T09:00:00+08:00",
    closesAt: "2026-10-23T10:00:00+08:00",
  };
  assert.equal(policyState(null), "unconfigured");
  assert.equal(
    policyState(policy, new Date("2026-10-23T00:59:59Z")),
    "not_started",
  );
  assert.equal(policyState(policy, new Date("2026-10-23T01:00:00Z")), "open");
  assert.equal(policyState(policy, new Date("2026-10-23T02:00:00Z")), "closed");
  assert.equal(policyState({ ...policy, enabled: false }), "paused");
  assert.equal(
    reviewReturn("https://other.test/admin/materials"),
    "/admin/materials",
  );
  assert.equal(
    reviewReturn("//other.test/admin/materials"),
    "/admin/materials",
  );
  assert.equal(reviewReturn("/admin/materials/other"), "/admin/materials");
  assert.equal(
    reviewReturn("/admin/materials?eventId=demo&page=2"),
    "/admin/materials?eventId=demo&page=2",
  );
});

test("Default event and unlimited timing cover exact boundaries without a stored policy", async () => {
  const { upcomingEventConfig, pastEventConfig } =
    await import("../src/modules/event-board/config");
  const event = upcomingEventConfig;
  assert.equal(
    policyDto(event, undefined, new Date(Date.parse(event.startsAt) - 1)).state,
    "not_started",
  );
  const atStart = policyDto(event, undefined, new Date(event.startsAt));
  assert.equal(atStart.mode, "event");
  assert.equal(atStart.revision, 0);
  assert.equal(atStart.state, "open");
  assert.equal(atStart.opensAt, event.startsAt);
  assert.equal(atStart.closesAt, event.endsAt);
  assert.equal(
    policyDto(event, undefined, new Date(Date.parse(event.endsAt) - 1)).state,
    "open",
  );
  assert.equal(
    policyDto(event, undefined, new Date(event.endsAt)).state,
    "closed",
  );
  assert.equal(policyDto(pastEventConfig, undefined).state, "closed");
  const unlimited = {
    enabled: true,
    mode: "unlimited" as const,
    opensAt: null,
    closesAt: null,
  };
  for (const date of ["2000-01-01Z", "2099-01-01Z"])
    assert.equal(policyState(unlimited, new Date(date)), "open");
  assert.equal(policyState({ ...unlimited, enabled: false }), "paused");
});

test("An ongoing event needs no window setup: decide, revoke, annotate and legacy endpoint share defaults", async () => {
  const { material, service } = await submission(),
    db = await dbm.getDb();
  await db
    .delete(schema.materialReviewPolicies)
    .where(eq(schema.materialReviewPolicies.eventId, "demo"));
  try {
    const policy = (await getReviewPolicy(operator, "demo")).policy;
    assert.equal(policy.mode, "event");
    assert.equal(policy.state, "open");
    assert.equal(policy.revision, 0);
    const list = await review.listMaterials(operator, { eventId: "demo" });
    assert.ok(list.items.some((value) => value.id === material.id));
    assert.equal(
      list.events.find((value) => value.id === "demo")!.reviewPolicy.mode,
      "event",
    );
    const accepted = await review.decideMaterial(operator, material.id!, {
      revision: material.revision,
      submittedRevision: 1,
      action: "approved",
      reason: "Default dates require no initialization",
    });
    const revoked = await review.revokeApproval(superAdmin, material.id!, {
      revision: accepted.revision,
      submittedRevision: 1,
      reason: "Recheck under event default",
    });
    const coordinated = await review.saveCoordination(operator, material.id!, {
      revision: revoked.revision,
      submittedRevision: 1,
      coordinationRequired: true,
      internalNote: "Default-mode note",
    });
    await service.reviewMaterials(operator, material.id!, {
      revision: coordinated.revision,
      submittedRevision: 1,
      action: "accepted",
      publicNote: "Legacy path uses the same default",
    });
    assert.equal(
      (await review.getMaterial(operator, material.id!)).status,
      "approved",
    );
    assert.equal(
      (
        await db
          .select()
          .from(schema.materialReviewPolicies)
          .where(eq(schema.materialReviewPolicies.eventId, "demo"))
      ).length,
      0,
    );
  } finally {
    await openFixtureReview(operator);
  }
});

test("Unlimited review works after event end, pauses safely, follows published dates and preserves drafts", async () => {
  const { material } = await submission();
  const content = await import("../src/modules/content-management/service");
  const store = await import("../src/modules/content-management/store");
  const original = (await store.readContent("event", "demo"))!;
  const originalDraft = structuredClone(original.draft);
  const originalLive = structuredClone(original.live ?? original.draft);
  const current = (await getReviewPolicy(operator, "demo")).policy;
  try {
    const unlimited = await setReviewPolicy(operator, "demo", {
      revision: current.revision,
      mode: "unlimited",
      enabled: true,
      reason: "Allow review independently of event dates",
    });
    assert.equal(unlimited.policy.opensAt, null);
    assert.equal(unlimited.policy.closesAt, null);
    const past = structuredClone(
      originalLive,
    ) as import("../src/modules/event-board/contracts").EventDefinition;
    past.startsAt = "2020-01-01T00:00:00Z";
    past.endsAt = "2020-01-02T00:00:00Z";
    let saved = await content.changeContent(operator, "event", "demo", {
      revision: original.revision,
      action: "save",
      draft: past,
    });
    saved = await content.changeContent(operator, "event", "demo", {
      revision: saved.content.revision,
      action: "publish",
    });
    const coordinated = await review.saveCoordination(operator, material.id!, {
      revision: material.revision,
      submittedRevision: 1,
      coordinationRequired: true,
      internalNote: "Allowed after event end",
    });
    assert.equal(coordinated.reviewPolicy.state, "open");
    const paused = await setReviewPolicy(superAdmin, "demo", {
      revision: unlimited.policy.revision,
      mode: "unlimited",
      enabled: false,
      reason: "Pause unlimited review",
    });
    await assert.rejects(
      review.decideMaterial(operator, material.id!, {
        revision: coordinated.revision,
        submittedRevision: 1,
        action: "approved",
        reason: "",
      }),
      code("REVIEW_PAUSED"),
    );
    const eventMode = await setReviewPolicy(operator, "demo", {
      revision: paused.policy.revision,
      mode: "event",
      enabled: true,
      reason: "Restore event-based timing",
    });
    assert.equal(eventMode.policy.state, "closed");
    const draft = structuredClone(originalLive);
    await content.changeContent(operator, "event", "demo", {
      revision: saved.content.revision,
      action: "save",
      draft,
    });
    // Unsaved-to-live event changes cannot open review.
    assert.equal(
      (await getReviewPolicy(operator, "demo")).policy.state,
      "closed",
    );
    await assert.rejects(
      review.decideMaterial(operator, material.id!, {
        revision: coordinated.revision,
        submittedRevision: 1,
        action: "approved",
        reason: "",
      }),
      code("REVIEW_CLOSED"),
    );
    await assert.rejects(
      setReviewPolicy(operator, "demo", {
        revision: eventMode.policy.revision,
        mode: "any" as never,
        enabled: true,
        reason: "Invalid mode",
      }),
      code("INVALID_INPUT"),
    );
    await assert.rejects(
      setReviewPolicy(operator, "demo", {
        revision: eventMode.policy.revision,
        mode: "unlimited",
        enabled: true,
        reason: " ",
      }),
      code("INVALID_INPUT"),
    );
    await assert.rejects(
      setReviewPolicy(operator, "demo", {
        revision: paused.policy.revision,
        mode: "unlimited",
        enabled: true,
        reason: "Stale rule",
      }),
      code("REVISION_CONFLICT"),
    );
    const history = (await getReviewPolicy(operator, "demo")).history;
    assert.equal((history[0].after as { mode: string }).mode, "event");
  } finally {
    let state = (await store.readContent("event", "demo"))!;
    state = (
      await content.changeContent(operator, "event", "demo", {
        revision: state.revision,
        action: "save",
        draft: originalLive,
      })
    ).content;
    state = (
      await content.changeContent(operator, "event", "demo", {
        revision: state.revision,
        action: "publish",
      })
    ).content;
    await content.changeContent(operator, "event", "demo", {
      revision: state.revision,
      action: "save",
      draft: originalDraft,
    });
    await openFixtureReview(operator);
  }
});

test("Missing policies follow event dates; both admin roles configure and ordinary users cannot", async () => {
  const ordinary = await user();
  assert.equal(
    (await getReviewPolicy(operator, "upcoming-demo")).policy.state,
    "not_started",
  );
  await assert.rejects(getReviewPolicy(ordinary, "demo"), code("FORBIDDEN"));
  await assert.rejects(
    setReviewPolicy(ordinary, "upcoming-demo", {
      revision: 0,
      enabled: true,
      opensAt: "2020-01-01T00:00:00Z",
      closesAt: "2099-01-01T00:00:00Z",
      reason: "Unauthorized",
    }),
    code("FORBIDDEN"),
  );
  const requests = await Promise.allSettled(
    [operator, superAdmin].map((actor) =>
      setReviewPolicy(actor, "upcoming-demo", {
        revision: 0,
        enabled: true,
        opensAt: "2020-01-01T00:00:00Z",
        closesAt: "2099-01-01T00:00:00Z",
        reason: "Concurrent initialization",
      }),
    ),
  );
  assert.equal(
    requests.filter((value) => value.status === "fulfilled").length,
    1,
  );
  assert.equal(
    (await getReviewPolicy(operator, "upcoming-demo")).history.length,
    1,
  );
  const current = (await getReviewPolicy(operator, "upcoming-demo")).policy;
  await setReviewPolicy(superAdmin, "upcoming-demo", {
    ...current,
    opensAt: current.opensAt!,
    closesAt: current.closesAt!,
    reason: "Pause",
  } as never).catch((error) => assert.equal(error.code, "INVALID_INPUT"));
  await setReviewPolicy(superAdmin, "upcoming-demo", {
    revision: current.revision,
    enabled: false,
    opensAt: current.opensAt!,
    closesAt: current.closesAt!,
    reason: "Pause",
  });
  assert.equal(
    (await getReviewPolicy(operator, "upcoming-demo")).policy.state,
    "paused",
  );
  assert.equal((await getReviewPolicy(operator, "demo")).policy.state, "open");
});

test("Revoke approval keeps formal version and attachments, clears processing, audits and exposes only public reason", async () => {
  const { owner, service, payload, material } = await submission();
  const accepted = await review.decideMaterial(operator, material.id!, {
    revision: material.revision,
    submittedRevision: 1,
    action: "approved",
    reason: "Initial approval",
    internalNote: "Private context",
  });
  await assert.rejects(
    review.revokeApproval(operator, material.id!, {
      revision: accepted.revision,
      submittedRevision: 1,
      reason: " ",
    }),
    code("INVALID_INPUT"),
  );
  const revoked = await review.revokeApproval(superAdmin, material.id!, {
    revision: accepted.revision,
    submittedRevision: 1,
    reason: "Please verify the document",
  });
  assert.equal(revoked.status, "pending");
  assert.equal(revoked.reviewNotice, "approval_revoked");
  assert.equal(revoked.processedAt, null);
  assert.equal(revoked.submittedRevision, accepted.submittedRevision);
  assert.equal(revoked.submittedAt, accepted.submittedAt);
  assert.deepEqual(revoked.official, accepted.official);
  assert.deepEqual(revoked.assets, accepted.assets);
  assert.equal(revoked.internalNote, "Private context");
  assert.equal(revoked.history.length, 2);
  assert.ok(
    revoked.history.some((row) => row.action === "material.approval_revoked"),
  );
  const visible = await service.getMaterials(owner);
  assert.equal(visible.result, null);
  assert.equal(visible.reviewNotice, "approval_revoked");
  assert.equal(visible.publicNote, "Please verify the document");
  assert.equal(visible.canEdit, true);
  assert.equal("coordinationRequired" in visible, false);
  assert.equal("internalNote" in visible, false);
  await assert.rejects(
    review.revokeApproval(operator, material.id!, {
      revision: revoked.revision,
      submittedRevision: 1,
      reason: "Again",
    }),
    code("NOT_APPROVED"),
  );
  const draft = await service.saveDraft(owner, {
    revision: revoked.revision,
    payload,
  });
  const next = await service.submitMaterials(owner, {
    revision: draft.revision,
  });
  assert.equal(next.reviewNotice, null);
  assert.equal(next.publicNote, null);
  assert.equal(
    (await review.getMaterial(operator, material.id!)).internalNote,
    "Private context",
  );
});

test("Independent coordination persists across resubmission; old versions conflict and do not count as decisions", async () => {
  const { owner, service, payload, material } = await submission();
  const coordinated = await review.saveCoordination(operator, material.id!, {
    revision: material.revision,
    submittedRevision: 1,
    coordinationRequired: true,
    internalNote: "PRIVATE COORDINATION",
  });
  assert.equal(coordinated.status, "pending");
  assert.equal(coordinated.recentAction, null);
  assert.equal(coordinated.coordinationSubmittedRevision, 1);
  const draft = await service.saveDraft(owner, {
    revision: coordinated.revision,
    payload,
  });
  const submitted = await service.submitMaterials(owner, {
    revision: draft.revision,
  });
  const detail = await review.getMaterial(operator, submitted.id!);
  assert.equal(detail.coordinationRequired, true);
  assert.equal(detail.coordinationSubmittedRevision, 1);
  assert.equal(detail.internalNote, "PRIVATE COORDINATION");
  await assert.rejects(
    review.saveCoordination(operator, material.id!, {
      revision: coordinated.revision,
      submittedRevision: 1,
      coordinationRequired: false,
      internalNote: "stale",
    }),
    code("REVISION_CONFLICT"),
  );
  const results = await Promise.allSettled([
    review.saveCoordination(operator, material.id!, {
      revision: detail.revision,
      submittedRevision: 2,
      coordinationRequired: false,
      internalNote: "checked",
    }),
    review.decideMaterial(superAdmin, material.id!, {
      revision: detail.revision,
      submittedRevision: 2,
      action: "approved",
      reason: "",
    }),
  ]);
  assert.equal(
    results.filter((value) => value.status === "fulfilled").length,
    1,
  );
});

test("Every closed-window state blocks decisions, revoke, coordination and legacy writes but keeps reads", async () => {
  const { owner, service, material } = await submission();
  const accepted = await review.decideMaterial(operator, material.id!, {
    revision: material.revision,
    submittedRevision: 1,
    action: "approved",
    reason: "",
  });
  const pending = await submission(),
    db = await dbm.getDb();
  const revision = (await getReviewPolicy(operator, "demo")).policy.revision;
  const cases = [
    {
      enabled: false,
      opensAt: new Date("2020-01-01Z"),
      closesAt: new Date("2099-01-01Z"),
      error: "REVIEW_PAUSED",
    },
    {
      enabled: true,
      opensAt: new Date("2098-01-01Z"),
      closesAt: new Date("2099-01-01Z"),
      error: "REVIEW_NOT_STARTED",
    },
    {
      enabled: true,
      opensAt: new Date("2020-01-01Z"),
      closesAt: new Date("2020-02-01Z"),
      error: "REVIEW_CLOSED",
    },
  ];
  try {
    for (const entry of cases) {
      const { error, ...changes } = entry;
      await db
        .update(schema.materialReviewPolicies)
        .set(changes)
        .where(eq(schema.materialReviewPolicies.eventId, "demo"));
      await assert.rejects(
        review.revokeApproval(operator, accepted.id, {
          revision: accepted.revision,
          submittedRevision: 1,
          reason: "Correction",
        }),
        code(error),
      );
      await assert.rejects(
        review.saveCoordination(superAdmin, accepted.id, {
          revision: accepted.revision,
          submittedRevision: 1,
          coordinationRequired: true,
          internalNote: "new",
        }),
        code(error),
      );
      await assert.rejects(
        review.decideMaterial(operator, pending.material.id!, {
          revision: pending.material.revision,
          submittedRevision: 1,
          action: "approved",
          reason: "",
        }),
        code(error),
      );
      await assert.rejects(
        service.reviewMaterials(operator, pending.material.id!, {
          revision: pending.material.revision,
          submittedRevision: 1,
          action: "accepted",
          publicNote: "Old endpoint",
        }),
        code(error),
      );
      assert.equal(
        (await review.getMaterial(operator, accepted.id)).canRevoke,
        false,
      );
      assert.ok(
        (
          await files
            .filesForEvent("demo")
            .readAsset(operator, accepted.official.documentId!)
        ).buffer.length,
      );
      assert.equal((await service.getMaterials(owner)).result, "accepted");
    }
    await db
      .delete(schema.materialReviewPolicies)
      .where(eq(schema.materialReviewPolicies.eventId, "demo"));
    const coordinated = await review.saveCoordination(operator, accepted.id, {
      revision: accepted.revision,
      submittedRevision: 1,
      coordinationRequired: true,
      internalNote: "new",
    });
    assert.equal(coordinated.reviewPolicy.mode, "event");
    assert.equal(coordinated.coordinationRequired, true);
    await assert.rejects(
      setReviewPolicy(operator, "demo", {
        revision: 0,
        enabled: true,
        opensAt: "2020-01-01T00:00:00Z",
        closesAt: "2020-02-01T00:00:00Z",
        reason: "Expired reopen",
      }),
      code("REVIEW_DEADLINE_REQUIRED"),
    );
  } finally {
    await openFixtureReview(operator);
  }
  assert.ok(revision > 0);
});

test("Queued requests use execution-time deadline and policy updates leave a reasoned audit", async () => {
  const { material } = await submission(),
    db = await dbm.getDb();
  await db
    .update(schema.materialReviewPolicies)
    .set({ closesAt: new Date(Date.now() + 100) })
    .where(eq(schema.materialReviewPolicies.eventId, "demo"));
  const blocked = dbm.serializeDatabaseWrite(
    () => new Promise((resolve) => setTimeout(resolve, 160)),
  );
  const queued = review.decideMaterial(operator, material.id!, {
    revision: material.revision,
    submittedRevision: 1,
    action: "approved",
    reason: "",
  });
  await blocked;
  try {
    await assert.rejects(queued, code("REVIEW_CLOSED"));
  } finally {
    await openFixtureReview(operator);
  }
  const { history } = await getReviewPolicy(superAdmin, "demo");
  assert.ok(history.length > 0);
  assert.ok((history[0].after as { reason: string }).reason);
});

test("List search, compound tracks, coordination and state statistics share a consistent filtered scope", async () => {
  const { material } = await submission();
  await review.saveCoordination(operator, material.id!, {
    revision: material.revision,
    submittedRevision: 1,
    coordinationRequired: true,
    internalNote: "PRIVATE SEARCH NOTE",
  });
  const pending = await review.listMaterials(operator, {
    eventId: "demo",
    q: "  OFFICIAL PROJECT  ",
    trackId: "demo:open",
    coordination: "required",
    status: "approved",
    sort: "oldest",
  });
  assert.ok(pending.statistics.pending > 0);
  assert.equal(pending.total, pending.statistics.approved);
  const all = await review.listMaterials(operator, {
    eventId: "demo",
    q: "Builder",
    coordination: "required",
  });
  assert.ok(all.items.some((value) => value.id === material.id));
  assert.equal("registration" in all.items[0], false);
  assert.equal("official" in all.items[0], false);
  assert.equal("internalNote" in all.items[0], false);
  assert.equal((await review.listMaterials(operator, { q: "%" })).total, 0);
  assert.equal(
    (await review.listMaterials(operator, { trackId: "upcoming-demo:open" }))
      .total,
    0,
  );
});

test("Review stays independent of publication and withdrawal, while revocation never extends submission deadline", async () => {
  const { owner, service, material, payload } = await submission();
  const content = await import("../src/modules/content-management/service");
  const store = await import("../src/modules/content-management/store");
  const { demoEventConfig } = await import("../src/modules/event-board/config");
  const originalDeadline = demoEventConfig.submissionClosesAt;
  const record = await store.readContent("event", "demo");
  const withdrawn = await content.changeContent(operator, "event", "demo", {
    revision: record!.revision,
    action: "withdraw",
  });
  try {
    assert.equal(await store.readPublishedEvent("demo"), null);
    const approved = await review.decideMaterial(operator, material.id!, {
      revision: material.revision,
      submittedRevision: 1,
      action: "approved",
      reason: "Allowed by independent review window",
    });
    const revoked = await review.revokeApproval(operator, material.id!, {
      revision: approved.revision,
      submittedRevision: 1,
      reason: "Recheck after event submission deadline",
    });
    demoEventConfig.submissionClosesAt = new Date(
      Date.now() - 1000,
    ).toISOString();
    assert.equal((await service.getMaterials(owner)).canEdit, false);
    await assert.rejects(
      service.saveDraft(owner, { revision: revoked.revision, payload }),
      code("CLOSED"),
    );
    assert.equal(revoked.canDecide, true);
    assert.ok(revoked.assets.length > 0);
  } finally {
    demoEventConfig.submissionClosesAt = originalDeadline;
    await content.changeContent(operator, "event", "demo", {
      revision: withdrawn.content.revision,
      action: "publish",
    });
  }
});

test("Audit failure rolls back coordination, revocation and review policy changes together", async () => {
  const { material } = await submission(),
    db = await dbm.getDb();
  const accepted = await review.decideMaterial(operator, material.id!, {
    revision: material.revision,
    submittedRevision: 1,
    action: "approved",
    reason: "",
  });
  const policy = (await getReviewPolicy(operator, "demo")).policy;
  await db.execute(
    sql`CREATE FUNCTION reject_new_review_audit_test() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test audit failure'; END; $$ LANGUAGE plpgsql`,
  );
  await db.execute(
    sql`CREATE TRIGGER reject_new_review_audit_test BEFORE INSERT ON business_audit_logs FOR EACH ROW EXECUTE FUNCTION reject_new_review_audit_test()`,
  );
  try {
    await assert.rejects(
      review.saveCoordination(operator, material.id!, {
        revision: accepted.revision,
        submittedRevision: 1,
        coordinationRequired: true,
        internalNote: "must roll back",
      }),
    );
    await assert.rejects(
      review.revokeApproval(operator, material.id!, {
        revision: accepted.revision,
        submittedRevision: 1,
        reason: "must roll back",
      }),
    );
    await assert.rejects(
      setReviewPolicy(operator, "demo", {
        revision: policy.revision,
        enabled: false,
        opensAt: policy.opensAt!,
        closesAt: policy.closesAt!,
        reason: "must roll back",
      }),
    );
    const current = await review.getMaterial(operator, material.id!);
    assert.equal(current.status, "approved");
    assert.equal(current.revision, accepted.revision);
    assert.equal(current.coordinationRequired, false);
    assert.equal(current.history.length, 1);
    assert.equal(
      (await getReviewPolicy(operator, "demo")).policy.revision,
      policy.revision,
    );
  } finally {
    await db.execute(
      sql`DROP TRIGGER reject_new_review_audit_test ON business_audit_logs`,
    );
    await db.execute(sql`DROP FUNCTION reject_new_review_audit_test()`);
  }
});

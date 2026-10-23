import {
  test,
  expect,
  request,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { seedMaterialSubmission } from "../fixtures/material-submission";
import type {
  MaterialPayload,
  MaterialsDto,
} from "../../src/modules/event-participation/contracts";
import type { MaterialReviewDetail } from "../../src/modules/material-review/contracts";

type Identity = { id: string; email: string; token: string };
function identity(name: string): Identity {
  return JSON.parse(readFileSync(process.env.ADMIN_FIXTURE_FILE!, "utf8"))[
    name === "normal"
      ? "material-normal"
      : name === "network"
        ? "material-network"
        : name
  ];
}
async function signIn(
  context: BrowserContext,
  baseURL: string,
  name = "operator",
) {
  await context.addCookies([
    {
      name: "hackathon_session",
      value: identity(name).token,
      domain: new URL(baseURL).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
async function api(baseURL: string, name: string) {
  return request.newContext({
    baseURL,
    extraHTTPHeaders: {
      Cookie: `hackathon_session=${identity(name).token}`,
      Origin: new URL(baseURL).origin,
    },
  });
}
const submissions: Record<string, MaterialsDto> = {};
const payloads: Record<string, MaterialPayload> = {};
async function details(page: Page, id: string): Promise<MaterialReviewDetail> {
  const response = await page.request.get(`/api/admin/materials/${id}`);
  expect(response.status()).toBe(200);
  return (await response.json()).material;
}
async function review(page: Page) {
  await page.getByRole("button", { name: "提交审核", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认审核", exact: true })
    .click();
}
async function reloadLatest(page: Page) {
  await page.getByRole("button", { name: "读取最新状态", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "读取最新状态", exact: true })
    .click();
}

test.beforeAll(async ({ baseURL }) => {
  test.setTimeout(180_000);
  for (const name of [
    "normal",
    "network",
    ...Array.from({ length: 21 }, (_, i) => `fixture-${i}`),
  ]) {
    const client = await api(baseURL!, name);
    try {
      const seeded = await seedMaterialSubmission(client, name);
      submissions[name] = seeded.material;
      payloads[name] = seeded.payload;
    } finally {
      await client.dispose();
    }
  }
});

test("Material admin pages and private APIs reject anonymous and ordinary accounts", async ({
  page,
  context,
  baseURL,
}) => {
  expect((await page.request.get("/api/admin/materials")).status()).toBe(401);
  await page.goto("/admin/materials");
  await expect(page).toHaveURL(/login\?next=%2Fadmin%2Fmaterials$/);
  await signIn(context, baseURL!, "normal");
  await page.goto("/admin/materials");
  await expect(
    page.getByRole("heading", { name: "无权访问", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/admin/materials")).status()).toBe(403);
  expect(
    (
      await page.request.get(`/api/admin/materials/${submissions.network.id}`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(
        `/api/events/demo/files/${payloads.network.documentId}`,
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(
        `/api/admin/materials/${submissions.network.id}/files/${payloads.network.documentId}`,
      )
    ).status(),
  ).toBe(403);
  const owner = await page.request.get("/api/events/demo/materials");
  expect(owner.status()).toBe(200);
  expect(await owner.json()).not.toHaveProperty("internalNote");
});

test("Operator list filters, pagination, bilingual state and mobile layouts", async ({
  page,
  context,
  baseURL,
}, info) => {
  await signIn(context, baseURL!);
  await page.goto("/admin/materials");
  const all = await (await page.request.get("/api/admin/materials")).json();
  expect(all.total).toBeGreaterThanOrEqual(23);
  await expect(page.locator("[data-material-id]")).toHaveCount(20);
  await expect(
    page.getByRole("heading", { name: "材料审核总表", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  const firstRow = await page
    .locator("[data-material-id]")
    .first()
    .boundingBox();
  expect(firstRow!.y).toBeLessThan(700);
  await expect(
    page.getByRole("table", { name: "材料审核总表 · 每页 20 份", exact: true }),
  ).toBeVisible();
  for (let pageNumber = 2; pageNumber <= all.totalPages; pageNumber++) {
    await page.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`page=${pageNumber}$`));
    await expect(page.locator("[data-material-id]")).toHaveCount(
      pageNumber === all.totalPages ? all.total - (pageNumber - 1) * 20 : 20,
    );
  }
  await page
    .getByRole("combobox", { name: "审核状态", exact: true })
    .selectOption("approved");
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  const approved = await (
    await page.request.get("/api/admin/materials?status=approved")
  ).json();
  await expect(page.locator("[data-material-id]")).toHaveCount(
    approved.items.length,
  );
  await page
    .getByRole("combobox", { name: "审核状态", exact: true })
    .selectOption("pending");
  await page
    .getByRole("combobox", { name: "活动", exact: true })
    .selectOption("upcoming-demo");
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await expect(page.locator("[data-material-id]")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "活动", exact: true })
    .selectOption("demo");
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await expect(page.locator("[data-material-id]")).toHaveCount(20);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("materials-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath("materials-mobile.png") });
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Material review table",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Material review table",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Review table is discoverable and missing policies follow event dates; unlimited and pause need no custom dates", async ({
  page,
  context,
  baseURL,
}, info) => {
  await signIn(context, baseURL!);
  const client = await api(baseURL!, "operator");
  const owner = await api(baseURL!, "fixture-16");
  const eventId = "review-default-timing";
  const eventPath = `/api/admin/content/events/${eventId}`;
  try {
    const created = await client.post("/api/admin/content/events", {
      data: { id: eventId },
    });
    expect(created.status()).toBe(200);
    let event = (await created.json()).content;
    const published = await client.post(eventPath, {
      data: { revision: event.revision, action: "publish" },
    });
    expect(published.status()).toBe(200);
    event = (await published.json()).content;
    await page.goto(`/admin/materials?eventId=${eventId}`);
    await expect(
      page.getByRole("heading", { name: "材料审核总表", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "尚无正式提交。选手保存的草稿不会进入审核总表，正式提交后才会显示。",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("跟随活动起止时间", { exact: true }),
    ).toBeVisible();
    const policy = (
      await (
        await client.get(`/api/admin/materials/review-policies/${eventId}`)
      ).json()
    ).policy;
    expect(policy.mode).toBe("event");
    expect(policy.revision).toBe(0);
    expect(policy.state).toBe("open");
    const { material } = await seedMaterialSubmission(
      owner,
      "no-window-setup",
      eventId,
    );
    await page.getByRole("button", { name: "刷新列表", exact: true }).click();
    await expect(page.locator("[data-material-id]")).toHaveCount(1);
    await page.setViewportSize({ width: 1440, height: 900 });
    const row = await page.locator("[data-material-id]").boundingBox();
    expect(row!.y).toBeLessThan(760);
    await page.screenshot({
      path: info.outputPath("default-event-review-table-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "查看总表 ↓", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "正式材料记录", exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("default-event-review-table-mobile.png"),
    });
    expect(
      (await page.locator(".mr-table caption").boundingBox())!.height,
    ).toBeLessThan(60);
    await page.getByRole("link", { name: "查看材料", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "提交审核", exact: true }),
    ).toBeEnabled();
    // A real administrator decision succeeds without creating a policy first.
    await review(page);
    await expect(
      page.getByRole("status").filter({ hasText: "操作已保存" }),
    ).toBeVisible();
    expect((await details(page, material.id!)).status).toBe("approved");
    await page
      .getByRole("button", { name: "设置审核时间", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "设置审核时间",
      exact: true,
    });
    await expect(dialog.getByLabel("审核时间规则")).toHaveValue("event");
    await dialog.getByLabel("审核时间规则").selectOption("unlimited");
    await expect(dialog.getByLabel("审核截止时间（含时区偏移）")).toHaveCount(
      0,
    );
    await dialog
      .getByLabel("时间设置变更原因")
      .fill("Review independently of event dates");
    await dialog.getByRole("button", { name: "保存审核时间" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("不限时审核", { exact: true })).toBeVisible();
    const draft = {
      ...event.draft,
      startsAt: "2020-01-01T00:00:00Z",
      endsAt: "2020-01-02T00:00:00Z",
    };
    const saved = await client.put(eventPath, {
      data: { revision: event.revision, action: "save", draft },
    });
    expect(saved.status()).toBe(200);
    event = (await saved.json()).content;
    expect(
      (
        await client.post(eventPath, {
          data: { revision: event.revision, action: "publish" },
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "撤回通过", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "设置审核时间", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "设置审核时间", exact: true });
    await dialog.getByLabel("启用本场审核").uncheck();
    await dialog.getByLabel("时间设置变更原因").fill("Pause unlimited review");
    await dialog.getByRole("button", { name: "保存审核时间" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "撤回通过", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "设置审核时间", exact: true })
      .click();
    dialog = page.getByRole("dialog", { name: "设置审核时间", exact: true });
    await dialog.getByLabel("审核时间规则").selectOption("event");
    await dialog.getByLabel("启用本场审核").check();
    await dialog
      .getByLabel("时间设置变更原因")
      .fill("Restore event dates after event has ended");
    await dialog.getByRole("button", { name: "保存审核时间" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "撤回通过", exact: true }),
    ).toBeDisabled();
    expect((await details(page, material.id!)).reviewPolicy.state).toBe(
      "closed",
    );
  } finally {
    await client.dispose();
    await owner.dispose();
  }
});

test("Rejection requires feedback; private notes and audit survive resubmission and approval", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL!);
  const id = submissions.normal.id!;
  await page.goto(`/admin/materials/${id}`);
  await expect(
    page.getByRole("heading", { name: "Official normal", exact: true }).first(),
  ).toBeVisible();
  const attachment = await page.request.get(
    `/api/admin/materials/${id}/files/${payloads.normal.documentId}`,
  );
  expect(attachment.status()).toBe(200);
  expect(attachment.headers()["cache-control"]).toContain("no-store");
  await page.getByRole("radio", { name: "驳回", exact: true }).check();
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "给选手的审核说明", exact: true })
    .fill("Please clarify the demo.");
  await page
    .getByRole("textbox", { name: "内部备注", exact: true })
    .fill("PRIVATE-M009-NOTE");
  await page.getByRole("button", { name: "提交审核", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "确认审核决定",
    exact: true,
  });
  await expect(dialog).toContainText("不会公开发布材料");
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.querySelector("dialog")?.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeFocused();
  await review(page);
  await expect(
    page.getByRole("status").filter({ hasText: "操作已保存" }),
  ).toBeVisible();
  await expect(page.locator("[data-material-audit-id]")).toHaveCount(1);
  const owner = await api(baseURL!, "normal");
  try {
    const mine = await owner.get("/api/events/demo/materials");
    const current: MaterialsDto = await mine.json();
    expect(current.canEdit).toBe(true);
    expect(current.publicNote).toBe("Please clarify the demo.");
    expect(JSON.stringify(current)).not.toContain("PRIVATE-M009-NOTE");
    const payload = {
      ...payloads.normal,
      name: "Resubmitted normal",
      description: "Updated demonstration and clarified materials.",
    };
    const draft = await owner.put("/api/events/demo/materials/draft", {
      data: { revision: current.revision, payload },
    });
    expect(draft.status()).toBe(200);
    await reloadLatest(page);
    await expect(
      page
        .getByRole("heading", { name: "Official normal", exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByText("Resubmitted normal", { exact: true }),
    ).toHaveCount(0);
    const submit = await owner.post("/api/events/demo/materials/submit", {
      data: { revision: (await draft.json()).revision },
    });
    expect(submit.status()).toBe(200);
    await reloadLatest(page);
    await expect(
      page.getByRole("button", { name: "提交审核", exact: true }),
    ).toBeEnabled();
    await review(page);
    await expect(
      page.getByRole("status").filter({ hasText: "操作已保存" }),
    ).toBeVisible();
    await expect(page.locator("[data-material-audit-id]")).toHaveCount(2);
    const final = await details(page, id);
    expect(final.status).toBe("approved");
    expect(final.history[0].before?.status).toBe("pending");
    expect(final.history[0].after.status).toBe("approved");
  } finally {
    await owner.dispose();
  }
});

test("Concurrent review preserves stale input until a confirmed reload", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL!);
  const id = submissions["fixture-0"].id!;
  await page.goto(`/admin/materials/${id}`);
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "驳回", exact: true }).check();
  await page
    .getByRole("textbox", { name: "给选手的审核说明", exact: true })
    .fill("MY-STALE-FEEDBACK");
  const old = await details(page, id);
  const other = await api(baseURL!, "other-super");
  try {
    const response = await other.post(`/api/admin/materials/${id}/decision`, {
      data: {
        revision: old.revision,
        submittedRevision: old.submittedRevision,
        action: "approved",
        reason: "Reviewed by another administrator",
        internalNote: "Other review",
      },
    });
    expect(response.status()).toBe(200);
  } finally {
    await other.dispose();
  }
  await review(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "当前输入已保留" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "给选手的审核说明", exact: true }),
  ).toHaveValue("MY-STALE-FEEDBACK");
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "读取最新状态", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("textbox", { name: "给选手的审核说明", exact: true }),
  ).toHaveValue("MY-STALE-FEEDBACK");
  await reloadLatest(page);
  await expect(
    page.getByText(
      "当前正式提交已处理；通过可在审核开放时撤回至待审核，驳回须由选手在原提交期内重提。",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(page.locator("[data-material-audit-id]")).toHaveCount(1);
});

test("Unknown network outcome is reconciled without repeating a committed decision", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL!);
  const id = submissions.network.id!;
  await page.goto(`/admin/materials/${id}`);
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeVisible();
  let writes = 0;
  await page.route(`**/api/admin/materials/${id}/decision`, async (route) => {
    writes++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await review(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "未能确认操作结果" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  await reloadLatest(page);
  await expect(
    page.getByText(
      "当前正式提交已处理；通过可在审核开放时撤回至待审核，驳回须由选手在原提交期内重提。",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  expect(writes).toBe(1);
  await expect(page.locator("[data-material-audit-id]")).toHaveCount(1);
});

test("An uncommitted server failure keeps input locked until the latest pending state is confirmed", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL!);
  const id = submissions["fixture-1"].id!;
  await page.goto(`/admin/materials/${id}`);
  await page
    .getByRole("textbox", { name: "给选手的审核说明", exact: true })
    .fill("PRESERVED-FAILED-INPUT");
  let writes = 0;
  const pattern = `**/api/admin/materials/${id}/decision`;
  await page.route(pattern, async (route) => {
    writes++;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "INTERNAL_ERROR" }),
    });
  });
  await review(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "未能确认操作结果" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "给选手的审核说明", exact: true }),
  ).toHaveValue("PRESERVED-FAILED-INPUT");
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeDisabled();
  await reloadLatest(page);
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "给选手的审核说明", exact: true }),
  ).toHaveValue("");
  expect(writes).toBe(1);
  await expect(page.locator("[data-material-audit-id]")).toHaveCount(0);
  await page.unroute(pattern);
  await review(page);
  await expect(
    page.getByRole("status").filter({ hasText: "操作已保存" }),
  ).toBeVisible();
  await expect(page.locator("[data-material-audit-id]")).toHaveCount(1);
});

test("Operator configures, pauses and reopens a review window with reason; old API is also blocked", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL!);
  const id = submissions["fixture-18"].id!;
  await page.goto(`/admin/materials/${id}`);
  await page.getByRole("button", { name: "设置审核时间", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "设置审核时间", exact: true });
  await expect(dialog.getByLabel("审核开始时间（含时区偏移）")).toHaveValue(
    "2020-01-01T00:00:00.000Z",
  );
  await expect(
    dialog.getByRole("button", { name: "保存审核时间" }),
  ).toBeDisabled();
  await dialog.getByLabel("启用本场审核").uncheck();
  await dialog.getByLabel("时间设置变更原因").fill("Pause for cross checking");
  await dialog.getByRole("button", { name: "保存审核时间" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeDisabled();
  const current = await details(page, id);
  const result = await page.request.post(`/api/events/demo/review/${id}`, {
    headers: { Origin: baseURL! },
    data: {
      revision: current.revision,
      submittedRevision: current.submittedRevision,
      action: "accepted",
      publicNote: "Old route must obey window",
    },
  });
  expect(result.status()).toBe(409);
  expect((await result.json()).error).toBe("REVIEW_PAUSED");
  expect(
    (
      await page.request.get(
        `/api/admin/materials/${id}/files/${current.official.documentId}`,
      )
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "设置审核时间", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "设置审核时间", exact: true });
  await dialog.getByLabel("启用本场审核").check();
  await dialog
    .getByLabel("时间设置变更原因")
    .fill("Resume verified fixture window");
  await dialog.getByRole("button", { name: "保存审核时间" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "提交审核", exact: true }),
  ).toBeEnabled();
  const ordinary = await api(baseURL!, "normal");
  expect(
    (await ordinary.get("/api/admin/materials/review-policies/demo")).status(),
  ).toBe(403);
  await ordinary.dispose();
});

test("Independent coordination, approval revoke, participant notice and resubmission preserve versioned internal work", async ({
  page,
  context,
  baseURL,
  browser,
}) => {
  await signIn(context, baseURL!);
  const id = submissions["fixture-20"].id!;
  await page.goto(`/admin/materials/${id}`);
  await page.getByLabel("待协调", { exact: true }).check();
  await page
    .getByLabel("内部备注", { exact: true })
    .fill("PRIVATE-COORDINATION-v1");
  await page.getByRole("button", { name: "保存协调记录", exact: true }).click();
  await expect(page.locator("[data-material-audit-id]")).toHaveCount(1);
  await review(page);
  await expect(
    page.getByRole("button", { name: "撤回通过", exact: true }),
  ).toBeEnabled();
  const accepted = await details(page, id);
  await page.getByRole("button", { name: "撤回通过", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "撤回通过", exact: true });
  await expect(
    dialog.getByRole("button", { name: "确认撤回通过" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "撤回通过", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "撤回通过", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "撤回通过", exact: true });
  await dialog.getByLabel("给选手的撤回说明").fill("Need to recheck the PDF");
  await dialog.getByRole("button", { name: "确认撤回通过" }).click();
  await expect(dialog).toHaveCount(0);
  const revoked = await details(page, id);
  expect(revoked.submittedRevision).toBe(accepted.submittedRevision);
  expect(revoked.submittedAt).toBe(accepted.submittedAt);
  expect(revoked.status).toBe("pending");
  const ownerContext = await browser.newContext({ baseURL });
  await signIn(ownerContext, baseURL!, "fixture-20");
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto("/events/demo/materials");
  await expect(
    ownerPage.getByRole("status").filter({ hasText: "原通过结果已撤回" }),
  ).toBeVisible();
  expect(await ownerPage.locator("body").innerText()).not.toContain(
    "PRIVATE-COORDINATION-v1",
  );
  await ownerContext.close();
  const owner = await api(baseURL!, "fixture-20");
  try {
    const response = await owner.get("/api/events/demo/materials"),
      mine = await response.json();
    expect(mine.reviewNotice).toBe("approval_revoked");
    expect(mine).not.toHaveProperty("coordinationRequired");
    const draft = await owner.put("/api/events/demo/materials/draft", {
      data: {
        revision: mine.revision,
        payload: {
          ...payloads["fixture-20"],
          description: "Clarified version two",
        },
      },
    });
    expect(draft.status()).toBe(200);
    const submit = await owner.post("/api/events/demo/materials/submit", {
      data: { revision: (await draft.json()).revision },
    });
    expect(submit.status()).toBe(200);
    expect((await submit.json()).reviewNotice).toBeNull();
  } finally {
    await owner.dispose();
  }
  await reloadLatest(page);
  await expect(page.getByLabel("内部备注", { exact: true })).toHaveValue(
    "PRIVATE-COORDINATION-v1",
  );
  await expect(page.getByLabel("待协调", { exact: true })).toBeChecked();
  await expect(
    page.getByText("选手已重提，请核对后更新", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存协调记录", exact: true }).click();
  const coordinated = await details(page, id);
  expect(coordinated.coordinationSubmittedRevision).toBe(2);
  expect(coordinated.recentAction?.action).toBe("material.approval_revoked");
});

test("Combined search statistics and safe detail return retain filters and scroll", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL!);
  await page.goto(
    "/admin/materials?eventId=demo&status=pending&coordination=none&sort=oldest",
  );
  await page.getByLabel("搜索项目或提交人").fill("  OFFICIAL fixture-19  ");
  await expect(page.locator("[data-material-id]")).toHaveCount(1);
  await expect(page).toHaveURL(/q=OFFICIAL\+fixture-19/);
  const list = await (
    await page.request.get(
      "/api/admin/materials?eventId=demo&q=OFFICIAL%20fixture-19&status=approved",
    )
  ).json();
  expect(list.total).toBe(0);
  expect(list.statistics.pending).toBe(1);
  expect(list.items).toEqual([]);
  const href = await page
    .getByRole("link", { name: "查看材料", exact: true })
    .getAttribute("href");
  expect(href).toContain("returnTo=");
  await page.getByRole("link", { name: "查看材料", exact: true }).click();
  await page.getByRole("link", { name: "返回材料列表", exact: true }).click();
  await expect(page.getByLabel("搜索项目或提交人")).toHaveValue(
    "OFFICIAL fixture-19",
  );
  await expect(
    page.getByRole("combobox", { name: "审核状态", exact: true }),
  ).toHaveValue("pending");
  await expect(page.locator("[data-material-id]")).toHaveCount(1);
});

test("A page that reaches its deadline becomes read only and server preserves the pending submission", async ({
  page,
  context,
  baseURL,
}) => {
  await signIn(context, baseURL!);
  const client = await api(baseURL!, "operator"),
    id = submissions["fixture-17"].id!;
  const { policy } = await (
    await client.get("/api/admin/materials/review-policies/demo")
  ).json();
  try {
    const changed = await client.patch(
      "/api/admin/materials/review-policies/demo",
      {
        data: {
          revision: policy.revision,
          enabled: true,
          opensAt: policy.opensAt,
          closesAt: new Date(Date.now() + 6000).toISOString(),
          reason: "Short isolated browser window",
        },
      },
    );
    expect(changed.status()).toBe(200);
    await page.goto(`/admin/materials/${id}`);
    await expect(
      page.getByRole("button", { name: "提交审核", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "提交审核", exact: true }),
    ).toBeDisabled({ timeout: 12000 });
    await expect(
      page.getByText("审核已截止，仅供查看", { exact: true }).first(),
    ).toBeVisible();
    const material = await details(page, id);
    expect(material.status).toBe("pending");
    const write = await client.patch(
      `/api/admin/materials/${id}/coordination`,
      {
        data: {
          revision: material.revision,
          submittedRevision: material.submittedRevision,
          coordinationRequired: true,
          internalNote: "After close",
        },
      },
    );
    expect(write.status()).toBe(409);
    expect((await write.json()).error).toBe("REVIEW_CLOSED");
  } finally {
    const current = await (
      await client.get("/api/admin/materials/review-policies/demo")
    ).json();
    await client.patch("/api/admin/materials/review-policies/demo", {
      data: {
        revision: current.policy.revision,
        enabled: true,
        opensAt: "2020-01-01T00:00:00Z",
        closesAt: "2099-01-01T00:00:00Z",
        reason: "Restore isolated fixture",
      },
    });
    await client.dispose();
  }
});

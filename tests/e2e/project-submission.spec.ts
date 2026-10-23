import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import type { OwnerProject } from "../../src/modules/project-submission/contracts";
function identity(name: string) {
  return JSON.parse(readFileSync(process.env.ADMIN_FIXTURE_FILE!, "utf8"))[
    name
  ] as { token: string; id: string };
}
async function login(context: BrowserContext, baseURL: string, name: string) {
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
async function confirm(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "操作已保存" }),
  ).toBeVisible();
}
async function reload(page: Page) {
  await page.getByRole("button", { name: "读取最新状态", exact: true }).click();
  await confirm(page);
}
async function mine(page: Page, id: string) {
  return (await (await page.request.get(`/api/account/projects/${id}`)).json())
    .project as OwnerProject;
}

test("Project pages, APIs and file access enforce authentication, roles and same origin", async ({
  page,
  context,
  baseURL,
}) => {
  expect((await page.request.get("/api/account/projects")).status()).toBe(401);
  expect((await page.request.get("/api/admin/projects")).status()).toBe(401);
  await page.goto("/projects/submit");
  await expect(page).toHaveURL(/login\?next=%2Fprojects%2Fsubmit$/);
  await page.goto("/account/projects");
  await expect(page).toHaveURL(/login\?next=%2Faccount%2Fprojects$/);
  await login(context, baseURL!, "project-other");
  await page.goto("/admin/projects");
  await expect(
    page.getByRole("heading", { name: "无权访问", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/admin/projects")).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/account/projects", {
        headers: { Origin: "https://outside.example" },
        data: { requestId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(403);
});
test("Author submission, rejection, approval and explicit publication preserve old versions and private PDFs", async ({
  page,
  context,
  baseURL,
  browser,
}, info) => {
  await login(context, baseURL!, "project-author");
  await page.goto("/account");
  await page
    .getByRole("link", { name: "我的项目 · 投稿与审核", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "我的项目", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "提交新项目", exact: true }).click();
  await page.getByRole("button", { name: "创建项目草稿", exact: true }).click();
  await expect(page).toHaveURL(/account\/projects\/[0-9a-f-]+$/);
  const id = page.url().split("/").pop()!;
  await page
    .getByLabel("创作者展示名", { exact: true })
    .fill("真实投稿测试作者");
  await page
    .getByLabel("项目名称", { exact: true })
    .fill("浏览器原创项目 M015");
  await page
    .getByLabel("一句话介绍", { exact: true })
    .fill("一个由用户正式投稿的作品");
  await page
    .getByLabel("详细说明", { exact: true })
    .fill("用于验证投稿、审核与发布的完整原始说明。");
  const image = await sharp({
    create: { width: 30, height: 30, channels: 3, background: "#b397ff" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("上传封面", { exact: true }).setInputFiles({
    name: "public-cover.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(
    page.getByRole("link", { name: "public-cover.png ↗", exact: true }),
  ).toBeVisible();
  const doc = await PDFDocument.create();
  doc.addPage();
  await page.getByLabel("上传审核 PDF（选填）", { exact: true }).setInputFiles({
    name: "review-private.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await doc.save()),
  });
  await expect(
    page.getByRole("link", { name: "review-private.pdf ↗", exact: true }),
  ).toBeVisible();
  await page.getByLabel("我确认项目为原创作品。", { exact: true }).check();
  await page
    .getByLabel("我确认展示素材已取得使用授权。", { exact: true })
    .check();
  await page
    .getByLabel("我同意审核通过后，由官方发布介绍和展示图片；PDF 不公开。", {
      exact: true,
    })
    .check();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("author-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "正式提交审核", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "正式提交审核", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "正式提交审核", exact: true }).click();
  await confirm(page);
  await saved(page);
  const submitted = await mine(page, id);
  expect(submitted.submittedRevision).toBe(1);
  expect((await page.request.get(`/api/projects/${id}`)).status()).toBe(404);
  const outsider = await browser.newContext({ baseURL });
  expect(
    (
      await outsider.request.get(
        `/api/project-files/${submitted.draft.documentId}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await outsider.request.get(
        `/api/project-files/${submitted.draft.coverId}`,
      )
    ).status(),
  ).toBe(404);
  const adminContext = await browser.newContext({ baseURL });
  await login(adminContext, baseURL!, "operator");
  const admin = await adminContext.newPage();
  try {
    await admin.goto("/admin");
    await admin.getByRole("link", { name: "项目管理 ↗", exact: true }).click();
    await expect(
      admin.getByRole("heading", { name: "项目管理总表", exact: true }),
    ).toBeVisible();
    await admin.getByLabel("来源", { exact: true }).selectOption("user");
    await admin
      .getByLabel("搜索项目或创作者", { exact: true })
      .fill("浏览器原创项目 M015");
    await expect(admin.locator("[data-project-id]")).toHaveCount(1);
    await admin.setViewportSize({ width: 1440, height: 900 });
    await admin.screenshot({
      path: info.outputPath("admin-project-table.png"),
    });
    await admin.setViewportSize({ width: 390, height: 844 });
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await admin.screenshot({
      path: info.outputPath("admin-project-table-mobile.png"),
    });
    await admin
      .getByRole("link", { name: "查看与管理 ↗", exact: true })
      .click();
    await admin.screenshot({
      path: info.outputPath("admin-detail-before-review.png"),
      fullPage: true,
    });
    await expect(admin.getByLabel("审核结果", { exact: true })).toBeVisible({
      timeout: 10000,
    });
    await admin
      .getByLabel("审核结果", { exact: true })
      .selectOption("rejected");
    await expect(
      admin.getByRole("button", { name: "提交审核", exact: true }),
    ).toBeDisabled();
    await admin
      .getByLabel("给作者的审核说明（驳回必填）", { exact: true })
      .fill("请补充核心使用场景");
    await admin
      .getByLabel("内部备注", { exact: true })
      .fill("PRIVATE-REVIEW-NOTE");
    await admin.getByRole("button", { name: "提交审核", exact: true }).click();
    await confirm(admin);
    await saved(admin);
    await page.reload();
    await expect(
      page.getByRole("status").filter({ hasText: "请补充核心使用场景" }),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(
      "PRIVATE-REVIEW-NOTE",
    );
    await page
      .getByLabel("详细说明", { exact: true })
      .fill("补充后的场景说明与原型验证结果。");
    await page
      .getByRole("button", { name: "正式提交审核", exact: true })
      .click();
    await confirm(page);
    await saved(page);
    await reload(admin);
    await admin
      .getByLabel("审核结果", { exact: true })
      .selectOption("approved");
    await admin.getByRole("button", { name: "提交审核", exact: true }).click();
    await confirm(admin);
    await saved(admin);
    expect((await outsider.request.get(`/api/projects/${id}`)).status()).toBe(
      404,
    );
    const preview = await adminContext.newPage();
    await preview.goto(`/admin/projects/${id}/preview`);
    await expect(
      preview.getByRole("heading", {
        name: "浏览器原创项目 M015",
        exact: true,
      }),
    ).toBeVisible();
    expect(await preview.locator("body").innerText()).not.toContain(
      "review-private.pdf",
    );
    await preview.close();
    await admin
      .getByRole("button", { name: "发布当前批准版本", exact: true })
      .click();
    await confirm(admin);
    await saved(admin);
    const publicProject = await (
      await outsider.request.get(`/api/projects/${id}`)
    ).json();
    expect(publicProject.project.demo).toBe(false);
    expect(JSON.stringify(publicProject)).not.toContain(
      submitted.draft.documentId!,
    );
    expect(
      (
        await outsider.request.get(
          `/api/project-files/${submitted.draft.coverId}`,
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await outsider.request.get(
          `/api/project-files/${submitted.draft.documentId}`,
        )
      ).status(),
    ).toBe(404);
    await page.reload();
    await page
      .getByLabel("项目名称", { exact: true })
      .fill("浏览器原创项目 M015 第二版");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await saved(page);
    expect(
      (await (await outsider.request.get(`/api/projects/${id}`)).json()).project
        .name.zh,
    ).toBe("浏览器原创项目 M015");
    await page
      .getByRole("button", { name: "正式提交审核", exact: true })
      .click();
    await confirm(page);
    await saved(page);
    expect(
      (await (await outsider.request.get(`/api/projects/${id}`)).json()).project
        .name.zh,
    ).toBe("浏览器原创项目 M015");
    await reload(admin);
    await admin.getByRole("button", { name: "提交审核", exact: true }).click();
    await confirm(admin);
    await saved(admin);
    await admin
      .getByRole("button", { name: "发布当前批准版本", exact: true })
      .click();
    await confirm(admin);
    await saved(admin);
    await page.goto(`/projects/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "浏览器原创项目 M015 第二版",
    );
    await page.getByRole("button", { name: "点赞项目", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "取消点赞", exact: true }),
    ).toBeVisible();
    const profile = await (
      await page.request.get("/api/account/profile")
    ).json();
    expect(
      (
        await page.request.put("/api/account/profile", {
          headers: { Origin: baseURL! },
          data: { nickname: "投稿作者", revision: profile.revision },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`/api/projects/${id}/comments`, {
          headers: { Origin: baseURL! },
          data: {
            body: "真实投稿项目的互动测试",
            requestId: crypto.randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
    await admin.goto(`/admin/project-comments?projectId=${id}`);
    await expect(
      admin.getByText("真实投稿项目的互动测试", { exact: true }),
    ).toBeVisible();
    await page.goto(`/account/projects/${id}`);
    await page
      .getByRole("button", { name: "下架我的项目", exact: true })
      .click();
    await page
      .getByLabel("下架原因", { exact: true })
      .fill("作者主动撤销公开授权");
    await confirm(page);
    await saved(page);
    await expect(
      page.getByLabel(
        "我同意审核通过后，由官方发布介绍和展示图片；PDF 不公开。",
        { exact: true },
      ),
    ).not.toBeChecked();
    expect((await outsider.request.get(`/api/projects/${id}`)).status()).toBe(
      404,
    );
    expect(
      (
        await outsider.request.get(
          `/api/project-files/${submitted.draft.coverId}`,
        )
      ).status(),
    ).toBe(404);
    await admin.goto(`/admin/projects/${id}`);
    await expect(
      admin.getByRole("button", { name: "发布当前批准版本", exact: true }),
    ).toBeDisabled();
  } finally {
    await outsider.close();
    await adminContext.close();
  }
});
test("Uncertain creation reuses its key; a lost committed draft response preserves input until reload", async ({
  page,
  context,
  baseURL,
}) => {
  await login(context, baseURL!, "project-network");
  await page.goto("/projects/submit");
  let creates = 0;
  const pattern = "**/api/account/projects";
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    creates++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "创建项目草稿", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "未能确认请求结果" }),
  ).toBeVisible();
  expect(creates).toBe(1);
  await page.unroute(pattern);
  await page.getByRole("button", { name: "创建项目草稿", exact: true }).click();
  await expect(page).toHaveURL(/account\/projects\/[0-9a-f-]+$/);
  expect(
    (await (await page.request.get("/api/account/projects")).json()).total,
  ).toBe(1);
  const id = page.url().split("/").pop()!;
  await page.getByLabel("项目名称", { exact: true }).fill("保留的未知结果草稿");
  await page.route(`**/api/account/projects/${id}/draft`, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "未能确认请求结果" }),
  ).toBeVisible();
  await expect(page.getByLabel("项目名称", { exact: true })).toHaveValue(
    "保留的未知结果草稿",
  );
  await expect(
    page.getByRole("button", { name: "保存草稿", exact: true }),
  ).toBeDisabled();
  await reload(page);
  await expect(
    page.getByRole("button", { name: "保存草稿", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("项目名称", { exact: true })).toHaveValue(
    "保留的未知结果草稿",
  );
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Edit project",
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Edit project",
  );
  let nativeDialogs = 0;
  page.on("dialog", async (d) => {
    nativeDialogs++;
    await d.dismiss();
  });
  await page
    .getByLabel("Project name", { exact: true })
    .fill("Unsaved navigation check");
  await page.locator("a.ps-back").click();
  await expect(
    page.getByRole("dialog", { name: "Leave editor", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("a.ps-back")).toBeFocused();
  await page.locator("a.ps-back").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account\/projects$/);
  expect(nativeDialogs).toBe(0);
});
test("Demo publication is managed without invented reviews and unauthorized users cannot retrieve other drafts", async ({
  page,
  context,
  baseURL,
  browser,
}) => {
  await login(context, baseURL!, "operator");
  await page.goto("/admin/projects?source=demo");
  await expect(page.locator("[data-project-id]")).toHaveCount(12);
  await page.getByLabel("搜索项目或创作者", { exact: true }).fill("灵感地图");
  await page.getByRole("link", { name: "灵感地图", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/projects\/idea-atlas/);
  await expect(
    page.getByRole("heading", { name: "灵感地图", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("演示项目 · 不适用审核", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "下架项目", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "确认", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "下架项目", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "下架项目", exact: true }).click();
  await page.getByLabel("下架原因", { exact: true }).fill("演示项目上下架验收");
  await confirm(page);
  await saved(page);
  expect((await page.request.get("/api/projects/idea-atlas")).status()).toBe(
    404,
  );
  await page
    .getByRole("button", { name: "发布当前批准版本", exact: true })
    .click();
  await confirm(page);
  await saved(page);
  expect((await page.request.get("/api/projects/idea-atlas")).status()).toBe(
    200,
  );
  const other = await browser.newContext({ baseURL });
  await login(other, baseURL!, "project-other");
  try {
    const mine = await page.request.get("/api/account/projects");
    expect(mine.status()).toBe(200);
    const own = await other.request.post("/api/account/projects", {
      headers: { Origin: baseURL! },
      data: { requestId: crypto.randomUUID() },
    });
    const { id } = await own.json();
    expect(
      (await page.request.get(`/api/account/projects/${id}`)).status(),
    ).toBe(403);
    expect((await page.request.get(`/api/admin/projects/${id}`)).status()).toBe(
      404,
    );
    expect(
      (await other.request.get(`/api/admin/projects/${id}`)).status(),
    ).toBe(403);
  } finally {
    await other.close();
  }
});

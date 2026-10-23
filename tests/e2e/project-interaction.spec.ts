import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type Browser,
} from "@playwright/test";
import { readFileSync } from "node:fs";
const origin = "http://127.0.0.1:3100";

test("Moderator conflicts and lost responses preserve reasons and require an explicit state check", async ({
  browser,
}) => {
  const author = await fixtureContext(browser, "normal"),
    moderator = await fixtureContext(browser, "operator");
  await nickname(author, "Moderation test author");
  const receipt = await (
    await author.request.post("/api/projects/quiet-clock/comments", {
      headers,
      data: {
        body: "Moderation recovery check",
        requestId: crypto.randomUUID(),
      },
    })
  ).json();
  const page = await moderator.newPage();
  await page.goto("/admin/project-comments?projectId=quiet-clock");
  const row = page
    .locator(".pi-managed-comment")
    .filter({ hasText: "Moderation recovery check" });
  await row.getByRole("button", { name: "隐藏评论", exact: true }).click();
  await page.getByLabel("隐藏原因", { exact: true }).fill("Preserve my reason");
  expect(
    (
      await moderator.request.post(
        "/api/admin/project-comments/" + receipt.commentId + "/moderation",
        {
          headers,
          data: { action: "hide", reason: "Earlier decision", revision: 1 },
        },
      )
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "确认隐藏", exact: true }).click();
  await expect(page.getByLabel("隐藏原因", { exact: true })).toHaveValue(
    "Preserve my reason",
  );
  await expect(
    page.getByRole("button", { name: "核对最新状态", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "核对最新状态", exact: true }).click();
  await expect(page.getByLabel("隐藏原因", { exact: true })).toHaveValue(
    "Preserve my reason",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "核对最新状态", exact: true }).click();
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row.getByRole("button", { name: "隐藏评论", exact: true }).click();
  await page
    .getByLabel("隐藏原因", { exact: true })
    .fill("Unknown result reason");
  let posts = 0;
  const target =
    "**/api/admin/project-comments/" + receipt.commentId + "/moderation";
  await page.route(target, async (route) => {
    posts++;
    await route.fetch();
    await route.abort();
  });
  await page.getByRole("button", { name: "确认隐藏", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核对最新状态", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("隐藏原因", { exact: true })).toHaveValue(
    "Unknown result reason",
  );
  await page.unroute(target);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "核对最新状态", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "确认恢复", exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  await author.request.delete(
    "/api/projects/quiet-clock/comments/" + receipt.commentId,
    { headers },
  );
  await author.close();
  await moderator.close();
});
const headers = { Origin: origin };
const project = "/projects/idea-atlas";
async function login(page: Page, context: BrowserContext, next = project) {
  const email =
    "project-" +
    Date.now() +
    "-" +
    Math.random().toString(36).slice(2) +
    "@example.com";
  await page.goto("/login?next=" + encodeURIComponent(next));
  await page.getByLabel("邮箱地址").fill(email);
  await page.getByRole("button", { name: "发送验证码" }).click();
  await expect(page.getByLabel("6 位验证码")).toBeVisible();
  const mail = await context.newPage();
  await mail.goto("/dev/mail");
  const text = await mail
    .locator("article")
    .filter({ hasText: email })
    .first()
    .locator("pre")
    .innerText();
  await mail.close();
  await page.getByLabel("6 位验证码").fill(text.match(/\b\d{6}\b/)![0]);
  await page.getByRole("button", { name: "验证并登录" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return email;
}
async function fixtureContext(browser: Browser, name: string) {
  const identities = JSON.parse(
    readFileSync(process.env.ADMIN_FIXTURE_FILE!, "utf8"),
  );
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "hackathon_session",
      value: identities[name].token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return context;
}
async function nickname(context: BrowserContext, value: string) {
  const current = await (
    await context.request.get("/api/account/profile")
  ).json();
  expect(
    (
      await context.request.put("/api/account/profile", {
        headers,
        data: { nickname: value, revision: current.revision },
      })
    ).status(),
  ).toBe(200);
}

async function fixtureSignIn(
  page: Page,
  context: BrowserContext,
  name: string,
  next = project,
) {
  const identities = JSON.parse(
    readFileSync(process.env.ADMIN_FIXTURE_FILE!, "utf8"),
  );
  await context.addCookies([
    {
      name: "hackathon_session",
      value: identities[name].token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(next);
}
test("Real email return, nickname gate, desired likes, comments, moderation and owner deletion form one flow", async ({
  page,
  context,
  browser,
}) => {
  await page.goto(project + "?returnTo=%2Fprojects%3Fsort%3Dlikes");
  await page.getByRole("link", { name: "登录后点赞", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await login(
    page,
    context,
    project + "?returnTo=%2Fprojects%3Fsort%3Dlikes#comments",
  );
  await expect(page).toHaveURL(/\/projects\/idea-atlas\?returnTo=.*#comments/);
  const like = page.getByRole("button", { name: "点赞项目", exact: true });
  await like.click();
  await expect(
    page.getByRole("button", { name: "取消点赞", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "取消点赞", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "发表评论", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("昵称（2—30 字符）", { exact: true })
    .fill("Flow author");
  await page.getByRole("button", { name: "保存昵称", exact: true }).click();
  await expect(page.getByLabel("写下你的评论", { exact: true })).toBeVisible();
  const text = "M012 hello\n<script>window.m012Xss=1</script>";
  await page.getByLabel("写下你的评论", { exact: true }).fill(text);
  await page.getByRole("button", { name: "发表评论", exact: true }).click();
  await expect(
    page.locator(".pi-comment").filter({ hasText: text }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { m012Xss?: number }).m012Xss,
    ),
  ).toBeUndefined();
  await nickname(context, "Renamed author");
  await page.getByRole("button", { name: "刷新评论", exact: true }).click();
  await expect(
    page.locator(".pi-comment").filter({ hasText: text }),
  ).toContainText("Renamed author");
  const publicData = await (
    await context.request.get("/api/projects/idea-atlas/comments")
  ).json();
  expect(publicData.items[0].nickname).toBe("Renamed author");
  expect(Object.keys(publicData.items[0]).sort()).toEqual(
    ["id", "body", "nickname", "createdAt", "isMine"].sort(),
  );
  const moderator = await fixtureContext(browser, "operator"),
    adminPage = await moderator.newPage();
  await adminPage.goto("/admin/project-comments?projectId=idea-atlas");
  const row = adminPage
    .locator(".pi-managed-comment")
    .filter({ hasText: text });
  await row.getByRole("button", { name: "隐藏评论", exact: true }).click();
  const dialog = adminPage.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "确认隐藏" })).toBeDisabled();
  await dialog.getByLabel("隐藏原因", { exact: true }).fill("Review example");
  await dialog.getByRole("button", { name: "确认隐藏", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText("已隐藏");
  await page.getByRole("button", { name: "刷新评论", exact: true }).click();
  await expect(
    page.locator(".pi-comment").filter({ hasText: text }),
  ).toHaveCount(0);
  await row.getByRole("button", { name: "恢复评论", exact: true }).click();
  await adminPage
    .getByRole("dialog")
    .getByRole("button", { name: "确认恢复", exact: true })
    .click();
  await page.getByRole("button", { name: "刷新评论", exact: true }).click();
  await expect(
    page.locator(".pi-comment").filter({ hasText: text }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .locator(".pi-comment")
    .filter({ hasText: text })
    .getByRole("button", { name: "删除评论" })
    .click();
  await expect(
    page.locator(".pi-comment").filter({ hasText: text }),
  ).toHaveCount(0);
  await moderator.close();
});
test("A lost comment response survives login expiry and reload without a duplicate", async ({
  page,
  context,
}) => {
  await fixtureSignIn(page, context, "network");
  await nickname(context, "Recovery author");
  await page.reload();
  const before = await (
    await context.request.get("/api/projects/idea-atlas/comments")
  ).json();
  const ids: string[] = [];
  await page.route("**/api/projects/idea-atlas/comments", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    ids.push(route.request().postDataJSON().requestId);
    await route.fetch();
    await route.abort();
  });
  await page
    .getByLabel("写下你的评论", { exact: true })
    .fill("Recover my original comment");
  await page.getByRole("button", { name: "发表评论", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "核对原发送结果", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("写下你的评论", { exact: true })).toBeDisabled();
  await page.unroute("**/api/projects/idea-atlas/comments");
  await page.route("**/api/projects/idea-atlas/comments", async (route) => {
    if (route.request().method() === "POST")
      ids.push(route.request().postDataJSON().requestId);
    await route.continue();
  });
  await context.clearCookies({ name: "hackathon_session" });
  const expired = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/projects/idea-atlas/comments") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "核对原发送结果", exact: true })
    .click();
  expect((await expired).status()).toBe(401);
  await expect(
    page.getByRole("link", { name: /登录后发表评论/ }),
  ).toBeVisible();
  await fixtureSignIn(page, context, "network");
  await expect(
    page.getByRole("button", { name: "核对原发送结果", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "核对原发送结果", exact: true })
    .click();
  await expect(page.getByText("评论已发送", { exact: true })).toBeVisible();
  const after = await (
    await context.request.get("/api/projects/idea-atlas/comments")
  ).json();
  expect(after.total).toBe(before.total + 1);
  expect(ids.length).toBe(3);
  expect(new Set(ids).size).toBe(1);
});
test("Likes sort globally, return URLs are confined to the board and mobile detail is bilingual", async ({
  page,
  context,
}) => {
  await fixtureSignIn(page, context, "normal");
  await context.request.put("/api/projects/trail-lines/like", {
    headers,
    data: { liked: true },
  });
  await page.goto("/projects?sort=likes");
  const api = await (
    await context.request.get("/api/projects?sort=likes")
  ).json();
  expect(await page.locator(".pb-card h3").allTextContents()).toEqual(
    api.projects.map((p: { name: { zh: string } }) => p.name.zh),
  );
  await page.getByLabel("项目排序").selectOption("oldest");
  await expect(page).toHaveURL(/sort=oldest/);
  await page.reload();
  await expect(page.locator(".pb-card h3").first()).toHaveText("未命名的可能");
  await page.goto(project + "?returnTo=https%3A%2F%2Fexample.com");
  await expect(page.locator(".pi-back")).toHaveAttribute("href", "/projects");
  await page.getByRole("button", { name: "Switch to English" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Idea Atlas",
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Enlarge project image" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("Account nickname conflicts preserve input and APIs enforce origin, ownership and visibility", async ({
  page,
  context,
  request,
}) => {
  await fixtureSignIn(page, context, "material-network", "/account");
  const original = await (
    await context.request.get("/api/account/profile")
  ).json();
  expect(
    (
      await context.request.put("/api/account/profile", {
        headers,
        data: { nickname: "Other tab", revision: original.revision },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByLabel("昵称（2—30 字符）", { exact: true })
    .fill("My unsaved nickname");
  await page.getByRole("button", { name: "保存昵称", exact: true }).click();
  await expect(
    page.getByLabel("昵称（2—30 字符）", { exact: true }),
  ).toHaveValue("My unsaved nickname");
  await expect(
    page.getByRole("button", { name: "核对最新昵称", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "核对最新昵称", exact: true }).click();
  await expect(
    page.getByLabel("昵称（2—30 字符）", { exact: true }),
  ).toHaveValue("Other tab");
  expect((await request.get("/api/account/profile")).status()).toBe(401);
  expect(
    (
      await request.put("/api/projects/idea-atlas/like", {
        headers,
        data: { liked: true },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await context.request.put("/api/projects/idea-atlas/like", {
        headers: { Origin: "https://example.com" },
        data: { liked: true },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.put("/api/projects/idea-atlas/like", {
        headers,
        data: { liked: true, userId: "forged" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (await context.request.get("/api/admin/project-comments")).status(),
  ).toBe(403);
  expect(
    (await request.get("/api/projects/idea-atlas/comments?page=0")).status(),
  ).toBe(400);
  expect((await request.get("/projects/not-a-project")).status()).toBe(404);
  expect((await request.get("/api/projects/not-a-project")).status()).toBe(404);
});

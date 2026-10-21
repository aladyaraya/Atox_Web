import { test, expect } from "@playwright/test";

test("Project filters, paging, URL restoration, API parity and public boundaries", async ({
  page,
  request,
}) => {
  await page.goto("/projects");
  await expect(page.locator(".pb-card")).toHaveCount(9);
  expect(
    decodeURIComponent(
      (await page
        .locator(".pi-card-actions .pi-like a")
        .first()
        .getAttribute("href"))!,
    ),
  ).toContain("returnTo=");
  await expect(page.locator(".pb-results-heading")).toContainText("12 个项目");
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page).toHaveURL(/page=2$/);
  await expect(page.locator(".pb-card")).toHaveCount(3);
  await expect(page.getByTestId("project-cover-fallback")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".pb-card")).toHaveCount(3);
  await page.getByLabel("项目分类", { exact: true }).selectOption("hardware");
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.locator(".pb-card")).toHaveCount(2);
  await page
    .getByLabel("所属活动", { exact: true })
    .selectOption("independent");
  await expect(page.locator(".pb-card")).toHaveCount(1);
  await expect(page.locator(".pb-card h3")).toHaveText("口袋花园");
  await page.goBack();
  await expect(page.locator(".pb-card")).toHaveCount(2);
  await page.goForward();
  await expect(page.locator(".pb-card")).toHaveCount(1);
  const body = await (
    await request.get("/api/projects?category=hardware&event=independent")
  ).json();
  expect(body.projects.map((p: { name: { zh: string } }) => p.name.zh)).toEqual(
    await page.locator(".pb-card h3").allTextContents(),
  );
  await page.getByLabel("搜索项目", { exact: true }).fill("不存在的作品");
  await expect(
    page.getByText("还没有找到这样的作品", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "清空筛选", exact: true }).click();
  await expect(page.locator(".pb-card")).toHaveCount(9);
  await page.getByLabel("搜索项目", { exact: true }).fill("  IdEa ATLAS  ");
  await expect(page.locator(".pb-card")).toHaveCount(1);
  await expect(page.locator(".pb-card h3")).toHaveText("灵感地图");
  await page.goto("/projects?page=999");
  await page.getByRole("button", { name: "返回第一页" }).click();
  await expect(page.locator(".pb-card")).toHaveCount(9);
  const response = await request.get("/api/projects");
  expect(response.headers()["cache-control"]).toBe("no-store");
  const data = await response.json();
  for (const p of data.projects)
    expect(Object.keys(p).sort()).toEqual(
      [
        "id",
        "name",
        "introduction",
        "cover",
        "category",
        "tags",
        "creator",
        "eventId",
        "event",
        "publishedAt",
        "demo",
        "stats",
      ].sort(),
    );
  expect((await request.post("/api/projects", { data: {} })).status()).toBe(
    405,
  );
  expect(
    (await request.post("/api/projects/files", { data: {} })).status(),
  ).toBe(405);
  expect((await request.get("/projects/idea-atlas")).status()).toBe(200);
  expect((await request.get("/api/events/demo/materials")).status()).toBe(401);
});

test("Project detail navigation preserves filters and supports media and activity links", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/projects?category=software&sort=oldest");
  await page
    .getByRole("link", { name: "查看项目: 灵感地图", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects\/idea-atlas\?returnTo=/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("灵感地图");
  await expect(page.locator(".pi-detail-header .pb-tags span")).toHaveCount(4);
  await expect(page.locator(".pi-description")).toContainText(
    "验证方向与当前阶段",
  );
  await page.getByRole("button", { name: "放大项目图片" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "放大项目图片" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "下一张图片" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".pi-gallery-controls")).toContainText("2 / 2");
  await page.getByRole("link", { name: "返回项目展区", exact: true }).click();
  await expect(page).toHaveURL(
    /category=software.*sort=oldest|sort=oldest.*category=software/,
  );
  await expect(page.getByLabel("项目排序")).toHaveValue("oldest");
  await page.goto("/projects");
  await page.screenshot({
    path: info.outputPath("projects-desktop.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "查看项目: 灵感地图", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("灵感地图");
  await page.screenshot({
    path: info.outputPath("project-detail.png"),
    fullPage: true,
  });
  await page.locator('.pi-detail-actions a[href="/events/demo"]').click();
  await expect(page).toHaveURL(/\/events\/demo$/);
  await page.locator('.pc-shortcuts a[href="/events/demo/register"]').click();
  await expect(page).toHaveURL(/login\?next=%2Fevents%2Fdemo%2Fregister$/);
});

test("Bilingual mobile gallery, missing images, reduced motion and honest submission entry", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/projects/atlas.svg", (route) => route.abort());
  await page.goto("/projects");
  await expect(page.getByTestId("project-cover-fallback")).toHaveCount(1);
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Every idea",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const cols = await page
      .locator(".pb-grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      );
    expect(cols).toBe(width === 768 ? 2 : 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: info.outputPath("projects-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "View project: Idea Atlas", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Idea Atlas",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Enlarge project image" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close image" }).click();
  await page
    .getByRole("link", { name: "Back to projects", exact: true })
    .click();
  await page
    .locator(".pb-hero")
    .getByRole("link", { name: "Submit a project", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\/submit$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "coming soon",
  );
  await expect(page.locator("form,input,textarea")).toHaveCount(0);
  await page.getByRole("button", { name: "切换为中文" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "项目提交即将开放",
  );
  await page.getByRole("link", { name: "返回项目展区" }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test("Search ignores stale responses, handles network failure and retries", async ({
  page,
}) => {
  await page.goto("/projects");
  let finishSlow!: () => void;
  const slowFinished = new Promise<void>((resolve) => {
    finishSlow = resolve;
  });
  await page.route("**/api/projects?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");
    if (query === "atlas")
      await new Promise((resolve) => setTimeout(resolve, 900));
    try {
      await route.continue();
    } finally {
      if (query === "atlas") finishSlow();
    }
  });
  const search = page.getByLabel("搜索项目", { exact: true });
  const started = page.waitForRequest((request) =>
    request.url().includes("q=atlas"),
  );
  await search.fill("atlas");
  await started;
  await search.fill("garden");
  await expect(page.locator(".pb-card h3")).toHaveText("口袋花园");
  await slowFinished;
  await expect(page.locator(".pb-card h3")).toHaveText("口袋花园");
  await page.unroute("**/api/projects?**");
  await page.route("**/api/projects?**", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await search.fill("echo");
  await expect(page.locator(".pb-results").getByRole("alert")).toContainText(
    "项目暂时加载失败",
  );
  await page.unroute("**/api/projects?**");
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.locator(".pb-card h3")).toHaveText("回声岛");
});

import { test, expect } from "@playwright/test";
test("Core website exposes email login and keeps independent module routes absent", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await expect(page.getByLabel("邮箱地址")).toBeVisible();
  await expect(page.getByRole("button", { name: /使用 Logto/ })).toHaveCount(0);
  for (const endpoint of [
    "/preview/ticketing/demo",
    "/api/preview/ticketing/demo",
    "/api/preview/ticketing/demo/orders",
    "/account/security",
    "/auth/oidc/complete",
    "/api/account/identity",
    "/api/auth/oidc/pending",
    "/api/auth/oidc/callback",
  ])
    expect((await request.get(endpoint)).status()).toBe(404);
  for (const action of ["start", "confirm", "cancel", "logout"])
    expect(
      (await request.post("/api/auth/oidc/" + action, { data: {} })).status(),
    ).toBe(404);
});

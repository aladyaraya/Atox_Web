import {
  test,
  expect,
  request as apiFactory,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { seedMaterialSubmission } from "../fixtures/material-submission";
const origin = "http://127.0.0.1:3104",
  appA = "http://127.0.0.1:3401",
  mailpit = "http://127.0.0.1:13325";
const fixture = async () =>
  JSON.parse(
    await readFile(
      path.join(process.env.OIDC_FIXTURE_DIR!, "fixture.json"),
      "utf8",
    ),
  );
async function emailVerify(
  page: Page,
  request: APIRequestContext,
  email: string,
  register = true,
) {
  // The website button first awaits its start API before navigating; inspect
  // provider controls only after that navigation, never the website DOM.
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3301\//);
  await expect(
    page.locator('input[type="email"],input[name="identifier"]').first(),
  ).toBeVisible();
  if (register) {
    const link = page.getByRole("link", {
      name: /create(?: an)? account|sign up/i,
    });
    if (await link.count()) await link.first().click();
  }
  const input = page
    .locator('input[type="email"],input[name="identifier"]')
    .first();
  await expect(input).toBeVisible();
  await input.fill(email);
  const sentAfter = Date.now() - 1000;
  await page
    .getByRole("button", {
      name: /continue|create(?: an)? account|sign in|register/i,
    })
    .first()
    .click();
  let code = "";
  await expect
    .poll(
      async () => {
        const list = await (
          await request.get(mailpit + "/api/v1/messages")
        ).json();
        for (const item of list.messages ?? []) {
          const message = await (
            await request.get(mailpit + "/api/v1/message/" + item.ID)
          ).json();
          if (
            message.To?.some(
              (to: { Address: string }) => to.Address === email,
            ) &&
            new Date(message.Date).getTime() >= sentAfter
          ) {
            code = /\b\d{6}\b/.exec(message.Text)?.[0] ?? "";
            if (code) return true;
          }
        }
        return false;
      },
      { message: "Test email delivered to isolated Mailpit" },
    )
    .toBe(true);
  const inputs = page.locator(
    'input[autocomplete="one-time-code"],input[inputmode="numeric"]',
  );
  if ((await inputs.count()) === 1) await inputs.fill(code);
  else for (let i = 0; i < code.length; i++) await inputs.nth(i).fill(code[i]);
  const submit = page.getByRole("button", {
    name: /continue|verify|create(?: an)? account|sign in|register/i,
  });
  if (
    (await submit.count()) &&
    (await submit.first().isVisible()) &&
    (await submit.first().isEnabled())
  )
    await submit.first().click();
}
async function control(
  request: APIRequestContext,
  route: string,
  body: object,
) {
  const data = await fixture();
  const response = await request.post("http://127.0.0.1:3105/" + route, {
    headers: { "X-Fixture-Secret": data.controlSecret },
    data: body,
    timeout: 120_000,
  });
  expect(response.status()).toBe(200);
}
test("real website M001 login, central SSO, local session persistence and scoped logout", async ({
  page,
  context,
  request,
}) => {
  const email = "new-" + Date.now() + "@m014.example.test";
  await page.goto("/login?next=%2Fevents%2Fdemo%2Fmaterials");
  await page.getByRole("button", { name: /使用 Logto/ }).click();
  await emailVerify(page, request, email);
  await expect(page).toHaveURL(origin + "/events/demo/materials");
  const me = await (await context.request.get(origin + "/api/auth/me")).json();
  expect(me.user.email).toBe(email);
  expect((await context.request.get(origin + "/api/admin/me")).status()).toBe(
    403,
  );
  const cookies = await context.cookies();
  const local = cookies.find((c) => c.name === "hackathon_session");
  expect(local?.httpOnly).toBe(true);
  await page.goto(appA);
  await page.getByRole("link", { name: "邮箱登录", exact: true }).click();
  await expect(page).toHaveURL(appA + "/");
  const identity = await (await context.request.get(appA + "/me")).json();
  expect(identity.email).toBe(email);
  await control(request, "restart", {});
  expect(
    (await (await context.request.get(origin + "/api/auth/me")).json()).user.id,
  ).toBe(me.user.id);
  await page.goto(origin + "/account");
  await page.getByRole("button", { name: /退出登录/ }).click();
  await expect(page).toHaveURL(origin + "/login");
  expect((await context.request.get(origin + "/api/auth/me")).status()).toBe(
    401,
  );
  expect((await context.request.get(appA + "/me")).status()).toBe(200);
  await page.getByRole("button", { name: /使用 Logto/ }).click();
  await expect(page).toHaveURL(origin + "/account");
  expect(
    (await (await context.request.get(origin + "/api/auth/me")).json()).user.id,
  ).toBe(me.user.id);
  await page.goto(origin + "/account/security");
  await page
    .getByRole("button", { name: "退出本站及中央登录状态", exact: true })
    .click();
  await expect(page).toHaveURL(origin + "/login");
  expect((await context.request.get(origin + "/api/auth/me")).status()).toBe(
    401,
  );
  expect((await context.request.get(appA + "/me")).status()).toBe(200);
  await page.goto(appA);
  await page.getByRole("button", { name: "仅退出本应用", exact: true }).click();
  await page.getByRole("link", { name: "邮箱登录", exact: true }).click();
  await expect(
    page.locator('input[type="email"],input[name="identifier"]').first(),
  ).toBeVisible();
});
test("same email never auto-merges; fresh identity, offline evidence approval and explicit confirmation preserve old data and roles", async ({
  page,
  context,
  request,
}) => {
  const { owner } = await fixture();
  await context.addCookies([
    {
      name: "hackathon_session",
      value: owner.token,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  // Preserve real-shaped private attachments and formal materials in this sandbox.
  const api = await apiFactory.newContext({
    baseURL: origin,
    extraHTTPHeaders: {
      Origin: origin,
      Cookie: "hackathon_session=" + owner.token,
    },
  });
  const result = await seedMaterialSubmission(api, "OIDC preserved owner");
  await api.dispose();
  const formalName = result.payload.name;
  const logout = await context.request.post(origin + "/api/auth/logout", {
    headers: { Origin: origin },
    data: {},
  });
  expect(logout.status()).toBe(200);
  await page.goto("/login");
  await page.getByRole("button", { name: /使用 Logto/ }).click();
  await emailVerify(page, request, owner.email);
  await expect(page).toHaveURL(origin + "/auth/oidc/complete");
  await expect(
    page.getByRole("heading", { name: "发现已有账号，尚未关联" }),
  ).toBeVisible();
  expect((await context.request.get(origin + "/api/auth/me")).status()).toBe(
    401,
  );
  await page.getByRole("button", { name: "重新验证身份并申请关联" }).click();
  await emailVerify(page, request, owner.email, false);
  await expect(page).toHaveURL(origin + "/auth/oidc/complete");
  const pending = await (
    await context.request.get(origin + "/api/auth/oidc/pending")
  ).json();
  expect(pending.status).toBe("awaiting_approval");
  const before = await context.request.post(origin + "/api/auth/oidc/confirm", {
    headers: { Origin: origin },
    data: {},
  });
  expect(before.status()).toBe(409);
  await control(request, "approve", { requestId: pending.requestId });
  await page.getByRole("button", { name: "刷新核验状态" }).click();
  await expect(
    page.getByRole("button", { name: "确认关联并登录" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "确认关联并登录" }).click();
  await expect(page).toHaveURL(origin + "/account");
  expect(
    (await (await context.request.get(origin + "/api/auth/me")).json()).user.id,
  ).toBe(owner.id);
  expect(
    (await (await context.request.get(origin + "/api/account/profile")).json())
      .nickname,
  ).toBe("Original owner");
  expect((await context.request.get(origin + "/api/admin/me")).status()).toBe(
    200,
  );
  const material = await (
    await context.request.get(origin + "/api/events/demo/materials")
  ).json();
  expect(material.official.name).toBe(formalName);
  expect(
    (
      await context.request.get(
        origin + "/api/events/demo/files/" + material.official.coverId,
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await context.request.get(
        origin + "/api/events/demo/files/" + material.official.documentId,
      )
    ).status(),
  ).toBe(200);
});
test("forged callbacks, foreign origins, disabled legacy delivery and browser success injection are rejected", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "/api/auth/oidc/callback?state=forged&code=forged",
    { maxRedirects: 0 },
  );
  expect(response.status()).toBe(303);
  expect(response.headers().location).toContain("/auth/oidc/complete?error=");
  expect(
    (
      await request.post("/api/auth/oidc/start", {
        headers: { Origin: "https://attacker.invalid" },
        data: { purpose: "login" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/auth/oidc/confirm", {
        headers: { Origin: origin },
        data: { userId: "forged", subject: "forged", success: true },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/auth/verify-code", {
        headers: { Origin: origin },
        data: { email: "owner@m014.example.test", code: "000000" },
      })
    ).status(),
  ).toBe(503);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /使用 Logto/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

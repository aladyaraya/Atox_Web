import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  apps,
  issuerEndpoint,
  mailpitEndpoint,
  clientsFile,
} from "../../app/config.mjs";
const a = apps.a.origin,
  b = apps.b.origin;
const email = "alice-" + Date.now() + "@m013.example.test";
const emailInput = (page) =>
  page.locator('input[type="email"],input[name="identifier"]').first();
async function identify(context, origin) {
  const response = await context.request.get(origin + "/me");
  return { status: response.status(), body: await response.json() };
}
async function waitForMail(request) {
  let body;
  await expect
    .poll(
      async () => {
        const list = await (
          await request.get(mailpitEndpoint + "/api/v1/messages")
        ).json();
        for (const mail of list.messages ?? []) {
          const message = await (
            await request.get(mailpitEndpoint + "/api/v1/message/" + mail.ID)
          ).json();
          if (message.To?.some((to) => to.Address === email)) {
            body = message.Text;
            return true;
          }
        }
        return false;
      },
      { message: "Local test email must reach Mailpit" },
    )
    .toBe(true);
  const code = /\b\d{6}\b/.exec(body)?.[0];
  if (!code)
    throw new Error("Local message did not contain a verification code.");
  return code;
}
async function fillCode(page, code) {
  const inputs = page.locator(
    'input[autocomplete="one-time-code"],input[inputmode="numeric"]',
  );
  const count = await inputs.count();
  if (count === 1) await inputs.fill(code);
  else {
    for (let i = 0; i < code.length; i++) await inputs.nth(i).fill(code[i]);
  }
  const submit = page.getByRole("button", {
    name: /continue|verify|create account/i,
  });
  if (
    (await submit.count()) &&
    (await submit.first().isVisible()) &&
    (await submit.first().isEnabled())
  )
    await submit.first().click();
}
async function arrive(page, origin) {
  // Logto may ask for application consent; it must never ask for another OTP.
  const consent = page.getByRole("button", {
    name: /authorize|allow|continue/i,
  });
  if (!page.url().startsWith(origin) && (await consent.count()))
    await consent.first().click();
  await expect(page).toHaveURL(origin + "/");
}

test("Real email verification, same issuer/subject, separate sessions and accurately scoped logout", async ({
  page,
  context,
  request,
}) => {
  const callbacks = [];
  const authorizations = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.origin === issuerEndpoint && url.pathname === "/oidc/auth")
      authorizations.push(url);
    if ([a, b].includes(url.origin) && url.pathname === "/callback")
      callbacks.push(req.url());
  });
  await page.goto(a);
  await page.getByRole("link", { name: "邮箱注册", exact: true }).click();
  await expect(emailInput(page)).toBeVisible();
  await emailInput(page).fill(email);
  await page.getByRole("button", { name: /continue|create account/i }).click();
  await fillCode(page, await waitForMail(request));
  await arrive(page, a);
  const first = await identify(context, a);
  expect(first.status).toBe(200);
  expect(first.body.emailVerified).toBe(true);
  expect(first.body.subject).toBeTruthy();
  const issuer = (
    await (
      await request.get(
        issuerEndpoint + "/oidc/.well-known/openid-configuration",
      )
    ).json()
  ).issuer;
  expect(first.body.issuer).toBe(issuer);
  expect((await identify(context, b)).status).toBe(401);
  const before = await (
    await request.get(mailpitEndpoint + "/api/v1/messages")
  ).json();
  await page.goto(b);
  await page.getByRole("link", { name: "邮箱登录", exact: true }).click();
  await arrive(page, b);
  const second = await identify(context, b);
  expect(second.status).toBe(200);
  expect(second.body.subject).toBe(first.body.subject);
  expect(second.body.issuer).toBe(first.body.issuer);
  const after = await (
    await request.get(mailpitEndpoint + "/api/v1/messages")
  ).json();
  expect(after.total).toBe(before.total);
  const cookies = await context.cookies();
  const ca = cookies.find((c) => c.name === apps.a.cookie),
    cb = cookies.find((c) => c.name === apps.b.cookie);
  expect(ca.value).not.toBe(cb.value);
  expect(ca.httpOnly && cb.httpOnly).toBe(true);
  expect(ca.sameSite).toBe("Lax");
  expect(cb.sameSite).toBe("Lax");
  for (const url of authorizations) {
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toHaveLength(43);
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBeTruthy();
  }
  expect(
    new Set(authorizations.map((url) => url.searchParams.get("client_id")))
      .size,
  ).toBe(2);
  await page.goto(a);
  await page.getByRole("button", { name: "仅退出本应用", exact: true }).click();
  expect((await identify(context, a)).status).toBe(401);
  expect((await identify(context, b)).status).toBe(200);
  await page.getByRole("link", { name: "邮箱登录", exact: true }).click();
  await arrive(page, a);
  expect((await identify(context, a)).body.subject).toBe(first.body.subject);
  await page
    .getByRole("button", { name: "退出本应用及中央登录状态", exact: true })
    .click();
  await arrive(page, a);
  expect((await identify(context, a)).status).toBe(401);
  // Central logout is NOT global local-session revocation.
  expect((await identify(context, b)).status).toBe(200);
  await page.goto(b);
  await page.getByRole("button", { name: "仅退出本应用", exact: true }).click();
  await page.getByRole("link", { name: "邮箱登录", exact: true }).click();
  await expect(emailInput(page)).toBeVisible();
  // Successful callback URL must not replay into a new app session.
  expect((await request.get(callbacks[0])).status()).toBe(400);
});

test("Forged/cross-client callbacks, external redirect, invalid client and missing verifier are rejected", async ({
  request,
}) => {
  const clients = JSON.parse(await readFile(clientsFile, "utf8"));
  expect(
    (await request.get(a + "/callback?code=forged&state=forged")).status(),
  ).toBe(400);
  expect(
    (await request.get(b + "/callback?code=forged&state=forged")).status(),
  ).toBe(400);
  expect(
    (await request.get(a + "/login?next=https://attacker.invalid")).status(),
  ).toBe(400);
  expect(
    (
      await request.post(a + "/logout/local", {
        headers: { Origin: "https://attacker.invalid" },
      })
    ).status(),
  ).toBe(403);
  const login = await request.get(a + "/login", { maxRedirects: 0 });
  const authorization = new URL(login.headers().location);
  authorization.searchParams.set(
    "redirect_uri",
    "https://attacker.invalid/callback",
  );
  const invalidRedirect = await request.get(authorization.toString(), {
    maxRedirects: 0,
  });
  expect(invalidRedirect.status()).toBeGreaterThanOrEqual(400);
  expect(invalidRedirect.headers().location ?? "").not.toContain(
    "attacker.invalid",
  );
  for (const [secret, verifier] of [
    ["invalid-secret", "x".repeat(43)],
    [clients.a.appSecret, undefined],
  ]) {
    const response = await request.post(issuerEndpoint + "/oidc/token", {
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(clients.a.appId + ":" + secret).toString("base64"),
      },
      form: {
        grant_type: "authorization_code",
        client_id: clients.a.appId,
        code: "invalid-code",
        redirect_uri: a + "/callback",
        ...(verifier ? { code_verifier: verifier } : {}),
      },
    });
    expect([400, 401]).toContain(response.status());
  }
  expect((await request.get(a + "/me")).status()).toBe(401);
});

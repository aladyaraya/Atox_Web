import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { redact } from "./redacted-reporter.mjs";
import { enabled, getConfig } from "../app/config.mjs";
import { createLabApp } from "../app/server.mjs";

const env = {
  NODE_ENV: "development",
  ENABLE_LOGTO_LAB: "true",
  LOGTO_LAB_ACK: "isolated-loopback-test-only",
  LOGTO_LAB_COOKIE_SECRET_A: "a".repeat(64),
  LOGTO_LAB_COOKIE_SECRET_B: "b".repeat(64),
};
const clients = {
  a: { appId: "test-a", appSecret: "not-a-real-client-secret-a" },
  b: { appId: "test-b", appSecret: "not-a-real-client-secret-b" },
};
test("Actual startup remains disabled in production despite explicit lab enable", async (t) => {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../app/start.mjs", import.meta.url)), "a"],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        ENABLE_LOGTO_LAB: "true",
        LOGTO_LAB_ACK: "isolated-loopback-test-only",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(() => child.kill());
  await Promise.race([
    once(child.stdout, "data"),
    once(child, "exit").then(() => {
      throw new Error(
        "Disabled test process did not start; stop any existing lab app on port 3401.",
      );
    }),
  ]);
  for (const route of [
    "/health",
    "/me",
    "/login",
    "/callback?code=invalid&state=invalid",
  ])
    assert.equal((await fetch("http://127.0.0.1:3401" + route)).status, 404);
});
test("Browser diagnostics remove callback query values, authorization and OTPs", () => {
  const message = redact(
    "navigation http://127.0.0.1:3401/callback?code=synthetic-value&state=synthetic-state Basic synthetic-credential code 123456",
  );
  assert.doesNotMatch(message, /synthetic|123456/);
  assert.match(message, /callback\?\[redacted\]/);
});
async function running(config, fn) {
  const server = createLabApp(config).listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = "http://127.0.0.1:" + server.address().port;
  if (config) config.origin = url;
  try {
    await fn(url);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test("Lab requires development, an explicit enable and local acknowledgement", () => {
  assert.equal(enabled(env), true);
  for (const change of [
    { NODE_ENV: "production" },
    { NODE_ENV: "test" },
    { ENABLE_LOGTO_LAB: "false" },
    { LOGTO_LAB_ACK: "" },
  ])
    assert.equal(enabled({ ...env, ...change }), false);
  assert.throws(() =>
    getConfig("a", clients, {
      ...env,
      LOGTO_LAB_COOKIE_SECRET_B: env.LOGTO_LAB_COOKIE_SECRET_A,
    }),
  );
  assert.throws(() => getConfig("a", { a: clients.a, b: clients.a }, env));
});
test("Disabled app returns 404 even for login, callback, identity and logout routes", async () => {
  await running(null, async (url) => {
    for (const route of [
      "/",
      "/login",
      "/register",
      "/callback?code=invalid&state=invalid",
      "/me",
      "/health",
    ])
      assert.equal((await fetch(url + route)).status, 404);
    assert.equal(
      (await fetch(url + "/logout/central", { method: "POST" })).status,
      404,
    );
  });
});
test("Invalid callbacks, hostile Host/Origin and token-free independent cookies", async () => {
  const a = getConfig("a", clients, env),
    b = getConfig("b", clients, env);
  await running(a, async (url) => {
    const home = await fetch(url);
    assert.equal(home.headers.get("cache-control"), "no-store");
    const cookie = home.headers.get("set-cookie");
    assert.match(cookie, /^m013_app_a=s%3A/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Domain=|id_token|access_token|refresh_token/);
    const page = await home.text();
    const csrf = /name="csrf" value="([a-f0-9]+)"/.exec(page)?.[1];
    // Anonymous page deliberately contains no logout form. Direct POST still rejects.
    assert.equal(csrf, undefined);
    assert.equal(
      (
        await fetch(url + "/logout/local", {
          method: "POST",
          headers: { Origin: "https://attacker.invalid" },
        })
      ).status,
      403,
    );
    const hostile = await new Promise((resolve, reject) => {
      get(url + "/me", { headers: { Host: "attacker.invalid" } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on("error", reject);
    });
    assert.equal(hostile, 404);
    const callback = await fetch(url + "/callback?code=forged&state=forged");
    assert.equal(callback.status, 400);
    assert.equal((await fetch(url + "/me")).status, 401);
    assert.equal(
      (await fetch(url + "/login?next=https://attacker.invalid")).status,
      400,
    );
    await running(b, async (other) => {
      assert.equal(
        (
          await fetch(other + "/me", {
            headers: { Cookie: cookie.split(";")[0] },
          })
        ).status,
        401,
      );
      assert.match(
        (await fetch(other)).headers.get("set-cookie"),
        /^m013_app_b=/,
      );
    });
  });
});

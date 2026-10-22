import { randomBytes, timingSafeEqual } from "node:crypto";
import express from "express";
import session from "express-session";
import LogtoClient, { UserScope } from "@logto/node";

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const renew = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
const save = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((e) => (e ? reject(e) : resolve())),
  );
const destroy = (req) =>
  new Promise((resolve, reject) =>
    req.session.destroy((e) => (e ? reject(e) : resolve())),
  );
function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
function csrf(req, config) {
  return (
    req.get("Origin") === config.origin &&
    equal(req.body?.csrf, req.session.csrf)
  );
}

export function createLabApp(config) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    });
    next();
  });
  if (!config) {
    app.use((_req, res) => res.sendStatus(404));
    return app;
  }
  app.use((req, res, next) => {
    if (req.get("Host") !== new URL(config.origin).host)
      return res.sendStatus(404);
    next();
  });
  // One MemoryStore per process/application. Tokens never enter browser cookies.
  // A restart intentionally ends this lab application's sessions.
  app.use(
    session({
      name: config.cookie,
      secret: config.cookieSecret,
      resave: false,
      saveUninitialized: false,
      proxy: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 30 * 60 * 1000,
        path: "/",
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "4kb" }));
  function client(req) {
    req.session.oidc ??= {};
    return new LogtoClient(
      {
        endpoint: config.endpoint,
        appId: config.appId,
        appSecret: config.appSecret,
        scopes: [UserScope.Email],
      },
      {
        storage: {
          getItem: async (key) => req.session.oidc[key] ?? null,
          setItem: async (key, value) => {
            req.session.oidc[key] = value;
          },
          removeItem: async (key) => {
            delete req.session.oidc[key];
          },
        },
        navigate: async (url) => {
          req.session.destination = url;
        },
      },
    );
  }
  const context = async (req) => client(req).getContext();
  const summary = (value) =>
    value.isAuthenticated
      ? {
          authenticated: true,
          issuer: value.claims.iss,
          subject: value.claims.sub,
          email: value.claims.email,
          emailVerified: value.claims.email_verified === true,
        }
      : { authenticated: false };
  app.get("/health", (_req, res) =>
    res.json({ ok: true, app: config.id, lab: true }),
  );
  app.get("/me", async (req, res) => {
    const user = summary(await context(req));
    res.status(user.authenticated ? 200 : 401).json(user);
  });
  app.get("/", async (req, res) => {
    const user = summary(await context(req));
    req.session.csrf ??= randomBytes(32).toString("hex");
    const form = (action, label) =>
      `<form method="post" action="${action}"><input type="hidden" name="csrf" value="${escape(req.session.csrf)}"><button>${label}</button></form>`;
    res
      .type("html")
      .send(
        `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>M013 · App ${config.id.toUpperCase()}</title><style>body{font:18px system-ui;background:#111;color:#eee;max-width:800px;margin:8vh auto;padding:24px}a{color:#c5a3ff}button{padding:12px;margin:10px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><main><h1>App ${config.id.toUpperCase()} · 隔离 OIDC 实验</h1><p>仅供本地测试，不连接当前网站，不用于生产。</p><pre>${escape(JSON.stringify(user, null, 2))}</pre>${user.authenticated ? form("/logout/local", "仅退出本应用") + form("/logout/central", "退出本应用及中央登录状态") : '<p><a href="/login">邮箱登录</a> · <a href="/register">邮箱注册</a></p>'}<p><a href="${config.id === "a" ? "http://127.0.0.1:3402" : "http://127.0.0.1:3401"}">打开另一个测试应用</a></p><p>中央退出不等于退出所有产品：另一个应用的已有本地会话可能继续有效。</p></main></html>`,
      );
  });
  async function login(req, res, register = false) {
    if (Object.keys(req.query).length) return res.sendStatus(400);
    await renew(req);
    req.session.nonce = randomBytes(32).toString("hex");
    const sdk = client(req);
    await sdk.signIn({
      redirectUri: config.origin + "/callback",
      extraParams: { nonce: req.session.nonce },
      ...(register ? { firstScreen: "register" } : {}),
    });
    const destination = req.session.destination;
    delete req.session.destination;
    await save(req);
    res.redirect(destination);
  }
  app.get("/login", (req, res) => login(req, res));
  app.get("/register", (req, res) => login(req, res, true));
  app.get("/callback", async (req, res) => {
    try {
      // SDK verifies state, PKCE, issuer, audience, signature and expiry.
      // This adapter additionally binds a nonce to the verified ID claims.
      await client(req).handleSignInCallback(config.origin + req.originalUrl);
      const value = await context(req);
      if (
        !value.isAuthenticated ||
        !equal(value.claims.nonce, req.session.nonce)
      )
        throw new Error("Missing authenticated context or nonce mismatch");
      const oidc = req.session.oidc;
      await renew(req);
      req.session.oidc = oidc;
      req.session.csrf = randomBytes(32).toString("hex");
      await save(req);
      res.redirect("/");
    } catch {
      await destroy(req);
      res.clearCookie(config.cookie, { path: "/" });
      res.status(400).send("OIDC callback rejected. Start a new login.");
    }
  });
  app.post("/logout/local", async (req, res) => {
    if (!csrf(req, config)) return res.sendStatus(403);
    await destroy(req);
    res.clearCookie(config.cookie, { path: "/" });
    res.redirect(303, "/");
  });
  app.post("/logout/central", async (req, res) => {
    if (!csrf(req, config)) return res.sendStatus(403);
    // SDK also attempts revocation of this client's refresh token; this does
    // not imply global revocation of other clients' local sessions/tokens.
    await client(req).signOut(config.origin + "/");
    const destination = req.session.destination;
    await destroy(req);
    res.clearCookie(config.cookie, { path: "/" });
    res.redirect(303, destination);
  });
  app.use((_req, res) => res.sendStatus(404));
  // Never print exception messages, tokens, callback codes or session contents.
  app.use((_error, _req, res, next) => {
    if (res.headersSent) return next();
    res.status(502).send("OIDC service unavailable; no identity accepted.");
  });
  return app;
}

import path from "node:path";
import { createHash } from "node:crypto";
import { OidcError } from "./errors";
import type { OidcTrust } from "./contracts";
export const FLOW_COOKIE = "hackathon_oidc_flow";
export const FLOW_SECONDS = 600;
export const OIDC_SESSION_SECONDS = 900;
export interface OidcConfig {
  endpoint: string;
  issuer: string;
  appId: string;
  appSecret: string;
  origin: string;
  callback: string;
  postLogout: string;
  trust: OidcTrust;
  fingerprint: string;
}
export function getOidcConfig(env = process.env): OidcConfig | null {
  // This phase is intentionally local development only, including when flags
  // or a copied environment file accidentally reach a production build.
  if (env.NODE_ENV !== "development" || env.ENABLE_LOGTO_LOGIN !== "true")
    return null;
  try {
    const origin = new URL(env.APP_ORIGIN || "http://localhost:3000");
    const endpoint = new URL(env.LOGTO_ENDPOINT || "");
    const issuer = new URL(env.LOGTO_ISSUER || "");
    const local = (u: URL) =>
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    for (const url of [origin, endpoint, issuer]) {
      if (
        (url.protocol !== "https:" && !local(url)) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
    }
    if (
      origin.pathname !== "/" ||
      endpoint.origin !== issuer.origin ||
      !env.LOGTO_APP_ID ||
      !env.LOGTO_APP_SECRET ||
      !env.OIDC_ENCRYPTION_SECRET ||
      env.OIDC_ENCRYPTION_SECRET.length < 32 ||
      env.OIDC_ENCRYPTION_SECRET === env.AUTH_SECRET
    )
      throw new Error();
    const trust = env.OIDC_EMAIL_TRUST;
    if (trust !== "local-sandbox" && trust !== "verified-email")
      throw new Error();
    if (trust === "local-sandbox") {
      const root = path.resolve(".data/oidc-sandbox");
      const db = path.resolve(env.DB_PATH || ".data/pglite");
      if (!local(origin) || !local(endpoint) || !db.startsWith(root + path.sep))
        throw new Error();
    } else if (
      env.OIDC_VERIFIED_EMAIL_ACK !== "trusted-provider-and-real-email-reviewed"
    )
      throw new Error();
    const normalizedEndpoint = endpoint.href.replace(/\/$/, "");
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          issuer.href,
          env.LOGTO_APP_ID,
          trust,
          env.OIDC_SESSION_VERSION || "1",
          origin.origin,
        ]),
      )
      .digest("hex");
    return {
      origin: origin.origin,
      endpoint: normalizedEndpoint,
      issuer: issuer.href,
      appId: env.LOGTO_APP_ID,
      appSecret: env.LOGTO_APP_SECRET,
      callback: origin.origin + "/api/auth/oidc/callback",
      postLogout: origin.origin + "/login",
      trust,
      fingerprint,
    };
  } catch {
    throw new OidcError("DISABLED", 503);
  }
}
export function requireOidcConfig() {
  const config = getOidcConfig();
  if (!config) throw new OidcError("DISABLED", 404);
  return config;
}
export function oidcOptions() {
  try {
    const config = getOidcConfig();
    return { enabled: !!config, sandbox: config?.trust === "local-sandbox" };
  } catch {
    return { enabled: false, sandbox: false };
  }
}

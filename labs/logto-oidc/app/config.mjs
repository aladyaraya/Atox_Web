import { fileURLToPath } from "node:url";
import path from "node:path";

export const labRoot = fileURLToPath(new URL("../", import.meta.url));
export const issuerEndpoint = "http://127.0.0.1:3301";
export const mailpitEndpoint = "http://127.0.0.1:13325";
export const apps = Object.freeze({
  a: { origin: "http://127.0.0.1:3401", port: 3401, cookie: "m013_app_a" },
  b: { origin: "http://127.0.0.1:3402", port: 3402, cookie: "m013_app_b" },
});
export const clientsFile = path.join(labRoot, ".data/clients.json");
export function loadLabEnv() {
  try {
    process.loadEnvFile(path.join(labRoot, ".env.lab"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
export function enabled(env = process.env) {
  return (
    env.NODE_ENV === "development" &&
    env.ENABLE_LOGTO_LAB === "true" &&
    env.LOGTO_LAB_ACK === "isolated-loopback-test-only"
  );
}
export function requireLab(env = process.env) {
  if (!enabled(env))
    throw new Error(
      "M013 is disabled; development plus explicit local acknowledgement required.",
    );
}
export function getConfig(id, clients, env = process.env) {
  if (!Object.hasOwn(apps, id)) throw new Error("Unknown lab application.");
  requireLab(env);
  const secret = env["LOGTO_LAB_COOKIE_SECRET_" + id.toUpperCase()];
  const other = env["LOGTO_LAB_COOKIE_SECRET_" + (id === "a" ? "B" : "A")];
  if (typeof secret !== "string" || secret.length < 32 || secret === other)
    throw new Error(
      "Each application needs a distinct random cookie secret (32+ characters).",
    );
  if (
    !clients?.[id]?.appId ||
    !clients[id].appSecret ||
    clients.a.appId === clients.b.appId
  )
    throw new Error("Provision two distinct OIDC clients first.");
  return {
    ...apps[id],
    id,
    cookieSecret: secret,
    endpoint: issuerEndpoint,
    appId: clients[id].appId,
    appSecret: clients[id].appSecret,
  };
}

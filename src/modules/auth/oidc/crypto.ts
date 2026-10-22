import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { OidcError } from "./errors";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const opaque = () => randomBytes(32).toString("hex");
function key() {
  const value = process.env.OIDC_ENCRYPTION_SECRET;
  if (!value || value.length < 32) throw new OidcError("DISABLED", 503);
  return createHash("sha256")
    .update("M014 encryption\0" + value)
    .digest();
}
export function seal(value: unknown, purpose: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function unseal<T>(value: string, purpose: string): T {
  try {
    const data = Buffer.from(value, "base64url");
    const cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
    cipher.setAAD(Buffer.from(purpose));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        cipher.update(data.subarray(28)),
        cipher.final(),
      ]).toString("utf8"),
    ) as T;
  } catch {
    throw new OidcError("INVALID_FLOW", 400);
  }
}
export function match(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function centralCsrf(token: string) {
  return createHmac("sha256", key())
    .update("central-logout\0" + token)
    .digest("hex");
}

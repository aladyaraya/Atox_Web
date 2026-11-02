import type LogtoClient from "@logto/node";
import type { OidcConfig } from "./config";
import { OidcError } from "./errors";
import { match } from "./crypto";

export type SdkState = Record<string, string>;
/** Only produced after the official SDK validates a callback. Never an HTTP input. */
export interface VerifiedIdentity {
  issuer: string;
  subject: string;
  email: string;
  idToken: string;
  expiresAt: number;
  authenticatedAt?: number;
}
async function client(config: OidcConfig, storage: SdkState) {
  // The official SDK is ESM-only; dynamic import also supports the repository's
  // existing CommonJS-compatible tsx service/maintenance commands.
  const { default: LogtoClient, UserScope } = await import("@logto/node");
  let destination = "";
  const sdk = new LogtoClient(
    {
      endpoint: config.endpoint,
      appId: config.appId,
      appSecret: config.appSecret,
      scopes: [UserScope.Email],
    },
    {
      storage: {
        getItem: async (key) => storage[key] ?? null,
        setItem: async (key, value) => {
          storage[key] = value;
        },
        removeItem: async (key) => {
          delete storage[key];
        },
      },
      navigate: async (url) => {
        destination = url;
      },
    },
  );
  return { sdk, destination: () => destination };
}
async function pin(sdk: LogtoClient, config: OidcConfig) {
  const metadata = await sdk.getOidcConfig();
  if (metadata.issuer !== config.issuer)
    throw new OidcError("CALLBACK_REJECTED");
  for (const value of [
    metadata.authorizationEndpoint,
    metadata.tokenEndpoint,
    metadata.jwksUri,
    metadata.endSessionEndpoint,
  ]) {
    if (!value) throw new OidcError("CALLBACK_REJECTED");
    const url = new URL(value);
    if (
      url.origin !== new URL(config.endpoint).origin ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new OidcError("CALLBACK_REJECTED");
  }
}
export async function beginAuthorization(
  config: OidcConfig,
  nonce: string,
  fresh: boolean,
) {
  const storage: SdkState = {};
  const instance = await client(config, storage);
  try {
    await pin(instance.sdk, config);
    await instance.sdk.signIn({
      redirectUri: config.callback,
      ...(fresh ? { prompt: (await import("@logto/node")).Prompt.Login } : {}),
      extraParams: { nonce, ...(fresh ? { max_age: "0" } : {}) },
    });
    const url = new URL(instance.destination());
    if (
      url.origin !== new URL(config.endpoint).origin ||
      url.searchParams.get("code_challenge_method") !== "S256" ||
      !url.searchParams.get("state")
    )
      throw new Error();
    return { storage, url: url.href, state: url.searchParams.get("state")! };
  } catch {
    throw new OidcError("PROVIDER_UNAVAILABLE", 502);
  }
}
export async function verifyAuthorization(
  config: OidcConfig,
  storage: SdkState,
  callback: string,
  nonce: string,
  freshSince?: Date,
): Promise<VerifiedIdentity> {
  let stage = "initialization";
  try {
    const { sdk } = await client(config, storage);
    stage = "metadata";
    await pin(sdk, config);
    stage = "exchange";
    await sdk.handleSignInCallback(callback);
    stage = "claims";
    const claims = await sdk.getIdTokenClaims();
    const token = await sdk.getIdToken();
    if (
      !token ||
      claims.iss !== config.issuer ||
      !claims.sub ||
      !match(String(claims.nonce ?? ""), nonce)
    )
      throw new Error();
    if (claims.email_verified !== true || typeof claims.email !== "string")
      throw new OidcError("EMAIL_REQUIRED");
    const authenticatedAt =
      typeof claims.auth_time === "number" ? claims.auth_time : undefined;
    if (
      freshSince &&
      (!authenticatedAt ||
        authenticatedAt < freshSince.getTime() / 1000 - 30 ||
        authenticatedAt < Date.now() / 1000 - 300)
    )
      throw new Error();
    return {
      issuer: claims.iss,
      subject: claims.sub,
      email: claims.email,
      idToken: token,
      expiresAt: claims.exp * 1000,
      authenticatedAt,
    };
  } catch (error) {
    const candidate =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "unknown";
    if (process.env.NODE_ENV === "development")
      console.warn(
        "[M014] Provider verification rejected:",
        stage,
        /^[a-zA-Z0-9_.]{1,64}$/.test(candidate) ? candidate : "unknown",
      );
    if (error instanceof OidcError) throw error;
    throw new OidcError("CALLBACK_REJECTED");
  }
}
export async function centralLogoutUrl(config: OidcConfig, idToken: string) {
  const instance = await client(config, { idToken });
  await pin(instance.sdk, config);
  await instance.sdk.signOut(config.postLogout);
  const url = new URL(instance.destination());
  if (url.origin !== new URL(config.endpoint).origin)
    throw new OidcError("CALLBACK_REJECTED");
  return url.href;
}

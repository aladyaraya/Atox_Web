import { NextResponse } from "next/server";
import { AuthError } from "../errors";
import { SESSION_COOKIE } from "../policy";
import { FLOW_COOKIE, FLOW_SECONDS } from "./config";
import { OidcError } from "./errors";
import type { LoginReceipt } from "./service";
import type { OidcConfig } from "./config";
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
/** Next dev can canonicalize Request.url to its internal localhost hostname.
 * Validate the public Host/protocol/path, then use the configured registered
 * callback. The redirect origin is never derived from a request header.
 */
export function canonicalCallback(request: Request, config: OidcConfig) {
  const incoming = new URL(request.url),
    expected = new URL(config.callback);
  if (
    request.headers.get("host") !== expected.host ||
    incoming.protocol !== expected.protocol ||
    incoming.pathname !== expected.pathname
  )
    throw new OidcError("CALLBACK_REJECTED");
  return config.callback + incoming.search;
}
export function setFlowCookie(response: NextResponse, token: string) {
  response.cookies.set(FLOW_COOKIE, token, {
    ...options,
    maxAge: FLOW_SECONDS,
  });
}
export function clearFlowCookie(response: NextResponse) {
  response.cookies.set(FLOW_COOKIE, "", { ...options, maxAge: 0 });
}
export function setLoginCookie(response: NextResponse, receipt: LoginReceipt) {
  response.cookies.set(SESSION_COOKIE, receipt.token, {
    ...options,
    expires: new Date(receipt.expiresAt),
  });
  clearFlowCookie(response);
}
export function clearLoginCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", { ...options, maxAge: 0 });
}
export function oidcJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" },
  });
}
export function oidcFailure(error: unknown) {
  if (error instanceof OidcError || error instanceof AuthError)
    return oidcJson({ error: error.code }, error.status);
  return oidcJson({ error: "INTERNAL_ERROR" }, 500);
}
export function oidcRedirect(url: string) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

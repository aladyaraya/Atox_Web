import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/modules/auth/server";
import {
  finishOidc,
  FLOW_COOKIE,
  requireOidcConfig,
  OidcError,
} from "@/modules/auth/oidc/server";
import {
  oidcFailure,
  oidcRedirect,
  setLoginCookie,
  canonicalCallback,
} from "@/modules/auth/oidc/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  let origin: string;
  try {
    origin = requireOidcConfig().origin;
  } catch (error) {
    return oidcFailure(error);
  }
  try {
    const jar = await cookies();
    const receipt = await finishOidc(
      canonicalCallback(request, requireOidcConfig()),
      jar.get(FLOW_COOKIE)?.value,
      jar.get(SESSION_COOKIE)?.value,
    );
    const response = oidcRedirect(
      origin + (receipt?.returnTo || "/auth/oidc/complete"),
    );
    if (receipt) setLoginCookie(response, receipt);
    return response;
  } catch (error) {
    const code = error instanceof OidcError ? error.code : "CALLBACK_REJECTED";
    if (process.env.NODE_ENV === "development")
      console.warn("[M014] Website callback rejected:", code);
    return oidcRedirect(
      origin + "/auth/oidc/complete?error=" + encodeURIComponent(code),
    );
  }
}

import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/modules/auth/server";
import {
  logoutOidc,
  cancelOidc,
  FLOW_COOKIE,
  requireOidcConfig,
  OidcError,
} from "@/modules/auth/oidc/server";
import { assertOrigin } from "@/modules/auth/http";
import {
  oidcFailure,
  oidcRedirect,
  clearLoginCookie,
  clearFlowCookie,
} from "@/modules/auth/oidc/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOidcConfig();
    assertOrigin(request);
    if (
      !request.headers
        .get("content-type")
        ?.startsWith("application/x-www-form-urlencoded")
    )
      throw new OidcError("INVALID_INPUT");
    const reader = request.body?.getReader();
    if (!reader) throw new OidcError("INVALID_INPUT");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        throw new OidcError("INVALID_INPUT");
      }
      chunks.push(part.value);
    }
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8")),
      jar = await cookies();
    const destination = await logoutOidc(
      jar.get(SESSION_COOKIE)?.value,
      form.get("csrf"),
    );
    await cancelOidc(jar.get(FLOW_COOKIE)?.value);
    const response = oidcRedirect(destination);
    clearLoginCookie(response);
    clearFlowCookie(response);
    return response;
  } catch (error) {
    return oidcFailure(error);
  }
}

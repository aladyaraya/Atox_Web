import { cookies } from "next/headers";
import {
  cancelOidc,
  FLOW_COOKIE,
  requireOidcConfig,
} from "@/modules/auth/oidc/server";
import { assertOrigin, readBody } from "@/modules/auth/http";
import {
  oidcJson,
  oidcFailure,
  clearFlowCookie,
} from "@/modules/auth/oidc/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOidcConfig();
    assertOrigin(request);
    await readBody(request);
    await cancelOidc((await cookies()).get(FLOW_COOKIE)?.value);
    const response = oidcJson({ ok: true });
    clearFlowCookie(response);
    return response;
  } catch (error) {
    return oidcFailure(error);
  }
}

import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/modules/auth/server";
import {
  startOidc,
  FLOW_COOKIE,
  requireOidcConfig,
} from "@/modules/auth/oidc/server";
import { assertOrigin, readBody, requestIp } from "@/modules/auth/http";
import { oidcJson, oidcFailure, setFlowCookie } from "@/modules/auth/oidc/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOidcConfig();
    assertOrigin(request);
    const body = await readBody(request),
      jar = await cookies();
    const result = await startOidc(
      body.purpose,
      body.next,
      requestIp(request),
      jar.get(SESSION_COOKIE)?.value,
      jar.get(FLOW_COOKIE)?.value,
    );
    const response = oidcJson({ url: result.url });
    setFlowCookie(response, result.token);
    return response;
  } catch (error) {
    return oidcFailure(error);
  }
}

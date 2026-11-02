import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/modules/auth/server";
import {
  confirmIdentityRecovery,
  FLOW_COOKIE,
  requireOidcConfig,
} from "@/modules/auth/oidc/server";
import { assertOrigin, readBody } from "@/modules/auth/http";
import {
  oidcJson,
  oidcFailure,
  setLoginCookie,
} from "@/modules/auth/oidc/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOidcConfig();
    assertOrigin(request);
    await readBody(request);
    const jar = await cookies();
    const receipt = await confirmIdentityRecovery(
      jar.get(FLOW_COOKIE)?.value,
      jar.get(SESSION_COOKIE)?.value,
    );
    const response = oidcJson({ returnTo: receipt.returnTo });
    setLoginCookie(response, receipt);
    return response;
  } catch (error) {
    return oidcFailure(error);
  }
}

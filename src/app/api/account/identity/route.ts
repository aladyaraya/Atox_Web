import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/modules/auth/server";
import { identitySecurity } from "@/modules/auth/oidc/server";
import { oidcJson, oidcFailure } from "@/modules/auth/oidc/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return oidcJson(
      await identitySecurity((await cookies()).get(SESSION_COOKIE)?.value),
    );
  } catch (error) {
    return oidcFailure(error);
  }
}

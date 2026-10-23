import { cookies } from "next/headers";
import { revokeSession, SESSION_COOKIE } from "@/modules/auth/server";
import { assertOrigin, errorResponse, json } from "@/modules/auth/http";
import { cancelOidc, FLOW_COOKIE } from "@/modules/auth/oidc/server";
import { clearFlowCookie } from "@/modules/auth/oidc/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (token) await revokeSession(token);
    await cancelOidc((await cookies()).get(FLOW_COOKIE)?.value);
    const response = json({ ok: true });
    clearFlowCookie(response);
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

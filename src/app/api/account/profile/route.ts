import {
  getCurrentUser,
  getAccountProfile,
  updateNickname,
  ProfileError,
} from "@/modules/auth/server";
import { assertOrigin, json, readBody } from "@/modules/auth/http";
import { AuthError } from "@/modules/auth/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function run(request: Request, mutate: boolean) {
  try {
    if (mutate) assertOrigin(request);
    const user = await getCurrentUser();
    if (!user) return json({ error: "UNAUTHENTICATED" }, 401);
    return json(
      mutate
        ? await updateNickname(user, await readBody(request))
        : await getAccountProfile(user),
    );
  } catch (e) {
    if (e instanceof ProfileError || e instanceof AuthError)
      return json({ error: e.code }, e.status);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
}
export async function GET(request: Request) {
  return run(request, false);
}
export async function PUT(request: Request) {
  return run(request, true);
}

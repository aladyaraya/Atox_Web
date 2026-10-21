import { getCurrentUser } from "../auth/server";
import { assertOrigin } from "../auth/http";
import { AuthError } from "../auth/errors";
import { ProfileError } from "../auth/profile";
import { AdminError } from "../admin/errors";
import { json, readJson } from "../admin/http";
import type { AuthUser } from "../auth/contracts";
import { ProjectInteractionError } from "./errors";
export { json, readJson };
export async function handle(
  request: Request,
  mutate: boolean,
  requireLogin: boolean,
  action: (user: AuthUser | null) => Promise<unknown>,
) {
  try {
    if (mutate) assertOrigin(request);
    const user = await getCurrentUser();
    if (requireLogin && !user) return json({ error: "UNAUTHENTICATED" }, 401);
    return json(await action(user));
  } catch (error) {
    if (
      error instanceof ProjectInteractionError ||
      error instanceof ProfileError ||
      error instanceof AuthError ||
      error instanceof AdminError
    ) {
      const response = json(
        {
          error: error.code,
          ...(error instanceof ProjectInteractionError && error.retryAfter
            ? { retryAfter: error.retryAfter }
            : {}),
        },
        error.status,
      );
      if (error instanceof ProjectInteractionError && error.retryAfter)
        response.headers.set("Retry-After", String(error.retryAfter));
      return response;
    }
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
}
export function query(request: Request, keys: string[]) {
  const q = new URL(request.url).searchParams;
  if (
    [...q.keys()].some((k) => !keys.includes(k)) ||
    keys.some((k) => q.getAll(k).length > 1)
  )
    throw new ProjectInteractionError("INVALID_INPUT");
  return q;
}
export function readPage(raw: string | null) {
  if (raw !== null && !/^[1-9]\d{0,6}$/.test(raw))
    throw new ProjectInteractionError("INVALID_INPUT");
  const page = Number(raw ?? "1");
  if (page > 1000000) throw new ProjectInteractionError("INVALID_INPUT");
  return page;
}

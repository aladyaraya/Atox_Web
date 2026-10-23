import {
  getReviewPolicy,
  setReviewPolicy,
} from "@/modules/material-review/server";
import {
  json,
  readJson,
  withMaterialUser,
} from "@/modules/material-review/http";
import type { ReviewPolicyInput } from "@/modules/material-review/contracts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ eventId: string }> };
export async function GET(request: Request, context: Context) {
  return withMaterialUser(request, false, async (user) =>
    json(await getReviewPolicy(user, (await context.params).eventId)),
  );
}
export async function PATCH(request: Request, context: Context) {
  return withMaterialUser(request, true, async (user) =>
    json(
      await setReviewPolicy(
        user,
        (await context.params).eventId,
        await readJson<ReviewPolicyInput>(request),
      ),
    ),
  );
}

import { revokeApproval } from "@/modules/material-review/server";
import {
  json,
  readJson,
  withMaterialUser,
} from "@/modules/material-review/http";
import type { RevokeApprovalInput } from "@/modules/material-review/contracts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withMaterialUser(request, true, async (user) =>
    json({
      material: await revokeApproval(
        user,
        (await context.params).id,
        await readJson<RevokeApprovalInput>(request),
      ),
    }),
  );
}

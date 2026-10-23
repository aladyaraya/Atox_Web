import { saveCoordination } from "@/modules/material-review/server";
import {
  json,
  readJson,
  withMaterialUser,
} from "@/modules/material-review/http";
import type { CoordinationInput } from "@/modules/material-review/contracts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withMaterialUser(request, true, async (user) =>
    json({
      material: await saveCoordination(
        user,
        (await context.params).id,
        await readJson<CoordinationInput>(request),
      ),
    }),
  );
}

import { setLike } from "@/modules/project-interaction/server";
import { handle, readJson } from "@/modules/project-interaction/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return handle(request, true, true, async (user) =>
    setLike(user!, (await context.params).projectId, await readJson(request)),
  );
}

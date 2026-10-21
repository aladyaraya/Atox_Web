import { getProject } from "@/modules/project-board/server";
import { handle } from "@/modules/project-interaction/http";
import { ProjectInteractionError } from "@/modules/project-interaction/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  return handle(request, false, false, async (user) => {
    const result = await getProject((await context.params).projectId, user);
    if (!result) throw new ProjectInteractionError("NOT_FOUND", 404);
    return result;
  });
}

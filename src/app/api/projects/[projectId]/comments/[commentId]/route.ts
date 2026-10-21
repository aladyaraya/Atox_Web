import { deleteComment } from "@/modules/project-interaction/server";
import { handle } from "@/modules/project-interaction/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; commentId: string }> },
) {
  return handle(request, true, true, async (user) => {
    const p = await context.params;
    return deleteComment(user!, p.projectId, p.commentId);
  });
}

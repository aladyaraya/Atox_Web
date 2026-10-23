import { listManagedComments } from "@/modules/project-interaction/server";
import { handle, query, readPage } from "@/modules/project-interaction/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(request, false, true, async (user) => {
    const q = query(request, ["page", "projectId", "status", "commentId"]);
    return listManagedComments(user!, {
      page: readPage(q.get("page")),
      projectId: q.get("projectId") || undefined,
      status: q.get("status") || undefined,
      commentId: q.get("commentId") || undefined,
    });
  });
}

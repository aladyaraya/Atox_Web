import { listComments, addComment } from "@/modules/project-interaction/server";
import {
  handle,
  readJson,
  query,
  readPage,
} from "@/modules/project-interaction/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  return handle(request, false, false, async (user) =>
    listComments(
      (await context.params).projectId,
      user,
      readPage(query(request, ["page"]).get("page")),
    ),
  );
}
export async function POST(request: Request, context: Context) {
  return handle(request, true, true, async (user) =>
    addComment(
      user!,
      (await context.params).projectId,
      await readJson(request),
    ),
  );
}

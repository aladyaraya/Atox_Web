import { moderateComment } from "@/modules/project-interaction/server";
import { handle, readJson } from "@/modules/project-interaction/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  return handle(request, true, true, async (user) =>
    moderateComment(
      user!,
      (await context.params).commentId,
      await readJson(request),
    ),
  );
}

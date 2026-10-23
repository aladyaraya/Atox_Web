import { getProjects } from "@/modules/project-board/server";
import { parseFilters } from "@/modules/project-board/rules";
import { handle } from "@/modules/project-interaction/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(request, false, false, (user) =>
    getProjects(parseFilters(new URL(request.url).searchParams), user),
  );
}

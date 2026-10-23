import { json, withUser } from "@/modules/project-submission/http";
import { listManagedProjects } from "@/modules/project-submission/server";
export const runtime = "nodejs";
export async function GET(r: Request) {
  return withUser(r, false, async (user) => {
    const p = new URL(r.url).searchParams;
    return json(
      await listManagedProjects(user, {
        q: p.get("q") ?? undefined,
        source: p.get("source") ?? undefined,
        eventId: p.get("eventId") ?? undefined,
        category: p.get("category") ?? undefined,
        reviewState: p.get("reviewState") ?? undefined,
        publicationState: p.get("publicationState") ?? undefined,
        page: Number(p.get("page") ?? 1),
      }),
    );
  });
}

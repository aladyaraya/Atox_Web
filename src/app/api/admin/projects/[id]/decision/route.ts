import { json, readJson, withUser } from "@/modules/project-submission/http";
import { decideProject } from "@/modules/project-submission/server";
export const runtime = "nodejs";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  return withUser(r, true, async (user) =>
    json({
      project: await decideProject(
        user,
        (await c.params).id,
        await readJson(r),
      ),
    }),
  );
}

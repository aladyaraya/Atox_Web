import { json, readJson, withUser } from "@/modules/project-submission/http";
import { withdrawProject } from "@/modules/project-submission/server";
export const runtime = "nodejs";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  return withUser(r, true, async (user) =>
    json({
      project: await withdrawProject(
        user,
        (await c.params).id,
        await readJson(r),
      ),
    }),
  );
}

import { json, readJson, withUser } from "@/modules/project-submission/http";
import { saveDraft } from "@/modules/project-submission/server";
export const runtime = "nodejs";
export async function PUT(r: Request, c: { params: Promise<{ id: string }> }) {
  return withUser(r, true, async (user) =>
    json({
      project: await saveDraft(user, (await c.params).id, await readJson(r)),
    }),
  );
}

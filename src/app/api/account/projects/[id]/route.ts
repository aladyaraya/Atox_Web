import { json, withUser } from "@/modules/project-submission/http";
import {
  getOwnProject,
  projectOptions,
} from "@/modules/project-submission/server";
export const runtime = "nodejs";
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  return withUser(r, false, async (user) =>
    json({
      project: await getOwnProject(user, (await c.params).id),
      options: await projectOptions(user),
    }),
  );
}

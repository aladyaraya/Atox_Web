import { json, readJson, withUser } from "@/modules/project-submission/http";
import {
  createProject,
  listOwnProjects,
  projectOptions,
} from "@/modules/project-submission/server";
export const runtime = "nodejs";
export async function GET(r: Request) {
  return withUser(r, false, async (user) =>
    json({
      ...(await listOwnProjects(
        user,
        Number(new URL(r.url).searchParams.get("page") ?? 1),
      )),
      options: await projectOptions(user),
    }),
  );
}
export async function POST(r: Request) {
  return withUser(r, true, async (user) =>
    json(await createProject(user, await readJson(r))),
  );
}

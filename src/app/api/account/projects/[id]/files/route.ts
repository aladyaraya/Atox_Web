import { withUser, upload } from "@/modules/project-submission/http";
export const runtime = "nodejs";
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  return withUser(r, true, async (user) =>
    upload(r, user, (await c.params).id),
  );
}

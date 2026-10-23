import { fileResponse } from "@/modules/project-submission/http";
export const runtime = "nodejs";
export async function GET(
  _r: Request,
  c: { params: Promise<{ fileId: string }> },
) {
  return fileResponse((await c.params).fileId);
}

import { assertDatabaseSchema } from "@/lib/database-readiness";
import { getDb } from "@/lib/db";
import { checkDeployment } from "@/lib/deployment";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (checkDeployment().length) throw new Error();
    await assertDatabaseSchema(await getDb());
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

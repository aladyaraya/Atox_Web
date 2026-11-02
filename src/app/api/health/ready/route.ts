import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { checkDeployment } from "@/lib/deployment";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if (checkDeployment().length) throw new Error();
    await (await getDb()).execute(sql`select id from users limit 1`);
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

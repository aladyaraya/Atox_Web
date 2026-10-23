import { listMaterials } from "@/modules/material-review/server";
import { json, withMaterialUser } from "@/modules/material-review/http";
import { MaterialReviewError } from "@/modules/material-review/errors";
import type { ReviewStatus } from "@/modules/material-review/contracts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return withMaterialUser(request, false, async (user) => {
    const params = new URL(request.url).searchParams;
    if (
      [...params.keys()].some(
        (key) =>
          ![
            "page",
            "eventId",
            "status",
            "q",
            "trackId",
            "coordination",
            "sort",
          ].includes(key),
      ) ||
      [
        "page",
        "eventId",
        "status",
        "q",
        "trackId",
        "coordination",
        "sort",
      ].some((key) => params.getAll(key).length > 1)
    )
      throw new MaterialReviewError("INVALID_INPUT");
    const rawPage = params.get("page") ?? "1";
    if (!/^[1-9]\d{0,6}$/.test(rawPage))
      throw new MaterialReviewError("INVALID_INPUT");
    return json(
      await listMaterials(user, {
        page: Number(rawPage),
        eventId: params.get("eventId") || undefined,
        status: (params.get("status") || undefined) as ReviewStatus | undefined,
        q: params.get("q") || undefined,
        trackId: params.get("trackId") || undefined,
        coordination: (params.get("coordination") || undefined) as
          "required" | "none" | undefined,
        sort: (params.get("sort") || undefined) as
          "newest" | "oldest" | undefined,
      }),
    );
  });
}

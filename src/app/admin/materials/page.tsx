import { requireAdminPage } from "@/modules/admin/server";
import { AccessDenied } from "@/modules/admin/components/shared";
import { ReviewList } from "@/modules/material-review/components/list";
import { readFilters, reviewQuery } from "@/modules/material-review/rules";
import "@/modules/material-review/styles.css";
export const dynamic = "force-dynamic";
export default async function MaterialReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams(
    Object.entries(query).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const initial = readFilters(params),
    normalized = reviewQuery(initial);
  const identity = await requireAdminPage(
    "/admin/materials" + (normalized ? `?${normalized}` : ""),
    "admin:materials",
  );
  return identity ? (
    <ReviewList identity={identity} initial={initial} />
  ) : (
    <AccessDenied />
  );
}

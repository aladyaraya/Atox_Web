import { requireAdminPage } from "@/modules/admin/server";
import { AccessDenied } from "@/modules/admin/components/shared";
import { ReviewDetail } from "@/modules/material-review/components/detail";
import "@/modules/material-review/styles.css";
import { reviewReturn } from "@/modules/material-review/rules";
export const dynamic = "force-dynamic";
export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { submissionId } = await params;
  const returnTo = reviewReturn((await searchParams).returnTo);
  const identity = await requireAdminPage(
    `/admin/materials/${encodeURIComponent(submissionId)}?returnTo=${encodeURIComponent(returnTo)}`,
    "admin:materials",
  );
  return identity ? (
    <ReviewDetail
      key={submissionId}
      identity={identity}
      submissionId={submissionId}
      returnTo={returnTo}
    />
  ) : (
    <AccessDenied />
  );
}

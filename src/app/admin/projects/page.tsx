import { requireAdminPage } from "@/modules/admin/server";
import { AccessDenied } from "@/modules/admin/components/shared";
import { ProjectManagement } from "@/modules/project-submission/components/management";
import "@/modules/project-submission/styles.css";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams,
    p = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (
      typeof v === "string" &&
      [
        "q",
        "source",
        "eventId",
        "category",
        "reviewState",
        "publicationState",
        "page",
      ].includes(k)
    )
      p.set(k, v);
  const query = p.size ? "?" + p : "",
    identity = await requireAdminPage(
      "/admin/projects" + query,
      "admin:projects",
    );
  return identity ? (
    <ProjectManagement identity={identity} initialQuery={query} />
  ) : (
    <AccessDenied />
  );
}

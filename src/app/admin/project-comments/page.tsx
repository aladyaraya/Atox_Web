import { requireAdminPage } from "@/modules/admin/server";
import { AccessDenied } from "@/modules/admin/components/shared";
import { getCurrentUser } from "@/modules/auth/server";
import { projectRegistry } from "@/modules/project-board/config";
import { listManagedComments } from "@/modules/project-interaction/server";
import { CommentModeration } from "@/modules/project-interaction/components/moderation";
import "@/modules/project-interaction/styles.css";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const raw = Number(q.page ?? "1");
  const filters = {
    projectId:
      typeof q.projectId === "string" &&
      projectRegistry.some((p) => p.id === q.projectId)
        ? q.projectId
        : "",
    status:
      typeof q.status === "string" &&
      ["visible", "hidden", "deleted"].includes(q.status)
        ? q.status
        : "",
    page: Number.isSafeInteger(raw) && raw > 0 && raw <= 1000000 ? raw : 1,
  };
  const params = new URLSearchParams();
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.status) params.set("status", filters.status);
  if (filters.page > 1) params.set("page", String(filters.page));
  const identity = await requireAdminPage(
    "/admin/project-comments" + (params.size ? "?" + params : ""),
    "admin:project-comments",
  );
  if (!identity) return <AccessDenied />;
  const user = await getCurrentUser();
  if (!user) return <AccessDenied expired />;
  return (
    <CommentModeration
      identity={identity}
      initialFilters={filters}
      initial={await listManagedComments(user, filters)}
      projects={projectRegistry.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}

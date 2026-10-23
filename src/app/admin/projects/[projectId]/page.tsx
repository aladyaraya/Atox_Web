import { notFound } from "next/navigation";
import { requireAdminPage } from "@/modules/admin/server";
import { AccessDenied } from "@/modules/admin/components/shared";
import {
  managedProject,
  ProjectSubmissionError,
} from "@/modules/project-submission/server";
import { getCurrentUser } from "@/modules/auth/server";
import { ManagedProjectView } from "@/modules/project-submission/components/management";
import "@/modules/project-submission/styles.css";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { projectId } = await params,
    query = await searchParams,
    identity = await requireAdminPage(
      `/admin/projects/${projectId}`,
      "admin:projects",
    );
  if (!identity) return <AccessDenied />;
  const initial = await managedProject(
    (await getCurrentUser())!,
    projectId,
  ).catch((e: unknown) => {
    if (e instanceof ProjectSubmissionError && e.status === 404) notFound();
    throw e;
  });
  return (
    <ManagedProjectView
      identity={identity}
      initial={initial}
      returnTo={query.returnTo}
    />
  );
}

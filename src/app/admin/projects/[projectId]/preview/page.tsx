import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/modules/admin/server";
import { AccessDenied } from "@/modules/admin/components/shared";
import {
  managedProject,
  ProjectSubmissionError,
} from "@/modules/project-submission/server";
import { getCurrentUser } from "@/modules/auth/server";
import { PublicPreview } from "@/modules/project-submission/components/shared";
import "@/modules/project-submission/styles.css";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params,
    identity = await requireAdminPage(
      `/admin/projects/${projectId}/preview`,
      "admin:projects",
    );
  if (!identity) return <AccessDenied />;
  const project = await managedProject(
    (await getCurrentUser())!,
    projectId,
  ).catch((e: unknown) => {
    if (e instanceof ProjectSubmissionError && e.status === 404) notFound();
    throw e;
  });
  if (!project.preview) notFound();
  return (
    <main className="ps-main">
      <p className="adm-success">HACKATHON · 授权预览 / AUTHORIZED PREVIEW</p>
      <Link href={`/admin/projects/${projectId}`}>
        ← 返回管理 / Back to management
      </Link>
      <PublicPreview project={project.preview} />
    </main>
  );
}

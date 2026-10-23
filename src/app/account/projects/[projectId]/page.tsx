import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/server";
import {
  getOwnProject,
  projectOptions,
  ProjectSubmissionError,
} from "@/modules/project-submission/server";
import { ProjectEditor } from "@/modules/project-submission/components/editor";
import "@/modules/project-submission/styles.css";
import "@/modules/admin/styles.css";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params,
    user = await getCurrentUser();
  if (!user)
    redirect(
      "/login?next=" + encodeURIComponent(`/account/projects/${projectId}`),
    );
  const initial = await getOwnProject(user, projectId).catch((e: unknown) => {
    if (e instanceof ProjectSubmissionError && [403, 404].includes(e.status))
      notFound();
    throw e;
  });
  return (
    <ProjectEditor initial={initial} options={await projectOptions(user)} />
  );
}

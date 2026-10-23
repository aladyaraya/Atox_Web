import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser, getAccountProfile } from "@/modules/auth/server";
import { getProject } from "@/modules/project-board/server";
import { listComments } from "@/modules/project-interaction/server";
import { ProjectInteractionError } from "@/modules/project-interaction/errors";
import { ProjectDetail } from "@/modules/project-board/components/project-detail";
import { safeProjectReturn } from "@/modules/project-board/return-to";
import "@/modules/project-board/styles.css";
import "@/modules/project-interaction/styles.css";
type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const data = await getProject((await params).projectId);
    return {
      title: data?.project.name.zh + " · HACKATHON",
      description: data?.project.introduction.zh,
    };
  } catch {
    return { title: "项目 · HACKATHON" };
  }
}
export default async function Page({ params, searchParams }: Props) {
  const { projectId } = await params,
    query = await searchParams,
    user = await getCurrentUser();
  const data = await (async () => {
    try {
      const initial = await getProject(projectId, user);
      if (!initial) notFound();
      return {
        initial,
        comments: await listComments(projectId, user),
        profile: user ? await getAccountProfile(user) : null,
      };
    } catch (error) {
      if (error instanceof ProjectInteractionError && error.status === 404)
        notFound();
      throw error;
    }
  })();
  return (
    <ProjectDetail
      {...data}
      viewerId={user?.id ?? null}
      returnTo={safeProjectReturn(query.returnTo)}
    />
  );
}

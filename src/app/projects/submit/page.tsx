import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/server";
import { NewProject } from "@/modules/project-submission/components/owner-list";
import "@/modules/project-submission/styles.css";
import "@/modules/admin/styles.css";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "提交项目 · HACKATHON",
  description: "填写项目介绍及展示材料，提交官方审核与发布。",
};
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fprojects%2Fsubmit");
  return <NewProject userId={user.id} />;
}

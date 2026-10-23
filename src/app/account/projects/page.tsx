import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/server";
import { OwnProjects } from "@/modules/project-submission/components/owner-list";
import "@/modules/project-submission/styles.css";
import "@/modules/admin/styles.css";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (!(await getCurrentUser())) redirect("/login?next=%2Faccount%2Fprojects");
  return <OwnProjects />;
}

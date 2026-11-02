import { identityPage } from "@/modules/auth/oidc/page";
export const dynamic = "force-dynamic";
export default async function Page() {
  return identityPage(false);
}

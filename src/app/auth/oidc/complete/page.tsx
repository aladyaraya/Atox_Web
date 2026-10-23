import { identityPage } from "@/modules/auth/oidc/page";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  return identityPage(true, (await searchParams).error);
}

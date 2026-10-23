import { getCurrentUser, isDevMailEnabled } from "@/modules/auth/server";
import { redirect } from "next/navigation";
import { LoginForm } from "@/modules/auth/components/login-form";
import { safeReturnPath } from "@/modules/auth/return-path";
import { oidcOptions } from "@/modules/auth/oidc/server";
export const dynamic = "force-dynamic";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    oidcError?: string | string[];
  }>;
}) {
  const returnTo = safeReturnPath((await searchParams).next);
  if (await getCurrentUser()) redirect(returnTo);
  const options = oidcOptions();
  return (
    <LoginForm
      devMailEnabled={isDevMailEnabled()}
      returnTo={returnTo}
      oidc={options}
      centralError={(await searchParams).oidcError === "CENTRAL_UNAVAILABLE"}
    />
  );
}

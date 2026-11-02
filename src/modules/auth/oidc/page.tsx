import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, getCurrentUser } from "../server";
import { oidcOptions, FLOW_COOKIE } from "./config";
import { pendingOidc, identitySecurity } from "./service";
import { IdentitySecurityView } from "./components/security-view";
import { OidcError } from "./errors";
export async function identityPage(
  allowAnonymous: boolean,
  inputError?: unknown,
) {
  if (!oidcOptions().enabled) notFound();
  const jar = await cookies(),
    user = await getCurrentUser();
  if (!allowAnonymous && !user) redirect("/login?next=%2Faccount%2Fsecurity");
  let pending = null,
    error = typeof inputError === "string" ? inputError : "";
  try {
    pending = await pendingOidc(jar.get(FLOW_COOKIE)?.value);
  } catch (e) {
    error = e instanceof OidcError ? e.code : "INVALID_FLOW";
  }
  const security = user
    ? await identitySecurity(jar.get(SESSION_COOKIE)?.value)
    : null;
  return (
    <IdentitySecurityView
      initialPending={pending}
      security={security}
      signedIn={!!user}
      error={error}
    />
  );
}

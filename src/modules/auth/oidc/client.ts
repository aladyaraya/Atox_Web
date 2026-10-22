import type { PendingIdentityDto } from "./contracts";
export async function oidcRequest<T>(
  action: string,
  body?: object,
): Promise<T> {
  const response = await fetch("/api/auth/oidc/" + action, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string" ? data.error : "INTERNAL_ERROR",
    );
  return data as T;
}
export async function navigateOidc(purpose: "login" | "link", next: string) {
  const result = await oidcRequest<{ url: string }>("start", { purpose, next });
  window.location.assign(result.url);
}
export const loadPending = () =>
  oidcRequest<PendingIdentityDto | null>("pending");

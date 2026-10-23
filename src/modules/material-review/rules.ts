import type { ReviewFilters, ReviewPolicyState, ReviewMode } from "./contracts";
export function policyState(
  policy: {
    enabled: boolean;
    mode?: ReviewMode;
    opensAt: Date | string | null;
    closesAt: Date | string | null;
  } | null,
  now = new Date(),
): ReviewPolicyState {
  if (!policy) return "unconfigured";
  if (!policy.enabled) return "paused";
  if (policy.mode === "unlimited") return "open";
  if (!policy.opensAt || !policy.closesAt) return "unconfigured";
  if (+now < +new Date(policy.opensAt)) return "not_started";
  return +now >= +new Date(policy.closesAt) ? "closed" : "open";
}
export const filterKeys = [
  "eventId",
  "q",
  "trackId",
  "status",
  "coordination",
  "sort",
  "page",
] as const;
export function readFilters(query: URLSearchParams): ReviewFilters {
  return {
    eventId: query.get("eventId") || undefined,
    q: query.get("q") || undefined,
    trackId: query.get("trackId") || undefined,
    status: (["pending", "approved", "rejected"].includes(
      query.get("status") ?? "",
    )
      ? query.get("status")
      : undefined) as ReviewFilters["status"],
    coordination: (["required", "none"].includes(
      query.get("coordination") ?? "",
    )
      ? query.get("coordination")
      : undefined) as ReviewFilters["coordination"],
    sort: query.get("sort") === "oldest" ? "oldest" : undefined,
    page:
      /^[1-9]\d{0,6}$/.test(query.get("page") ?? "1") &&
      Number(query.get("page") ?? "1") <= 1000000
        ? Number(query.get("page") ?? "1")
        : 1,
  };
}
export function reviewQuery(filters: ReviewFilters) {
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    const value = key === "q" ? filters.q?.trim() : filters[key];
    if (
      value &&
      !(key === "page" && value === 1) &&
      !(key === "sort" && value === "newest")
    )
      query.set(key, String(value));
  }
  return query.toString();
}
export function reviewReturn(value: string | null | undefined) {
  if (!value || /[\\\u0000-\u0020]/.test(value)) return "/admin/materials";
  try {
    const parsed = new URL(value, "https://return.invalid");
    if (
      !value.startsWith("/admin/materials") ||
      parsed.origin !== "https://return.invalid" ||
      parsed.pathname !== "/admin/materials" ||
      parsed.hash ||
      [...parsed.searchParams.keys()].some(
        (key) => !(filterKeys as readonly string[]).includes(key),
      )
    )
      return "/admin/materials";
    const query = reviewQuery(readFilters(parsed.searchParams));
    return "/admin/materials" + (query ? `?${query}` : "");
  } catch {
    return "/admin/materials";
  }
}

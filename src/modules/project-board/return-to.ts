import { parseFilters, projectQuery } from "./rules";
export function safeProjectReturn(value: unknown) {
  if (typeof value !== "string" || /[\\\u0000-\u0020]/u.test(value))
    return "/projects";
  try {
    const url = new URL(value, "https://internal.invalid");
    if (
      !value.startsWith("/projects") ||
      url.origin !== "https://internal.invalid" ||
      url.pathname !== "/projects" ||
      url.hash
    )
      return "/projects";
    return "/projects" + projectQuery(parseFilters(url.searchParams));
  } catch {
    return "/projects";
  }
}

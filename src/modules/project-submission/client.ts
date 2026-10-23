export class SubmissionApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export async function projectRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers:
      body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : undefined,
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new SubmissionApiError(
      data.error ?? "INTERNAL_ERROR",
      response.status,
    );
  return data;
}

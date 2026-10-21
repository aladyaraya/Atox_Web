export class InteractionClientError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export async function interactionRequest<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new InteractionClientError("NETWORK", 0);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new InteractionClientError("UNKNOWN_RESULT", 500);
  }
  if (!response.ok)
    throw new InteractionClientError(
      data.error ?? "UNKNOWN_RESULT",
      response.status,
    );
  return data as T;
}

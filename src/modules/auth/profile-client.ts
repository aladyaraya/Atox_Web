import type { AccountProfileDto, NicknameInput } from "./profile-contracts";
export class ProfileClientError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export async function profileRequest(
  input?: NicknameInput,
): Promise<AccountProfileDto> {
  let response: Response;
  try {
    response = await fetch("/api/account/profile", {
      method: input ? "PUT" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: input ? { "Content-Type": "application/json" } : undefined,
      body: input ? JSON.stringify(input) : undefined,
    });
  } catch {
    throw new ProfileClientError("NETWORK");
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ProfileClientError("NETWORK");
  }
  if (!response.ok) throw new ProfileClientError(result.error ?? "NETWORK");
  return result;
}

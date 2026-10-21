/** Public account data is separate from the authentication/session contract. */
export interface AccountProfileDto {
  nickname: string | null;
  revision: number;
}
export interface NicknameInput {
  nickname: string;
  revision: number;
}
export type ProfileErrorCode = "INVALID_INPUT" | "REVISION_CONFLICT";

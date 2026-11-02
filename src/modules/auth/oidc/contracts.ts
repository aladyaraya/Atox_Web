export type OidcTrust = "local-sandbox" | "verified-email";
export type FlowStatus =
  | "authorizing"
  | "exchanging"
  | "needs_link"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";
export type OidcErrorCode =
  | "DISABLED"
  | "INVALID_INPUT"
  | "INVALID_FLOW"
  | "EXPIRED"
  | "PROVIDER_UNAVAILABLE"
  | "CALLBACK_REJECTED"
  | "IDENTITY_CONFLICT"
  | "APPROVAL_REQUIRED"
  | "SESSION_CHANGED"
  | "RATE_LIMITED"
  | "EMAIL_REQUIRED"
  | "OIDC_REQUIRED";
export interface PendingIdentityDto {
  requestId: string;
  status: FlowStatus;
  approved: boolean;
  expiresAt: string;
  returnTo: string;
  sandbox: boolean;
}
export interface IdentitySecurityDto {
  enabled: boolean;
  connected: boolean;
  method: "email" | "oidc";
  sandbox: boolean;
  centralLogoutCsrf: string | null;
}

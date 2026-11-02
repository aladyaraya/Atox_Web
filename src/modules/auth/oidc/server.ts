import "server-only";
/** M001's supported OIDC integration surface. Business modules keep using getCurrentUser. */
export {
  oidcOptions,
  requireOidcConfig,
  FLOW_COOKIE,
  FLOW_SECONDS,
} from "./config";
export {
  startOidc,
  finishOidc,
  pendingOidc,
  confirmIdentityRecovery,
  cancelOidc,
  identitySecurity,
  logoutOidc,
} from "./service";
export { OidcError } from "./errors";

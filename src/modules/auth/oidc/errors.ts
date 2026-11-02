import type { OidcErrorCode } from "./contracts";
export class OidcError extends Error {
  constructor(
    public code: OidcErrorCode,
    public status = 400,
  ) {
    super(code);
  }
}

import { productionMailConfig } from "../modules/auth/production-mail";
import { objectStorageConfig } from "./private-storage";
export function checkDeployment(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const errors: string[] = [];
  if (env.NODE_ENV !== "production" || env.DEPLOYMENT_MODE !== "production")
    errors.push("PRODUCTION_MODE_REQUIRED");
  if (env.DATABASE_DRIVER !== "postgres" || !env.DATABASE_URL)
    errors.push("POSTGRES_REQUIRED");
  if (env.DATABASE_AUTO_MIGRATE === "true")
    errors.push("OFFLINE_MIGRATIONS_REQUIRED");
  if (!productionMailConfig(env))
    errors.push("VERIFIED_TRANSACTIONAL_MAIL_REQUIRED");
  try {
    if (!objectStorageConfig(env)) errors.push("PRIVATE_OSS_REQUIRED");
  } catch {
    errors.push("PRIVATE_OSS_REQUIRED");
  }
  for (const key of [
    "ENABLE_DEV_MAIL",
    "ENABLE_TICKETING_PREVIEW",
    "ENABLE_LOGTO_LOGIN",
  ])
    if (env[key] !== "false") errors.push(key + "_MUST_BE_FALSE");
  if (env.TRUST_PROXY !== "true") errors.push("SANITIZING_PROXY_REQUIRED");
  if (!env.RELEASE_ID || !/^[a-f0-9]{7,40}$/.test(env.RELEASE_ID))
    errors.push("IMMUTABLE_RELEASE_ID_REQUIRED");
  if (env.LAUNCH_APPROVED !== "true")
    errors.push("OWNER_LAUNCH_APPROVAL_REQUIRED");
  return errors;
}

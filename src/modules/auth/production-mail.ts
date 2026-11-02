import nodemailer from "nodemailer";
import { AuthError } from "./errors";

/** Separate from local QQ mail. Configuration never promotes a test adapter. */
export function productionMailConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.MAIL_TRANSPORT !== "transactional-smtp") return null;
  try {
    const url = new URL(env.APP_ORIGIN || "");
    if (
      env.NODE_ENV !== "production" ||
      env.DEPLOYMENT_MODE !== "production" ||
      env.DATABASE_DRIVER !== "postgres" ||
      !env.DATABASE_URL ||
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      env.ENABLE_DEV_MAIL === "true" ||
      env.ENABLE_LOGTO_LOGIN === "true" ||
      env.ENABLE_TICKETING_PREVIEW === "true" ||
      env.MAIL_DOMAIN_VERIFIED !== "true" ||
      !env.SMTP_HOST ||
      !/^[a-z0-9.-]+$/i.test(env.SMTP_HOST) ||
      env.SMTP_PORT !== "465" ||
      env.SMTP_SECURE !== "true" ||
      !env.SMTP_USER ||
      !env.SMTP_PASSWORD ||
      !/^[^\s@<>,;:]+@[^\s@<>,;:]+\.[^\s@<>,;:]+$/.test(env.SMTP_FROM || "") ||
      env.SMTP_USER !== env.SMTP_FROM ||
      !env.AUTH_SECRET ||
      env.AUTH_SECRET.length < 32
    )
      return null;
    return {
      host: env.SMTP_HOST,
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
      from: env.SMTP_FROM!,
      name: env.MAIL_FROM_NAME || "HACKATHON",
    };
  } catch {
    return null;
  }
}
export async function deliverProductionMail(
  email: string,
  subject: string,
  text: string,
) {
  const config = productionMailConfig();
  if (!config) throw new AuthError("MAIL_DISABLED", 503);
  const transport = nodemailer.createTransport({
    host: config.host,
    port: 465,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({
      from: { name: config.name, address: config.from },
      to: email,
      subject,
      text,
    });
    if (!result.accepted.some((value) => String(value).toLowerCase() === email))
      throw new Error();
  } catch {
    throw new AuthError("MAIL_DELIVERY_FAILED", 502, 60);
  } finally {
    transport.close();
  }
}

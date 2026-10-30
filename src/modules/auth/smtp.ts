import path from "node:path";
import nodemailer from "nodemailer";
import { AuthError } from "./errors";

/** This adapter is intentionally limited to the isolated local email test. */
export function smtpConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.NODE_ENV !== "development" || env.MAIL_TRANSPORT !== "smtp")
    return null;
  try {
    const origin = new URL(env.APP_ORIGIN || "");
    const root = path.resolve(".data/mail-test");
    const relative = path.relative(
      root,
      path.resolve(env.DB_PATH || ".data/pglite"),
    );
    const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
    if (
      origin.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
      !relative ||
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      env.ENABLE_LOGTO_LOGIN === "true" ||
      env.SMTP_HOST !== "smtp.qq.com" ||
      env.SMTP_PORT !== "465" ||
      env.SMTP_SECURE !== "true" ||
      !env.SMTP_PASSWORD?.trim() ||
      !email.test(env.SMTP_USER || "") ||
      env.SMTP_FROM !== env.SMTP_USER ||
      !email.test(env.MAIL_TEST_RECIPIENT || "")
    )
      return null;
    return {
      host: env.SMTP_HOST,
      user: env.SMTP_USER!,
      pass: env.SMTP_PASSWORD.trim(),
      from: env.SMTP_FROM!,
      recipient: env.MAIL_TEST_RECIPIENT!.trim().toLowerCase(),
    };
  } catch {
    return null;
  }
}

export async function deliverSmtp(
  email: string,
  subject: string,
  text: string,
) {
  const config = smtpConfig();
  if (!config) throw new AuthError("MAIL_DISABLED", 503);
  if (email !== config.recipient)
    throw new AuthError("MAIL_RECIPIENT_NOT_ALLOWED", 400);
  const transport = nodemailer.createTransport({
    host: config.host,
    port: 465,
    secure: true,
    auth: { user: config.user, pass: config.pass },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    const result = await transport.sendMail({
      from: { name: "HACKATHON", address: config.from },
      to: email,
      subject,
      text,
    });
    if (
      !result.accepted.some(
        (address) => String(address).toLowerCase() === email,
      )
    )
      throw new Error("Not accepted");
  } catch {
    // Provider errors can contain credentials, recipient addresses or content.
    // Never return or log the original error. No automatic resend on timeout.
    throw new AuthError("MAIL_DELIVERY_FAILED", 502, 60);
  } finally {
    transport.close();
  }
}

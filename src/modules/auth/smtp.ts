import path from "node:path";
import nodemailer from "nodemailer";
import { AuthError } from "./errors";

// A single mailbox only; never let an input become an SMTP recipient list.
const mailboxPattern =
  /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

/** Explicit local scopes; never a production transport. */
export function smtpConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.NODE_ENV !== "development" || env.MAIL_TRANSPORT !== "smtp")
    return null;
  try {
    const origin = new URL(env.APP_ORIGIN || "");
    const scope = env.MAIL_LOCAL_SCOPE || "sandbox";
    if (scope !== "sandbox" && scope !== "website") return null;
    const root = path.resolve(
      scope === "website"
        ? env.MAIL_WEBSITE_DATA_ROOT || ".data"
        : ".data/mail-test",
    );
    const relative = path.relative(
      root,
      path.resolve(env.DB_PATH || ".data/pglite"),
    );
    const email = mailboxPattern;
    const allowAnyRecipient =
      scope === "website" || env.MAIL_TEST_ALLOW_ANY_RECIPIENT === "true";
    if (
      origin.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ||
      !relative ||
      relative.startsWith("..") ||
      path.isAbsolute(relative) ||
      (scope === "website" && env.ENABLE_DEV_MAIL !== "false") ||
      env.ENABLE_LOGTO_LOGIN === "true" ||
      env.SMTP_HOST !== "smtp.qq.com" ||
      env.SMTP_PORT !== "465" ||
      env.SMTP_SECURE !== "true" ||
      !env.SMTP_PASSWORD?.trim() ||
      !email.test(env.SMTP_USER || "") ||
      env.SMTP_FROM !== env.SMTP_USER ||
      (!allowAnyRecipient && !email.test(env.MAIL_TEST_RECIPIENT || ""))
    )
      return null;
    return {
      scope,
      host: env.SMTP_HOST,
      user: env.SMTP_USER!,
      pass: env.SMTP_PASSWORD.trim(),
      from: env.SMTP_FROM!,
      recipient: env.MAIL_TEST_RECIPIENT?.trim().toLowerCase() || "",
      allowAnyRecipient,
    };
  } catch {
    return null;
  }
}

export function assertSmtpRecipient(
  email: string,
  config: NonNullable<ReturnType<typeof smtpConfig>>,
) {
  if (!mailboxPattern.test(email)) throw new AuthError("INVALID_EMAIL", 400);
  if (!config.allowAnyRecipient && email !== config.recipient)
    throw new AuthError("MAIL_RECIPIENT_NOT_ALLOWED", 400);
}

export async function deliverSmtp(
  email: string,
  subject: string,
  text: string,
) {
  const config = smtpConfig();
  if (!config) throw new AuthError("MAIL_DISABLED", 503);
  assertSmtpRecipient(email, config);
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

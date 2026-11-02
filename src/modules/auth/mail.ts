import { randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { getDb } from "../../lib/db";
import { devMails } from "./schema";
import { smtpConfig } from "./smtp";
import { productionMailConfig } from "./production-mail";

export function isEmailLoginEnabled() {
  return (
    isDevMailEnabled() ||
    smtpConfig() !== null ||
    productionMailConfig() !== null
  );
}

export function isDevMailEnabled() {
  return (
    process.env.NODE_ENV === "development" &&
    (!process.env.MAIL_TRANSPORT || process.env.MAIL_TRANSPORT === "dev") &&
    process.env.ENABLE_DEV_MAIL === "true"
  );
}

export function createDevMail(
  email: string,
  language: "zh" | "en",
  code: string,
  createdAt: Date,
) {
  if (!isDevMailEnabled()) throw new Error("MAIL_DISABLED");
  return createCodeMail(email, language, code, createdAt);
}

export function createCodeMail(
  email: string,
  language: "zh" | "en",
  code: string,
  createdAt: Date,
) {
  return {
    id: randomUUID(),
    email,
    language,
    createdAt,
    subject: language === "zh" ? "黑客松登录验证码" : "Hackathon sign-in code",
    body:
      language === "zh"
        ? `你的验证码是 ${code}，10 分钟内有效。请勿向他人透露。`
        : `Your sign-in code is ${code}. It expires in 10 minutes. Do not share it.`,
  };
}

export async function listDevMails() {
  if (!isDevMailEnabled()) return [];
  return (await getDb())
    .select()
    .from(devMails)
    .orderBy(desc(devMails.createdAt))
    .limit(50);
}

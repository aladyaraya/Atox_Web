/** Sends one non-code test message. Does not open any database. */
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import path from "node:path";
try {
  const root = path.resolve(".data/mail-test");
  const settings = parseEnv(
    await readFile(path.join(root, ".env.local"), "utf8"),
  );
  Object.assign(process.env, settings, {
    NODE_ENV: "development",
    MAIL_TRANSPORT: "smtp",
    ENABLE_LOGTO_LOGIN: "false",
    ENABLE_DEV_MAIL: "false",
    APP_ORIGIN: "http://127.0.0.1:3105",
    DB_PATH: path.join(root, "db"),
  });
  const { smtpConfig, deliverSmtp } =
    await import("../src/modules/auth/smtp.ts");
  const config = smtpConfig();
  if (!config) throw new Error("Configuration unavailable");
  await deliverSmtp(
    config.recipient,
    "HACKATHON 本机邮件投递测试",
    [
      "这是一封本机邮件投递测试邮件，不包含登录验证码。",
      "如果你能看到本邮件，说明这次测试邮件已经到达你的邮箱。",
      "后续请在本机测试站点击发送验证码，完成注册与再次登录测试。",
      "测试站：http://127.0.0.1:3105/login",
    ].join("\n"),
  );
  console.log(
    "QQ SMTP accepted the test message. Actual inbox receipt still requires confirmation.",
  );
} catch {
  console.error(
    "Mail check failed. Check local credentials, service activation and network. Private provider details are not printed.",
  );
  process.exitCode = 1;
}

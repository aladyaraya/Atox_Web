"use client";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { navigateOidc } from "../client";
import { oidcMessage } from "../messages";
export function OidcLogin({
  returnTo,
  sandbox,
}: {
  returnTo: string;
  sandbox: boolean;
}) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <aside className="dev-note" style={{ marginBottom: 24 }}>
      <h2>{zh ? "统一登录／注册" : "Unified sign-in / Sign up"}</h2>
      <p>
        {sandbox
          ? zh
            ? "本地隔离验收：使用测试邮件及独立数据，不代表真实邮箱归属。"
            : "Local sandbox: test mail and separate data; not proof of mailbox ownership."
          : zh
            ? "通过 Logto 验证邮箱，安全进入当前网站。"
            : "Verify your email with Logto to access this site."}
      </p>
      <button
        className="button primary full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await navigateOidc("login", returnTo);
          } catch (e) {
            setError(e instanceof Error ? e.message : "");
            setBusy(false);
          }
        }}
      >
        {busy
          ? zh
            ? "正在连接…"
            : "Connecting…"
          : zh
            ? "使用 Logto 登录／注册"
            : "Sign in / Sign up with Logto"}{" "}
        ↗
      </button>
      {error && (
        <p role="alert" className="error">
          {oidcMessage(error, language)}
        </p>
      )}
    </aside>
  );
}

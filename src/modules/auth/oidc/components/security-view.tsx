"use client";
import Link from "next/link";
import { useState } from "react";
import { Header, Footer } from "@/components/site-shell";
import { useLanguage } from "@/components/language-provider";
import type { PendingIdentityDto, IdentitySecurityDto } from "../contracts";
import { loadPending, navigateOidc, oidcRequest } from "../client";
import { oidcMessage } from "../messages";
export function IdentitySecurityView({
  initialPending,
  security,
  signedIn,
  error: initialError = "",
}: {
  initialPending: PendingIdentityDto | null;
  security: IdentitySecurityDto | null;
  signedIn: boolean;
  error?: string;
}) {
  const { language } = useLanguage(),
    zh = language === "zh";
  const [pending, setPending] = useState(initialPending),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function act(action: "link" | "refresh" | "confirm" | "cancel") {
    setBusy(true);
    setError("");
    try {
      if (action === "link")
        await navigateOidc("link", pending?.returnTo ?? "/account");
      if (action === "refresh") setPending(await loadPending());
      if (action === "confirm") {
        const result = await oidcRequest<{ returnTo: string }>("confirm", {});
        window.location.assign(result.returnTo);
        return;
      }
      if (action === "cancel") {
        await oidcRequest("cancel", {});
        window.location.assign(signedIn ? "/account" : "/login");
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "");
    }
    setBusy(false);
  }
  return (
    <div className="site">
      <Header signedIn={signedIn} />
      <main className="account-main" style={{ maxWidth: 850 }}>
        <div className="eyebrow purple-text">ACCOUNT / IDENTITY</div>
        <h1>{zh ? "登录与账号安全" : "Sign-in & account security"}</h1>
        {(security?.sandbox || pending?.sandbox) && (
          <p className="dev-note">
            {zh
              ? "本地隔离测试环境。测试邮件及模拟的人工核验记录均不能用于正式账号恢复。"
              : "Local isolated sandbox. Test email and simulated recovery evidence cannot recover a real account."}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {oidcMessage(error, language)}
          </p>
        )}
        {security && (
          <section className="journey-card">
            <h2>
              {security.connected
                ? zh
                  ? "已关联统一身份"
                  : "Unified identity connected"
                : zh
                  ? "尚未关联统一身份"
                  : "No unified identity linked"}
            </h2>
            <p>
              {security.method === "oidc"
                ? zh
                  ? "当前通过 Logto 验证后建立本站会话。"
                  : "This local session was established after Logto verification."
                : zh
                  ? "当前为原有邮箱会话。开发邮箱登录不能证明旧账号所有权。"
                  : "This is a legacy email session. Development mail cannot prove ownership of an old account."}
            </p>
            {!security.connected && !pending && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void act("link")}
              >
                {zh ? "关联 Logto 身份" : "Link a Logto identity"} ↗
              </button>
            )}
            {security.centralLogoutCsrf && (
              <>
                <form method="post" action="/api/auth/oidc/logout">
                  <input
                    type="hidden"
                    name="csrf"
                    value={security.centralLogoutCsrf}
                  />
                  <button className="button secondary" type="submit">
                    {zh
                      ? "退出本站及中央登录状态"
                      : "Sign out of this site and central sign-in"}
                  </button>
                </form>
                <p className="muted">
                  {zh
                    ? "此操作不保证退出所有产品。其他产品已建立的会话可能继续有效；本站会话最多 15 分钟且不自动续期。"
                    : "This does not sign out all products. Other local sessions can remain active. This site's OIDC sessions last at most 15 minutes without renewal."}
                </p>
              </>
            )}
          </section>
        )}
        {pending && pending.status !== "cancelled" && (
          <section className="journey-card" style={{ marginTop: 24 }}>
            <h2>
              {pending.status === "needs_link"
                ? zh
                  ? "发现已有账号，尚未关联"
                  : "An existing account needs safe linking"
                : zh
                  ? "旧账号关联请求"
                  : "Account-linking request"}
            </h2>
            <p>
              {zh
                ? "不会按相同邮箱自动合并。需重新验证 Logto 身份，并由维护人员独立核验旧账号归属；开发验证码和当前开发会话均不作为证明。"
                : "Matching email never merges accounts automatically. Re-verify your Logto identity; a maintainer must independently verify ownership of the old account. Development codes and sessions are not proof."}
            </p>
            <p>
              {zh ? "请求编号" : "Request reference"}:{" "}
              <code style={{ overflowWrap: "anywhere" }}>
                {pending.requestId}
              </code>
            </p>
            <p>
              {zh ? "有效期至" : "Expires"}:{" "}
              {new Date(pending.expiresAt).toLocaleString(
                language === "zh" ? "zh-CN" : "en-US",
              )}
            </p>
            {pending.status === "needs_link" && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void act("link")}
              >
                {zh
                  ? "重新验证身份并申请关联"
                  : "Re-verify identity & request linking"}
              </button>
            )}
            {pending.status === "awaiting_approval" && (
              <>
                <p role="status">
                  {pending.approved
                    ? zh
                      ? "归属核验已通过。请确认关联至原账号。"
                      : "Ownership approved. Confirm linking to your original account."
                    : zh
                      ? "等待独立的旧账号归属核验。请将请求编号提供给本地项目维护人员。"
                      : "Awaiting independent ownership verification. Give the request reference to your local project maintainer."}
                </p>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void act("refresh")}
                >
                  {zh ? "刷新核验状态" : "Refresh approval status"}
                </button>{" "}
                <button
                  className="button primary"
                  disabled={busy || !pending.approved}
                  onClick={() => void act("confirm")}
                >
                  {zh ? "确认关联并登录" : "Confirm link & sign in"}
                </button>
              </>
            )}
            {pending.status === "completed" && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void act("confirm")}
              >
                {zh
                  ? "恢复已确认的登录结果"
                  : "Recover confirmed sign-in result"}
              </button>
            )}
            <p>
              <button
                className="resend"
                disabled={busy}
                onClick={() => void act("cancel")}
              >
                {zh ? "取消此请求" : "Cancel this request"}
              </button>
            </p>
          </section>
        )}
        {busy && <p role="status">{zh ? "处理中…" : "Working…"}</p>}
        <p style={{ marginTop: 32 }}>
          <Link
            className="button secondary"
            href={signedIn ? "/account" : "/login"}
          >
            {signedIn
              ? zh
                ? "返回我的账户"
                : "Back to account"
              : zh
                ? "返回登录"
                : "Back to sign-in"}
          </Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}

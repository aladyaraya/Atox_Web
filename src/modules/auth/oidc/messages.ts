export function oidcMessage(code: string, language: "zh" | "en") {
  const messages: Record<string, [string, string]> = {
    PROVIDER_UNAVAILABLE: [
      "统一登录服务暂不可用，请稍后重试。",
      "The identity service is unavailable. Please try again later.",
    ],
    CALLBACK_REJECTED: [
      "登录验证未通过，请重新开始登录。",
      "Sign-in verification failed. Start a new sign-in.",
    ],
    INVALID_FLOW: [
      "此登录请求已失效或已被取消，请重新开始。",
      "This sign-in request is invalid or cancelled. Start again.",
    ],
    EXPIRED: [
      "请求已过期，请重新验证。",
      "This request expired. Verify again.",
    ],
    IDENTITY_CONFLICT: [
      "身份已关联或存在冲突，不能覆盖已有关联。请联系维护人员核实。",
      "An identity link already exists or conflicts. Ask the maintainer to investigate.",
    ],
    APPROVAL_REQUIRED: [
      "旧账号归属尚未核验通过。开发验证码不能作为所有权证明。",
      "Account ownership has not been approved. Development codes are not ownership proof.",
    ],
    SESSION_CHANGED: [
      "当前账号状态已改变。请关闭此请求，重新登录后再试。",
      "Your account session changed. Cancel this request and sign in again.",
    ],
    RATE_LIMITED: [
      "请求过于频繁，请稍后再试。",
      "Too many requests. Please try again later.",
    ],
    EMAIL_REQUIRED: [
      "统一登录未返回经过验证的邮箱，无法继续。",
      "A verified email is required from the identity provider.",
    ],
    CENTRAL_UNAVAILABLE: [
      "已退出本网站；中央退出未确认，其他产品可能仍保持登录。",
      "You are signed out of this site. Central sign-out is unconfirmed; other products may remain signed in.",
    ],
    DISABLED: [
      "当前环境未启用统一登录。",
      "Unified sign-in is disabled in this environment.",
    ],
  };
  return (messages[code] ?? [
    "请求未能确认，请保留当前页面后重试；不要重复开始关联。",
    "The result could not be confirmed. Keep this page and retry; do not start another link.",
  ])[language === "zh" ? 0 : 1];
}

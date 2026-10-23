export function errorText(error: unknown, zh: boolean) {
  const code =
    error instanceof Error && "code" in error ? String(error.code) : "NETWORK";
  const messages: Record<string, [string, string]> = {
    UNAUTHENTICATED: [
      "登录已失效，请重新登录。",
      "Your session expired. Please sign in again.",
    ],
    FORBIDDEN: [
      "你没有执行此操作的权限。",
      "You do not have permission for this action.",
    ],
    NOT_FOUND: [
      "项目或评论已不可用。",
      "The project or comment is unavailable.",
    ],
    INVALID_INPUT: [
      "请检查输入内容与长度。",
      "Check the input and its length.",
    ],
    NICKNAME_REQUIRED: ["请先设置公开昵称。", "Set a public nickname first."],
    RATE_LIMITED: [
      "评论发送过于频繁，请稍后再试。",
      "Too many comments. Please wait before trying again.",
    ],
    IDEMPOTENCY_CONFLICT: [
      "原请求内容不一致，请核对后重试。",
      "The original request differs. Check before retrying.",
    ],
    REVISION_CONFLICT: [
      "内容已变化。输入已保留，请读取最新状态后再操作。",
      "Content changed. Input preserved; reload before proceeding.",
    ],
  };
  return (messages[code] ?? [
    "未能确认操作结果，请核对或重试原请求。",
    "Could not confirm the result. Check or retry the original request.",
  ])[zh ? 0 : 1];
}

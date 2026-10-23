"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { InteractionStats } from "../contracts";
import { interactionRequest, InteractionClientError } from "../client";
import { errorText } from "../copy";
export function LikeButton({
  projectId,
  stats,
  signedIn,
  next,
  onChange,
}: {
  projectId: string;
  stats: InteractionStats;
  signedIn: boolean;
  next: string;
  onChange: (value: InteractionStats) => void;
}) {
  const { language } = useLanguage(),
    zh = language === "zh";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [retry, setRetry] = useState<boolean | null>(null),
    [expired, setExpired] = useState(false);
  const guard = useRef(false);
  const login = "/login?next=" + encodeURIComponent(next);
  async function set() {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    const liked = retry ?? !stats.likedByMe;
    try {
      onChange(
        await interactionRequest<InteractionStats>(
          "/api/projects/" + projectId + "/like",
          "PUT",
          { liked },
        ),
      );
      setRetry(null);
    } catch (e) {
      setError(errorText(e, zh));
      if (e instanceof InteractionClientError && e.status === 401)
        setExpired(true);
      else if (
        !(e instanceof InteractionClientError) ||
        e.status === 0 ||
        e.status >= 500
      )
        setRetry(liked);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <span className="pi-like">
      {!signedIn || expired ? (
        <Link href={login} aria-label={zh ? "登录后点赞" : "Sign in to like"}>
          ♡ {stats.likeCount}
        </Link>
      ) : (
        <button
          type="button"
          aria-pressed={stats.likedByMe}
          aria-label={
            retry !== null
              ? zh
                ? "核对点赞状态"
                : "Confirm like status"
              : stats.likedByMe
                ? zh
                  ? "取消点赞"
                  : "Unlike"
                : zh
                  ? "点赞项目"
                  : "Like project"
          }
          disabled={busy}
          onClick={() => void set()}
        >
          {stats.likedByMe ? "♥" : "♡"} {stats.likeCount}
          {busy ? " …" : retry !== null ? (zh ? " · 核对" : " · Confirm") : ""}
        </button>
      )}
      {error && <small role="alert">{error}</small>}
    </span>
  );
}

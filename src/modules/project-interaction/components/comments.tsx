"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { NicknameEditor } from "@/modules/auth/components/nickname-editor";
import type { AccountProfileDto } from "@/modules/auth/profile-contracts";
import type { CommentPage, CommentInput, CommentReceipt } from "../contracts";
import { interactionRequest, InteractionClientError } from "../client";
import { errorText } from "../copy";
export function Comments({
  projectId,
  viewerId,
  initial,
  initialProfile,
  next,
  onCount,
}: {
  projectId: string;
  viewerId: string | null;
  initial: CommentPage;
  initialProfile: AccountProfileDto | null;
  next: string;
  onCount: (total: number) => void;
}) {
  const { language } = useLanguage(),
    zh = language === "zh";
  const [data, setData] = useState(initial),
    [profile, setProfile] = useState(initialProfile);
  const [body, setBody] = useState(""),
    [attempt, setAttempt] = useState<CommentInput | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [expired, setExpired] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const guard = useRef(false),
    sequence = useRef(0),
    alive = useRef(true);
  const storageKey = "project-comment:" + viewerId + ":" + projectId;
  const api = "/api/projects/" + projectId + "/comments";
  const login = "/login?next=" + encodeURIComponent(next);
  const countCallback = useRef(onCount);
  useEffect(() => {
    countCallback.current = onCount;
  }, [onCount]);
  const load = useCallback(
    async (page: number) => {
      const serial = ++sequence.current;
      setLoading(true);
      try {
        const result = await interactionRequest<CommentPage>(
          api + "?page=" + page,
        );
        if (alive.current && serial === sequence.current) {
          setData(result);
          countCallback.current(result.total);
        }
      } catch (e) {
        if (alive.current && serial === sequence.current)
          setError(errorText(e, zh));
      } finally {
        if (alive.current && serial === sequence.current) setLoading(false);
      }
    },
    [api, zh],
  );
  useEffect(() => {
    alive.current = true;
    const timer = setTimeout(() => {
      if (!viewerId) return;
      try {
        const raw = sessionStorage.getItem(storageKey + ":pending");
        if (raw) {
          const saved = JSON.parse(raw);
          if (
            typeof saved.body === "string" &&
            Array.from(saved.body).length <= 1000 &&
            typeof saved.requestId === "string"
          ) {
            setAttempt(saved);
            setBody(saved.body);
          }
        } else setBody(sessionStorage.getItem(storageKey + ":draft") ?? "");
      } catch {
        /* Storage unavailable: no request is sent until it can be retained. */
      }
    }, 0);
    function invalidate() {
      alive.current = false;
      sequence.current++;
    }
    return () => {
      clearTimeout(timer);
      invalidate();
    };
  }, [storageKey, viewerId]);
  useEffect(() => {
    const refresh = () => {
      void load(data.page);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [data.page, load]);
  function draft(value: string) {
    setBody(value);
    try {
      sessionStorage.setItem(storageKey + ":draft", value);
    } catch {
      /* Only pending sends require reliable storage. */
    }
  }
  async function submit() {
    if (guard.current) return;
    const input = attempt ?? {
      body: body.trim(),
      requestId: crypto.randomUUID(),
    };
    try {
      sessionStorage.setItem(storageKey + ":pending", JSON.stringify(input));
    } catch {
      setError(
        zh
          ? "无法暂存请求，本次未发送。请允许会话存储后重试。"
          : "Could not retain the request; nothing was sent. Enable session storage and retry.",
      );
      return;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setAttempt(input);
    try {
      const receipt = await interactionRequest<CommentReceipt>(
        api,
        "POST",
        input,
      );
      sessionStorage.removeItem(storageKey + ":pending");
      sessionStorage.removeItem(storageKey + ":draft");
      setAttempt(null);
      setBody("");
      setNotice(
        receipt.status === "visible"
          ? zh
            ? "评论已发送"
            : "Comment posted"
          : zh
            ? "原请求已确认，评论当前不可见。"
            : "Original request confirmed; the comment is not currently visible.",
      );
      await load(1);
    } catch (e) {
      setError(errorText(e, zh));
      if (
        e instanceof InteractionClientError &&
        e.status >= 400 &&
        e.status < 500
      ) {
        // A rejected retry cannot disprove an earlier unknown result.
        // Retain its key across login expiry or temporary unavailability.
        if (!attempt) {
          setAttempt(null);
          try {
            sessionStorage.removeItem(storageKey + ":pending");
            sessionStorage.setItem(storageKey + ":draft", input.body);
          } catch {}
        }
        if (e.status === 401) setExpired(true);
      }
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (
      guard.current ||
      !window.confirm(
        zh
          ? "删除这条评论？删除后无法恢复。"
          : "Delete this comment? This cannot be undone.",
      )
    )
      return;
    guard.current = true;
    setDeleting(id);
    setError("");
    try {
      await interactionRequest(api + "/" + id, "DELETE");
      await load(
        data.items.length === 1 ? Math.max(1, data.page - 1) : data.page,
      );
    } catch (e) {
      setError(errorText(e, zh));
      if (e instanceof InteractionClientError && e.status === 401)
        setExpired(true);
    } finally {
      guard.current = false;
      setDeleting(null);
    }
  }
  return (
    <section
      id="comments"
      className="pi-comments"
      aria-label={zh ? "项目评论" : "Project comments"}
    >
      <div className="pi-section-heading">
        <h2>
          {zh ? "交流与评论" : "Conversation"} <span>{data.total}</span>
        </h2>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setError("");
            void load(data.page);
          }}
        >
          {zh ? "刷新评论" : "Refresh comments"}
        </button>
      </div>
      {!viewerId || expired ? (
        <p>
          <Link className="button secondary" href={login}>
            {zh ? "登录后发表评论" : "Sign in to comment"} ↗
          </Link>
        </p>
      ) : !profile?.nickname ? (
        <NicknameEditor
          initial={profile ?? { nickname: null, revision: 0 }}
          onSaved={(p) => {
            setProfile(p);
            void load(data.page);
          }}
        />
      ) : (
        <form
          className="pi-comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label>
            {zh ? "写下你的评论" : "Write a comment"}
            <textarea
              aria-label={zh ? "写下你的评论" : "Write a comment"}
              value={body}
              onChange={(e) => draft(e.target.value)}
              disabled={busy || attempt !== null}
              rows={4}
              required
              maxLength={2000}
            />
          </label>
          <div>
            <small>
              {Array.from(body.trim()).length}/1000 ·{" "}
              {zh
                ? "纯文字，最多每分钟 3 条"
                : "Plain text; up to 3 per minute"}
            </small>
            <button
              className="button primary"
              disabled={
                busy || !body.trim() || Array.from(body.trim()).length > 1000
              }
            >
              {busy
                ? zh
                  ? "提交中…"
                  : "Sending…"
                : attempt
                  ? zh
                    ? "核对原发送结果"
                    : "Confirm original request"
                  : zh
                    ? "发表评论"
                    : "Post comment"}
            </button>
          </div>
          {attempt && !busy && (
            <p role="status">
              {zh
                ? "存在待确认请求。当前输入已保留，核对后才能继续编辑。"
                : "A request needs confirmation. Your text is preserved; confirm it before editing."}
            </p>
          )}
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div aria-busy={loading}>
        {!data.items.length ? (
          <p className="pi-muted">
            {zh
              ? "还没有公开评论，欢迎分享你的想法。"
              : "No public comments yet. Share your thoughts."}
          </p>
        ) : (
          data.items.map((comment) => (
            <article className="pi-comment" key={comment.id}>
              <div>
                <strong>{comment.nickname}</strong>
                <time dateTime={comment.createdAt}>
                  {new Date(comment.createdAt).toLocaleString(
                    zh ? "zh-CN" : "en-GB",
                    { timeZone: "Asia/Shanghai" },
                  )}{" "}
                  (UTC+8)
                </time>
              </div>
              <p>{comment.body}</p>
              {comment.isMine && (
                <button
                  type="button"
                  disabled={Boolean(deleting) || busy}
                  onClick={() => void remove(comment.id)}
                >
                  {deleting === comment.id
                    ? "…"
                    : zh
                      ? "删除评论"
                      : "Delete comment"}
                </button>
              )}
            </article>
          ))
        )}
      </div>
      {data.totalPages > 1 && (
        <nav
          className="pb-pagination"
          aria-label={zh ? "评论分页" : "Comment pagination"}
        >
          <button
            disabled={loading || data.page <= 1}
            onClick={() => void load(data.page - 1)}
          >
            {zh ? "上一页" : "Previous"}
          </button>
          <span>
            {data.page}/{data.totalPages}
          </span>
          <button
            disabled={loading || data.page >= data.totalPages}
            onClick={() => void load(data.page + 1)}
          >
            {zh ? "下一页" : "Next"}
          </button>
        </nav>
      )}
    </section>
  );
}

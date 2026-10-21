"use client";
import { useEffect, useRef, useState } from "react";
import {
  AdminShell,
  AdminDialog,
  Pagination,
  dateText,
} from "@/modules/admin/components/shared";
import { useLanguage } from "@/components/language-provider";
import type { AdminIdentity } from "@/modules/admin/contracts";
import type { ManagedComment, ManagedCommentPage } from "../contracts";
import { interactionRequest } from "../client";
import { errorText } from "../copy";
export interface CommentFilters {
  projectId: string;
  status: string;
  page: number;
}
export function CommentModeration({
  identity,
  initial,
  initialFilters,
  projects,
}: {
  identity: AdminIdentity;
  initial: ManagedCommentPage;
  initialFilters: CommentFilters;
  projects: { id: string; name: { zh: string; en: string } }[];
}) {
  const { language } = useLanguage(),
    zh = language === "zh";
  const [data, setData] = useState(initial),
    [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ManagedComment | null>(null),
    [reason, setReason] = useState("");
  const [locked, setLocked] = useState(false),
    [error, setError] = useState(""),
    [dialogError, setDialogError] = useState("");
  const guard = useRef(false),
    sequence = useRef(0);
  const api = "/api/admin/project-comments";
  const statusText = (status: string) =>
    ({
      visible: zh ? "公开" : "Visible",
      hidden: zh ? "已隐藏" : "Hidden",
      deleted: zh ? "本人已删除" : "Deleted by author",
    })[status] ?? status;
  async function load(next: CommentFilters, history = true) {
    const serial = ++sequence.current;
    setLoading(true);
    setError("");
    setFilters(next);
    const q = new URLSearchParams();
    if (next.projectId) q.set("projectId", next.projectId);
    if (next.status) q.set("status", next.status);
    if (next.page > 1) q.set("page", String(next.page));
    if (history)
      window.history.pushState(
        null,
        "",
        "/admin/project-comments" + (q.size ? "?" + q : ""),
      );
    try {
      const result = await interactionRequest<ManagedCommentPage>(
        api + "?" + q,
      );
      if (serial === sequence.current) setData(result);
    } catch (e) {
      if (serial === sequence.current) setError(errorText(e, zh));
    } finally {
      if (serial === sequence.current) setLoading(false);
    }
  }
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    const restore = () => {
      const q = new URLSearchParams(window.location.search),
        page = Number(q.get("page") ?? "1");
      void loadRef.current(
        {
          projectId: q.get("projectId") ?? "",
          status: q.get("status") ?? "",
          page:
            Number.isSafeInteger(page) && page > 0 && page <= 1000000
              ? page
              : 1,
        },
        false,
      );
    };
    window.addEventListener("popstate", restore);
    function invalidate() {
      sequence.current++;
    }
    return () => {
      invalidate();
      window.removeEventListener("popstate", restore);
    };
  }, []);
  async function moderate() {
    if (!selected || locked || guard.current) return;
    guard.current = true;
    setBusy(true);
    setDialogError("");
    try {
      await interactionRequest(
        api + "/" + selected.id + "/moderation",
        "POST",
        {
          revision: selected.revision,
          action: selected.status === "visible" ? "hide" : "restore",
          reason,
        },
      );
      setSelected(null);
      await load(filters, false);
    } catch (e) {
      setDialogError(errorText(e, zh));
      setLocked(true);
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function reconcile() {
    if (
      !selected ||
      !window.confirm(
        zh
          ? "读取最新状态并替换当前处理输入？"
          : "Reload the current state and replace your inputs?",
      )
    )
      return;
    setBusy(true);
    try {
      const current = await interactionRequest<ManagedCommentPage>(
        api + "?commentId=" + selected.id,
      );
      if (!current.items[0]) {
        setDialogError(zh ? "评论已不存在" : "Comment not found");
        return;
      }
      setSelected(current.items[0]);
      setReason(current.items[0].reason ?? "");
      setLocked(false);
      setDialogError("");
      await load(filters, false);
    } catch (e) {
      setDialogError(errorText(e, zh));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminShell identity={identity}>
      <div className="adm-heading">
        <div>
          <p className="adm-eyebrow">PROJECT / CONVERSATION</p>
          <h1>{zh ? "项目评论管理" : "Project comment management"}</h1>
        </div>
        <button
          disabled={loading || busy}
          onClick={() => void load(filters, false)}
        >
          {zh ? "刷新列表" : "Refresh list"}
        </button>
      </div>
      <section className="adm-panel pi-admin-filters">
        <label>
          {zh ? "项目" : "Project"}
          <select
            aria-label={zh ? "筛选项目" : "Filter project"}
            value={filters.projectId}
            onChange={(e) =>
              void load({ ...filters, projectId: e.target.value, page: 1 })
            }
          >
            <option value="">{zh ? "全部项目" : "All projects"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name[language]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {zh ? "状态" : "Status"}
          <select
            aria-label={zh ? "评论状态" : "Comment status"}
            value={filters.status}
            onChange={(e) =>
              void load({ ...filters, status: e.target.value, page: 1 })
            }
          >
            <option value="">{zh ? "全部状态" : "All states"}</option>
            {["visible", "hidden", "deleted"].map((s) => (
              <option key={s} value={s}>
                {statusText(s)}
              </option>
            ))}
          </select>
        </label>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="adm-panel" aria-busy={loading}>
        {!data.items.length && (
          <p>{zh ? "当前没有评论" : "No comments on this page"}</p>
        )}
        {data.items.map((item) => (
          <article className="pi-managed-comment" key={item.id}>
            <div className="pi-section-heading">
              <strong>
                {item.projectName[language]} · {item.nickname}
              </strong>
              <span>{statusText(item.status)}</span>
            </div>
            <time>{dateText(item.createdAt, language)}</time>
            <p>
              {item.body ??
                (zh
                  ? "内容已由本人删除，不可恢复。"
                  : "The author deleted this content; it cannot be restored.")}
            </p>
            {item.reason && (
              <p>
                {zh ? "隐藏原因：" : "Reason: "}
                {item.reason}
              </p>
            )}
            {item.status !== "deleted" && (
              <button
                disabled={loading || busy}
                onClick={() => {
                  setSelected(item);
                  setReason("");
                  setLocked(false);
                  setDialogError("");
                }}
              >
                {item.status === "visible"
                  ? zh
                    ? "隐藏评论"
                    : "Hide comment"
                  : zh
                    ? "恢复评论"
                    : "Restore comment"}
              </button>
            )}
          </article>
        ))}
        <Pagination
          data={data}
          busy={loading || busy}
          change={(page) => void load({ ...filters, page })}
        />
      </section>
      {selected && (
        <AdminDialog
          title={zh ? "处理项目评论" : "Moderate comment"}
          busy={busy}
          close={() => setSelected(null)}
        >
          <p>
            {selected.nickname} · {statusText(selected.status)}
          </p>
          <p className="pi-preserve">{selected.body}</p>
          {selected.status === "visible" && (
            <label>
              {zh ? "隐藏原因（必填）" : "Reason for hiding (required)"}
              <textarea
                aria-label={zh ? "隐藏原因" : "Reason for hiding"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                disabled={busy || locked}
              />
            </label>
          )}
          {dialogError && (
            <p className="error" role="alert">
              {dialogError}
            </p>
          )}
          {locked ? (
            <button disabled={busy} onClick={() => void reconcile()}>
              {zh ? "核对最新状态" : "Check latest state"}
            </button>
          ) : (
            selected.status !== "deleted" && (
              <button
                disabled={
                  busy || (selected.status === "visible" && !reason.trim())
                }
                onClick={() => void moderate()}
              >
                {selected.status === "visible"
                  ? zh
                    ? "确认隐藏"
                    : "Confirm hide"
                  : zh
                    ? "确认恢复"
                    : "Confirm restore"}
              </button>
            )
          )}
        </AdminDialog>
      )}
    </AdminShell>
  );
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdminDialog,
  AdminShell,
  Pagination,
} from "@/modules/admin/components/shared";
import type { AdminIdentity } from "@/modules/admin/contracts";
import { categories } from "@/modules/project-board/categories";
import { projectRequest, SubmissionApiError } from "../client";
import type {
  ManagedProject,
  Page,
  ProjectSummary,
  ProjectOptions,
} from "../contracts";
import {
  Assets,
  ProjectStatus,
  PublicPreview,
  projectError,
  useProjectText,
} from "./shared";
const validListReturn = (value: string) => {
  try {
    const u = new URL(value, "http://local");
    if (
      u.origin !== "http://local" ||
      u.pathname !== "/admin/projects" ||
      u.hash
    )
      return "/admin/projects";
    return u.pathname + u.search;
  } catch {
    return "/admin/projects";
  }
};
export function ProjectManagement({
  identity,
  initialQuery = "",
}: {
  identity: AdminIdentity;
  initialQuery?: string;
}) {
  const { say, zh, language } = useProjectText();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  };
  const [query, setQuery] = useState(initialQuery),
    [input, setInput] = useState(
      new URLSearchParams(initialQuery).get("q") ?? "",
    ),
    [data, setData] = useState<
      | (Page<ProjectSummary> & {
          options: {
            events: Pick<ProjectOptions["events"][number], "id" | "name">[];
          };
        })
      | null
    >(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState<unknown>(null),
    [refresh, setRefresh] = useState(0);
  const apply = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(location.search);
    if (value) p.set(key, value);
    else p.delete(key);
    if (key !== "page") p.delete("page");
    const next = p.size ? "?" + p : "";
    history.pushState(null, "", "/admin/projects" + next);
    setQuery(next);
    setBusy(true);
  }, []);
  useEffect(() => {
    const restore = () => {
      setQuery(location.search);
      setInput(new URLSearchParams(location.search).get("q") ?? "");
      setBusy(true);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if (input.trim() === (new URLSearchParams(query).get("q") ?? "")) return;
    const t = setTimeout(() => apply("q", input.trim()), 300);
    searchTimer.current = t;
    return () => clearTimeout(t);
  }, [input, query, apply]);
  useEffect(() => {
    const c = new AbortController();
    projectRequest<
      Page<ProjectSummary> & {
        options: {
          events: Pick<ProjectOptions["events"][number], "id" | "name">[];
        };
      }
    >("/api/admin/projects" + query, "GET", undefined, c.signal)
      .then((v) => {
        setData(v);
        setError(null);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [query, refresh]);
  const p = new URLSearchParams(query),
    select = (key: string, label: string, options: [string, string][]) => (
      <label key={key}>
        {label}
        <select
          aria-label={label}
          value={p.get(key) ?? ""}
          onChange={(e) => apply(key, e.target.value)}
        >
          <option value="">{say("全部", "All")}</option>
          {options.map(([id, name]) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
    );
  return (
    <AdminShell identity={identity}>
      <div className="adm-heading">
        <h1>{say("项目管理总表", "Project management table")}</h1>
        <a
          href="#project-management-records"
          className="ps-table-jump"
          onClick={(e) => {
            e.preventDefault();
            const region = document.getElementById(
              "project-management-records",
            );
            region?.focus({ preventScroll: true });
            region?.scrollIntoView({ block: "start", behavior: "instant" });
          }}
        >
          {say("查看项目记录 ↓", "View project records ↓")}
        </a>
        <button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setRefresh((v) => v + 1);
          }}
        >
          {say("刷新列表", "Refresh list")}
        </button>
      </div>
      <p className="adm-muted">
        {say(
          "仅展示已正式投稿和演示项目。审核通过与公开发布分开；不读取用户未提交草稿。",
          "Official submissions and demo projects only. Approval and publication are separate; private drafts are excluded.",
        )}
      </p>
      <div className="ps-filter">
        <label>
          {say("搜索项目或创作者", "Search projects or creators")}
          <input
            maxLength={200}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </label>
        {select("source", say("来源", "Source"), [
          ["user", say("用户投稿", "User submission")],
          ["demo", say("演示项目", "Demo")],
        ])}
        {select(
          "category",
          say("分类", "Category"),
          categories.map((c) => [c.id, c.name[language]]),
        )}
        {select("reviewState", say("审核状态", "Review status"), [
          ["pending", say("待审核", "Pending")],
          ["approved", say("通过", "Approved")],
          ["rejected", say("驳回", "Rejected")],
        ])}
        {select("publicationState", say("发布状态", "Publication status"), [
          ["unpublished", say("未发布", "Unpublished")],
          ["published", say("已发布", "Published")],
          ["withdrawn", say("已下架", "Withdrawn")],
        ])}
        {select("eventId", say("活动", "Event"), [
          ["independent", say("独立项目", "Independent")],
          ...(data?.options.events ?? []).map(
            (e) => [e.id, e.name[language]] as [string, string],
          ),
        ])}
        <button
          onClick={() => {
            history.pushState(null, "", "/admin/projects");
            setQuery("");
            setInput("");
            setBusy(true);
          }}
        >
          {say("清空筛选", "Clear filters")}
        </button>
      </div>
      {busy && <p role="status">{say("正在读取…", "Loading…")}</p>}
      {error != null && (
        <p role="alert" className="adm-error">
          {projectError(error, zh)}
        </p>
      )}
      <section
        id="project-management-records"
        tabIndex={-1}
        aria-label={say("项目记录", "Project records")}
      >
        <h2>
          {say("项目记录", "Projects")} · {data?.total ?? "—"}
        </h2>
        {data?.items.length === 0 && (
          <p className="adm-panel">
            {say(
              "暂无符合条件的项目。未送审草稿不计入。",
              "No matching projects. Unsubmitted drafts are excluded.",
            )}
          </p>
        )}
        <div className="ps-table-wrap">
          <table className="ps-table">
            <caption>
              {say(
                "项目管理总表 · 每页 20 条",
                "Project management table · 20 per page",
              )}
            </caption>
            <thead>
              <tr>
                {[
                  say("项目／创作者", "Project / Creator"),
                  say("来源／活动", "Source / Event"),
                  say("状态", "Status"),
                  say("版本／更新", "Version / Updated"),
                  say("操作", "Actions"),
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r) => (
                <tr key={r.id} data-project-id={r.id}>
                  <td>
                    <Link
                      onClick={cancelSearch}
                      href={`/admin/projects/${r.id}?returnTo=${encodeURIComponent("/admin/projects" + query)}`}
                    >
                      {r.name[language]}
                    </Link>
                    <p className="adm-muted">{r.creator}</p>
                  </td>
                  <td>
                    {r.source === "demo"
                      ? say("演示项目", "Demo")
                      : say("用户投稿", "User submission")}
                    <p className="adm-muted">
                      {r.eventId ?? say("独立项目", "Independent")}
                    </p>
                  </td>
                  <td>
                    <ProjectStatus project={r} />
                  </td>
                  <td>
                    v{r.submittedRevision} / {say("公开", "Public")}{" "}
                    {r.liveRevision ?? "—"}
                    <p className="adm-muted">
                      {new Date(r.updatedAt).toLocaleString(
                        language === "zh" ? "zh-CN" : "en-GB",
                        { timeZone: "Asia/Shanghai" },
                      )}
                    </p>
                  </td>
                  <td>
                    <Link
                      onClick={cancelSearch}
                      href={`/admin/projects/${r.id}?returnTo=${encodeURIComponent("/admin/projects" + query)}`}
                    >
                      {say("查看与管理", "View and manage")} ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && (
          <Pagination
            data={data}
            busy={busy}
            change={(n) => apply("page", String(n))}
          />
        )}
      </section>
    </AdminShell>
  );
}
export function ManagedProjectView({
  identity,
  initial,
  returnTo = "/admin/projects",
}: {
  identity: AdminIdentity;
  initial: ManagedProject;
  returnTo?: string;
}) {
  const { say, zh, language } = useProjectText();
  const [project, setProject] = useState(initial),
    [action, setAction] = useState<"approved" | "rejected">("approved"),
    [reason, setReason] = useState(""),
    [note, setNote] = useState(initial.internalNote ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [locked, setLocked] = useState(false),
    [notice, setNotice] = useState("");
  const [modal, setModal] = useState<
      "decision" | "publish" | "withdraw" | "reload" | "leave" | null
    >(null),
    [withdrawReason, setWithdrawReason] = useState("");
  const inFlight = useRef(false),
    leaveTarget = useRef("");
  const leaveConfirmed = useRef(false);
  const dirty =
    reason !== "" ||
    note !== (project.internalNote ?? "") ||
    withdrawReason !== "";
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => {
      if (leaveConfirmed.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.("a");
      if (
        a &&
        a.target !== "_blank" &&
        a.origin === location.origin &&
        !a.hash &&
        !e.ctrlKey &&
        !e.metaKey &&
        e.button === 0
      ) {
        e.preventDefault();
        e.stopPropagation();
        leaveTarget.current = a.href;
        setModal("leave");
      }
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  async function run() {
    if (inFlight.current || !modal) return;
    if (modal === "leave") {
      leaveConfirmed.current = true;
      location.assign(leaveTarget.current);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const base = `/api/admin/projects/${project.id}`,
        payload = {
          revision: project.revision,
          submittedRevision: project.submittedRevision,
        };
      const result =
        modal === "reload"
          ? await projectRequest<{ project: ManagedProject }>(base)
          : modal === "decision"
            ? await projectRequest<{ project: ManagedProject }>(
                base + "/decision",
                "POST",
                { ...payload, action, reason, internalNote: note },
              )
            : await projectRequest<{ project: ManagedProject }>(
                base + "/publication",
                "POST",
                {
                  ...payload,
                  action: modal,
                  reason: modal === "withdraw" ? withdrawReason : undefined,
                },
              );
      setProject(result.project);
      setReason("");
      setNote(result.project.internalNote ?? "");
      setWithdrawReason("");
      setLocked(false);
      setNotice(say("操作已保存。", "Operation saved."));
    } catch (e) {
      setError(e);
      if (
        !(e instanceof SubmissionApiError) ||
        e.status === 409 ||
        e.status >= 500
      )
        setLocked(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
      setModal(null);
    }
  }
  return (
    <AdminShell identity={identity}>
      <Link className="ps-back" href={validListReturn(returnTo)}>
        ← {say("返回项目总表", "Back to project table")}
      </Link>
      <div className="adm-heading">
        <h1>{project.name[language]}</h1>
        <button disabled={busy} onClick={() => setModal("reload")}>
          {say("读取最新状态", "Read latest state")}
        </button>
      </div>
      <ProjectStatus project={project} />
      {project.consentRevoked && (
        <p className="ps-feedback">
          {say(
            "作者已撤销公开授权，不能凭旧批准重新发布。",
            "The author withdrew publication consent. Previous approval cannot restore publication.",
          )}
        </p>
      )}
      <p className="adm-muted">
        {project.id} · v{project.submittedRevision} ·{" "}
        {say("公开版本", "Public version")} {project.liveRevision ?? "—"}
      </p>
      {notice && (
        <p className="adm-success" role="status">
          {notice}
        </p>
      )}
      {error != null && (
        <p className="adm-error" role="alert">
          {projectError(error, zh)}
        </p>
      )}
      {locked && (
        <p className="adm-error">
          {say(
            "输入已保留，操作已锁定；请核对最新状态后重新确认。",
            "Input is preserved and actions are locked. Read the latest state and confirm again.",
          )}
        </p>
      )}
      <div className="adm-actions ps-bottom">
        <Link
          className="adm-button"
          href={`/admin/projects/${project.id}/preview`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {say("预览送审版本", "Preview submitted version")} ↗
        </Link>
        <button
          disabled={
            busy ||
            locked ||
            project.consentRevoked ||
            (project.source === "user" && project.reviewState !== "approved") ||
            (project.publicationState === "published" &&
              project.liveRevision === project.submittedRevision)
          }
          onClick={() => setModal("publish")}
        >
          {say("发布当前批准版本", "Publish approved version")}
        </button>
        <button
          disabled={busy || locked || project.publicationState !== "published"}
          onClick={() => setModal("withdraw")}
        >
          {say("下架项目", "Withdraw project")}
        </button>
      </div>
      {project.source === "demo" ? (
        <p className="adm-panel">
          {say(
            "这是现有演示项目，仅维护上下架，不伪造投稿人或审核记录。",
            "This existing demo supports publication controls only, without invented authors or review records.",
          )}
        </p>
      ) : (
        <>
          <section className="adm-panel">
            <h2>{say("正式送审材料", "Official submission")}</h2>
            <p>
              {say("提交时间", "Submitted at")}: {project.submittedAt}
            </p>
            {project.submitted && (
              <>
                <h3>{project.submitted.name}</h3>
                <p>{project.submitted.tagline}</p>
                <p className="ps-prewrap">{project.submitted.description}</p>
                <p>
                  {say("创作者", "Creator")}: {project.submitted.creator}
                </p>
                <p>
                  {say("分类／活动", "Category / Event")}:{" "}
                  {project.submitted.category} /{" "}
                  {project.submitted.eventId ?? say("独立项目", "Independent")}
                </p>
                <details>
                  <summary>
                    {say(
                      "全部正式字段与声明",
                      "All submitted fields and declarations",
                    )}
                  </summary>
                  <pre>{JSON.stringify(project.submitted, null, 2)}</pre>
                </details>
              </>
            )}
            <Assets assets={project.assets} />
          </section>
          <section className="adm-panel">
            <h2>{say("审核决定", "Review decision")}</h2>
            <p className="adm-muted">
              {say(
                "审核不限时，通过不自动发布；修改问题请退回作者处理。",
                "Review has no deadline. Approval does not publish. Return corrections to the author.",
              )}
            </p>
            {project.publicNote && (
              <p className="ps-feedback">
                {say("当前对外说明：", "Current public feedback: ")}
                {project.publicNote}
              </p>
            )}
            <fieldset
              className="ps-review"
              disabled={busy || locked || project.reviewState !== "pending"}
            >
              <label>
                {say("审核结果", "Decision")}
                <select
                  aria-label={say("审核结果", "Decision")}
                  value={action}
                  onChange={(e) => setAction(e.target.value as typeof action)}
                >
                  <option value="approved">{say("通过", "Approve")}</option>
                  <option value="rejected">{say("驳回", "Reject")}</option>
                </select>
              </label>
              <label>
                {say(
                  "给作者的审核说明（驳回必填）",
                  "Feedback to author (required for rejection)",
                )}
                <textarea
                  aria-label={say(
                    "给作者的审核说明（驳回必填）",
                    "Feedback to author (required for rejection)",
                  )}
                  value={reason}
                  maxLength={5000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label>
                {say("内部备注", "Internal note")}
                <textarea
                  aria-label={say("内部备注", "Internal note")}
                  maxLength={5000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button
                className="adm-button"
                disabled={action === "rejected" && !reason.trim()}
                onClick={() => setModal("decision")}
              >
                {say("提交审核", "Submit review")}
              </button>
            </fieldset>
          </section>
        </>
      )}
      {project.live && (
        <details className="adm-panel">
          <summary>
            {say("当前／最近公开版本", "Current / latest public version")} · v
            {project.liveRevision}
          </summary>
          <PublicPreview project={project.live} />
        </details>
      )}
      <section className="adm-panel">
        <h2>{say("操作历史", "Operation history")}</h2>
        {project.history.length === 0 && (
          <p>{say("暂无操作记录。", "No operation records.")}</p>
        )}
        {project.history.map((h) => (
          <details className="ps-history" key={h.id}>
            <summary>
              {h.action} · {h.actor.label} · {h.createdAt}
            </summary>
            <pre>
              {JSON.stringify({ before: h.before, after: h.after }, null, 2)}
            </pre>
          </details>
        ))}
      </section>
      {modal && (
        <AdminDialog
          title={
            modal === "decision"
              ? say("确认审核", "Confirm review")
              : modal === "publish"
                ? say("确认发布", "Confirm publication")
                : modal === "withdraw"
                  ? say("确认下架", "Confirm withdrawal")
                  : modal === "leave"
                    ? say("离开管理页面", "Leave management page")
                    : say("读取最新状态", "Read latest state")
          }
          busy={busy}
          close={() => setModal(null)}
        >
          <p>
            {modal === "publish"
              ? say(
                  "将公开当前批准版本的介绍和展示图片，PDF 不会公开。",
                  "Publish the approved introduction and display images. The PDF remains private.",
                )
              : modal === "withdraw"
                ? say(
                    "项目将从展区隐藏，资料和互动记录保留。",
                    "Hide this project from the gallery, preserving its data and interactions.",
                  )
                : modal === "decision"
                  ? say(
                      "审核决定绑定当前送审版本，记录操作人与原因。通过不会自动发布。",
                      "This decision applies to the submitted version and is audited. Approval does not publish.",
                    )
                  : say(
                      "未保存输入将被放弃，是否继续？",
                      "Unsaved input will be discarded. Continue?",
                    )}
          </p>
          {modal === "withdraw" && (
            <label>
              {say("下架原因", "Withdrawal reason")}
              <textarea
                maxLength={5000}
                aria-label={say("下架原因", "Withdrawal reason")}
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
              />
            </label>
          )}
          <div className="adm-actions">
            <button disabled={busy} onClick={() => setModal(null)}>
              {say("取消", "Cancel")}
            </button>
            <button
              className="adm-button"
              disabled={
                busy || (modal === "withdraw" && !withdrawReason.trim())
              }
              onClick={() => void run()}
            >
              {say("确认", "Confirm")}
            </button>
          </div>
        </AdminDialog>
      )}
    </AdminShell>
  );
}

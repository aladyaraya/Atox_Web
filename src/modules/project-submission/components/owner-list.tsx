"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Pagination } from "@/modules/admin/components/shared";
import { projectRequest } from "../client";
import type { Page, ProjectSummary } from "../contracts";
import {
  ProjectShell,
  ProjectStatus,
  projectError,
  useProjectText,
} from "./shared";
export function NewProject({ userId }: { userId: string }) {
  const { say, zh } = useProjectText(),
    router = useRouter(),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  async function create() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const key = `m015-create:${userId}`;
      let requestId = sessionStorage.getItem(key);
      if (!requestId) {
        requestId = crypto.randomUUID();
        sessionStorage.setItem(key, requestId);
      }
      const result = await projectRequest<{ id: string }>(
        "/api/account/projects",
        "POST",
        { requestId },
      );
      sessionStorage.removeItem(key);
      router.replace(`/account/projects/${result.id}`);
    } catch (e) {
      setError(e);
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ProjectShell>
      <p className="eyebrow purple-text">HACKATHON / BUILD IN PUBLIC</p>
      <h1>{say("提交项目", "Submit a project")}</h1>
      <p className="lead">
        {say(
          "填写介绍与展示材料，由官方审核后发布。",
          "Share your work and display materials for official review and publication.",
        )}
      </p>
      <p>
        {say(
          "独立项目长期开放；关联活动须已报名并遵守提交期。PDF 选填且仅供审核。",
          "Independent projects are always open. Event projects require registration and an open submission period. Optional PDFs remain private.",
        )}
      </p>
      {error != null && (
        <p role="alert" className="adm-error">
          {projectError(error, zh)}
        </p>
      )}
      <div className="adm-actions">
        <button
          className="adm-button"
          disabled={busy}
          onClick={() => void create()}
        >
          {busy
            ? say("正在创建…", "Creating…")
            : say("创建项目草稿", "Create project draft")}
        </button>
        <Link href="/account/projects">{say("我的项目", "My projects")}</Link>
        <Link href="/projects">{say("返回项目展区", "Back to projects")}</Link>
      </div>
    </ProjectShell>
  );
}
export function OwnProjects() {
  const { say, zh, language } = useProjectText();
  const [data, setData] = useState<Page<ProjectSummary> | null>(null),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(true),
    [error, setError] = useState<unknown>(null),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    projectRequest<Page<ProjectSummary>>(
      `/api/account/projects?page=${page}`,
      "GET",
      undefined,
      c.signal,
    )
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
  }, [page, refresh]);
  return (
    <ProjectShell>
      <div className="adm-heading">
        <h1>{say("我的项目", "My projects")}</h1>
        <Link className="adm-button" href="/projects/submit">
          {say("提交新项目", "Submit a new project")}
        </Link>
      </div>
      <p>
        {say(
          "草稿、审核和公开发布分别管理。修改已发布项目不会立即替换线上内容。",
          "Drafts, review and publication are separate. Editing does not replace the published version.",
        )}
      </p>
      {busy && <p role="status">{say("正在读取…", "Loading…")}</p>}
      {error != null && (
        <p role="alert">
          {projectError(error, zh)}{" "}
          <button
            onClick={() => {
              setBusy(true);
              setRefresh((v) => v + 1);
            }}
          >
            {say("重试", "Retry")}
          </button>
        </p>
      )}
      {data?.items.length === 0 && (
        <p className="adm-panel">
          {say(
            "还没有项目，创建第一份草稿开始。",
            "No projects yet. Start with your first draft.",
          )}
        </p>
      )}
      <div className="ps-cards">
        {data?.items.map((p) => (
          <article className="adm-panel" key={p.id}>
            <h2>
              <Link href={`/account/projects/${p.id}`}>
                {p.name[language] || say("未命名草稿", "Untitled draft")}
              </Link>
            </h2>
            <ProjectStatus project={p} />
            <p className="adm-muted">
              {p.eventId ?? say("独立项目", "Independent project")} · v
              {p.submittedRevision}
            </p>
            <Link href={`/account/projects/${p.id}`}>
              {say("编辑与查看结果", "Edit and view results")} ↗
            </Link>
          </article>
        ))}
      </div>
      {data && (
        <Pagination
          data={data}
          busy={busy}
          change={(n) => {
            setBusy(true);
            setPage(n);
          }}
        />
      )}
    </ProjectShell>
  );
}

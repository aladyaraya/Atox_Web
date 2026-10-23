"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AdminDialog } from "@/modules/admin/components/shared";
import { categories } from "@/modules/project-board/categories";
import { projectRequest, SubmissionApiError } from "../client";
import type {
  AssetDto,
  OwnerProject,
  ProjectInput,
  ProjectOptions,
} from "../contracts";
import {
  Assets,
  ProjectShell,
  ProjectStatus,
  projectError,
  useProjectText,
} from "./shared";
export function ProjectEditor({
  initial,
  options,
}: {
  initial: OwnerProject;
  options: ProjectOptions;
}) {
  const { say, zh, language } = useProjectText();
  const [project, setProject] = useState(initial),
    [input, setInput] = useState(initial.draft),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [locked, setLocked] = useState(false),
    [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<
      "submit" | "reload" | "withdraw" | "leave" | null
    >(null),
    [reason, setReason] = useState("");
  const saved = useRef(JSON.stringify(initial.draft)),
    inFlight = useRef(false),
    leaving = useRef("");
  const leaveConfirmed = useRef(false);
  const dirty = JSON.stringify(input) !== JSON.stringify(project.draft),
    base = `/api/account/projects/${project.id}`;
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
        !a ||
        a.target === "_blank" ||
        a.hasAttribute("download") ||
        a.origin !== location.origin ||
        a.hash ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.button !== 0
      )
        return;
      if (a.href !== location.href) {
        e.preventDefault();
        e.stopPropagation();
        leaving.current = a.href;
        setDialog("leave");
      }
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  function change(value: Partial<ProjectInput>) {
    setInput((p) => ({ ...p, ...value }));
    setNotice("");
  }
  function accept(value: OwnerProject) {
    setProject(value);
    setInput(value.draft);
    saved.current = JSON.stringify(value.draft);
    setError(null);
    setLocked(false);
  }
  async function persist() {
    if (JSON.stringify(input) === saved.current) return project;
    const { project: next } = await projectRequest<{ project: OwnerProject }>(
      base + "/draft",
      "PUT",
      { draftRevision: project.draftRevision, payload: input },
    );
    setProject(next);
    saved.current = JSON.stringify(input);
    return next;
  }
  function fail(e: unknown) {
    setError(e);
    if (
      !(e instanceof SubmissionApiError) ||
      e.status === 409 ||
      e.status >= 500
    )
      setLocked(true);
  }
  async function act(action: "save" | "submit" | "withdraw" | "reload") {
    if (inFlight.current || (locked && action !== "reload")) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      if (action === "reload") {
        const value = await projectRequest<{ project: OwnerProject }>(base);
        accept(value.project);
      } else if (action === "save") {
        const next = await persist();
        accept(next);
      } else if (action === "submit") {
        const next = await persist();
        const value = await projectRequest<{ project: OwnerProject }>(
          base + "/submit",
          "POST",
          { draftRevision: next.draftRevision, revision: next.revision },
        );
        accept(value.project);
      } else {
        const value = await projectRequest<{ project: OwnerProject }>(
          base + "/withdraw",
          "POST",
          { revision: project.revision, reason },
        );
        setProject(value.project);
        setInput((p) => ({ ...p, publicConsent: false }));
        saved.current = JSON.stringify(value.project.draft);
      }
      setDialog(null);
      setReason("");
      setNotice(say("操作已保存。", "Operation saved."));
    } catch (e) {
      fail(e);
      setDialog(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function upload(
    purpose: "cover" | "screenshot" | "document",
    file: File,
  ) {
    if (inFlight.current || locked) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await persist(),
        form = new FormData();
      form.set("file", file);
      form.set("purpose", purpose);
      const asset = await projectRequest<AssetDto>(
        base + "/files",
        "POST",
        form,
      );
      setProject({ ...next, assets: [...next.assets, asset] });
      setInput((p) => ({
        ...p,
        ...(purpose === "cover"
          ? { coverId: asset.id }
          : purpose === "document"
            ? { documentId: asset.id }
            : { screenshotIds: [...p.screenshotIds, asset.id] }),
      }));
    } catch (e) {
      fail(e);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <ProjectShell>
      <Link href="/account/projects" className="ps-back">
        ← {say("我的项目", "My projects")}
      </Link>
      <div className="adm-heading">
        <h1>{say("编辑项目", "Edit project")}</h1>
        <button disabled={busy} onClick={() => setDialog("reload")}>
          {say("读取最新状态", "Read latest state")}
        </button>
      </div>
      <ProjectStatus project={project} />
      <p className="adm-muted">
        {say(
          "草稿与送审版本、公开版本分开保存。审核通过后仍需官方发布。",
          "Drafts, submitted versions and public versions are separate. Approval still requires official publication.",
        )}{" "}
        · v{project.submittedRevision} / {say("公开版本", "Public version")}{" "}
        {project.liveRevision ?? "—"}
      </p>
      {project.consentRevoked && (
        <p className="ps-feedback">
          {say(
            "你已撤销公开授权。恢复公开须重新勾选授权、送审并由官方发布。",
            "You withdrew publication consent. Confirm consent again, resubmit and obtain official publication to restore it.",
          )}
        </p>
      )}
      {project.publicNote && (
        <p className="ps-feedback" role="status">
          {say("审核说明：", "Review feedback: ")}
          {project.publicNote}
        </p>
      )}
      {!project.canEdit && (
        <p role="status" className="adm-error">
          {projectError(
            new SubmissionApiError(project.editReason ?? "CLOSED", 409),
            zh,
          )}
        </p>
      )}
      {notice && (
        <p role="status" className="adm-success">
          {notice}
        </p>
      )}
      {error != null && (
        <p role="alert" className="adm-error">
          {projectError(error, zh)}
        </p>
      )}
      {locked && (
        <p className="adm-error">
          {say(
            "已保留当前输入并停止写入。请先核对最新状态。",
            "Your input is preserved and writes are locked. Read the latest state first.",
          )}
        </p>
      )}
      <form
        className="ps-form"
        onSubmit={(e) => {
          e.preventDefault();
          void act("save");
        }}
      >
        <fieldset disabled={busy || locked || !project.canEdit}>
          <div className="ps-fields">
            <label>
              {say("正文语言", "Content language")}
              <select
                aria-label={say("正文语言", "Content language")}
                value={input.language}
                onChange={(e) =>
                  change({ language: e.target.value as "zh" | "en" })
                }
              >
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {say("项目分类", "Category")}
              <select
                aria-label={say("项目分类", "Category")}
                value={input.category}
                onChange={(e) =>
                  change({
                    category: e.target.value as ProjectInput["category"],
                  })
                }
              >
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name[language]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {say("关联活动", "Associated event")}
              <select
                aria-label={say("关联活动", "Associated event")}
                disabled={project.submittedRevision > 0}
                value={input.eventId ?? ""}
                onChange={(e) => change({ eventId: e.target.value || null })}
              >
                <option value="">
                  {say("独立项目", "Independent project")}
                </option>
                {options.events.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name[language]}
                  </option>
                ))}
                {input.eventId &&
                  !options.events.some((e) => e.id === input.eventId) && (
                    <option value={input.eventId}>
                      {input.eventId} · {say("活动未公开", "Unavailable")}
                    </option>
                  )}
              </select>
            </label>
            <label>
              {say("创作者展示名", "Creator display name")}
              <input
                maxLength={100}
                value={input.creator}
                onChange={(e) => change({ creator: e.target.value })}
              />
            </label>
          </div>
          {input.eventId && (
            <p className="adm-muted">
              {say(
                "须已报名。首次送审后活动关联固定，上传、保存和重提遵守该活动提交期。",
                "Registration is required. Event association is fixed after first submission; uploads, saves and resubmissions follow its submission period.",
              )}
              {(() => {
                const e = options.events.find((e) => e.id === input.eventId);
                return e ? (
                  <span>
                    {" "}
                    · {e.opensAt} → {e.closesAt}
                  </span>
                ) : null;
              })()}
            </p>
          )}
          <label>
            {say("项目名称", "Project name")}
            <input
              maxLength={100}
              value={input.name}
              onChange={(e) => change({ name: e.target.value })}
            />
          </label>
          <label>
            {say("一句话介绍", "One-line introduction")}
            <input
              maxLength={200}
              value={input.tagline}
              onChange={(e) => change({ tagline: e.target.value })}
            />
          </label>
          <label>
            {say("详细说明", "Description")}
            <textarea
              aria-label={say("详细说明", "Description")}
              maxLength={20000}
              rows={9}
              value={input.description}
              onChange={(e) => change({ description: e.target.value })}
            />
          </label>
          <details>
            <summary>
              {say("另一语言翻译（选填）", "Translation (optional)")}
            </summary>
            <p>
              {say(
                "未填写时展示原文，不自动翻译。",
                "Missing translations fall back to the original text.",
              )}
            </p>
            {(
              [
                ["name", say("译文项目名称", "Translated project name"), 100],
                ["tagline", say("译文简介", "Translated introduction"), 200],
                [
                  "description",
                  say("译文说明", "Translated description"),
                  20000,
                ],
              ] as const
            ).map(([key, label, max]) => (
              <label key={key}>
                {label}
                <textarea
                  maxLength={max}
                  aria-label={label}
                  value={input.translation[key]}
                  onChange={(e) =>
                    change({
                      translation: {
                        ...input.translation,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
          </details>
          <label>
            {say(
              "标签（最多 8 个，逗号分隔）",
              "Tags (up to 8, comma-separated)",
            )}
            <input
              maxLength={250}
              value={input.tags.join(",")}
              onChange={(e) => change({ tags: e.target.value.split(/[,，]/) })}
              onBlur={() =>
                change({
                  tags: input.tags.map((t) => t.trim()).filter(Boolean),
                })
              }
            />
          </label>
          <div className="ps-fields">
            {(
              [
                ["demoUrl", say("体验链接", "Experience URL")],
                ["videoUrl", say("演示视频链接", "Video URL")],
                ["codeUrl", say("代码链接", "Code URL")],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="url"
                  maxLength={2000}
                  placeholder="https://"
                  value={input[key]}
                  onChange={(e) => change({ [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <section className="adm-panel">
            <h2>{say("项目材料", "Project materials")}</h2>
            <p className="adm-muted">
              {say(
                "封面 1 张、截图最多 6 张，PNG/JPEG/WebP 每张不超过 5MB；PDF 选填，最多 20MB，仅供审核。上传后请保存草稿。",
                "One cover and up to 6 screenshots (PNG/JPEG/WebP, 5MB each). Optional PDF up to 20MB, for review only. Save the draft after uploading.",
              )}
            </p>
            {(
              [
                ["cover", say("上传封面", "Upload cover")],
                ["screenshot", say("添加截图", "Add screenshot")],
                [
                  "document",
                  say("上传审核 PDF（选填）", "Upload review PDF (optional)"),
                ],
              ] as const
            ).map(([purpose, label]) => (
              <label key={purpose}>
                {label}
                <input
                  type="file"
                  disabled={
                    purpose === "screenshot" && input.screenshotIds.length >= 6
                  }
                  accept={
                    purpose === "document"
                      ? "application/pdf"
                      : "image/png,image/jpeg,image/webp"
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(purpose, file);
                  }}
                />
              </label>
            ))}
            <Assets
              assets={project.assets.filter((a) =>
                [
                  input.coverId,
                  input.documentId,
                  ...input.screenshotIds,
                ].includes(a.id),
              )}
            />
            {input.screenshotIds.map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={() =>
                  change({
                    screenshotIds: input.screenshotIds.filter((v) => v !== id),
                  })
                }
              >
                {say("移除截图", "Remove screenshot")} {i + 1}
              </button>
            ))}
            {input.documentId && (
              <button
                type="button"
                onClick={() => change({ documentId: null })}
              >
                {say("移除 PDF", "Remove PDF")}
              </button>
            )}
          </section>
          {(
            [
              [
                "original",
                say(
                  "我确认项目为原创作品。",
                  "I confirm this is original work.",
                ),
              ],
              [
                "usageAuthorized",
                say(
                  "我确认展示素材已取得使用授权。",
                  "I have the rights to use the submitted materials.",
                ),
              ],
              [
                "publicConsent",
                say(
                  "我同意审核通过后，由官方发布介绍和展示图片；PDF 不公开。",
                  "I authorize official publication of the approved introduction and display images. The PDF stays private.",
                ),
              ],
            ] as const
          ).map(([key, label]) => (
            <label className="ps-check" key={key}>
              <input
                type="checkbox"
                checked={input[key]}
                onChange={(e) => change({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
          <div className="adm-actions">
            <button type="submit">
              {busy ? say("保存中…", "Saving…") : say("保存草稿", "Save draft")}
            </button>
            <button
              className="adm-button"
              type="button"
              onClick={() => setDialog("submit")}
            >
              {say("正式提交审核", "Submit for review")}
            </button>
          </div>
        </fieldset>
      </form>
      <div className="adm-actions ps-bottom">
        {project.publicationState === "published" && (
          <>
            <Link href={`/projects/${project.id}`}>
              {say("查看公开项目", "View published project")} ↗
            </Link>
            <button disabled={busy} onClick={() => setDialog("withdraw")}>
              {say("下架我的项目", "Withdraw my project")}
            </button>
          </>
        )}
      </div>
      {dialog && (
        <AdminDialog
          title={
            dialog === "submit"
              ? say("确认正式提交", "Confirm submission")
              : dialog === "withdraw"
                ? say("下架我的项目", "Withdraw my project")
                : dialog === "leave"
                  ? say("离开编辑页面", "Leave editor")
                  : say("读取最新状态", "Read latest state")
          }
          busy={busy}
          close={() => setDialog(null)}
        >
          <p>
            {dialog === "submit"
              ? say(
                  "保存当前输入并创建新送审版本，审核不会自动发布。已有公开版本保持不变。",
                  "Save your input and submit a new version. Review does not publish it; the existing public version remains unchanged.",
                )
              : dialog === "withdraw"
                ? say(
                    "将立即隐藏公开项目并撤销授权，恢复须重新送审。",
                    "This immediately hides the project and revokes consent. Restoring it requires resubmission.",
                  )
                : say(
                    "未保存的输入将被放弃，是否继续？",
                    "Unsaved input will be discarded. Continue?",
                  )}
          </p>
          {dialog === "withdraw" && (
            <label>
              {say("下架原因", "Withdrawal reason")}
              <textarea
                maxLength={5000}
                aria-label={say("下架原因", "Withdrawal reason")}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <div className="adm-actions">
            <button onClick={() => setDialog(null)} disabled={busy}>
              {say("取消", "Cancel")}
            </button>
            <button
              className="adm-button"
              disabled={busy || (dialog === "withdraw" && !reason.trim())}
              onClick={() => {
                if (dialog === "leave") {
                  leaveConfirmed.current = true;
                  location.assign(leaving.current);
                } else void act(dialog);
              }}
            >
              {say("确认", "Confirm")}
            </button>
          </div>
        </AdminDialog>
      )}
    </ProjectShell>
  );
}

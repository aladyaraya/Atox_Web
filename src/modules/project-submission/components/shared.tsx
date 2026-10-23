"use client";
import Image from "next/image";
import Link from "next/link";
import { Header, Footer } from "@/components/site-shell";
import { useLanguage } from "@/components/language-provider";
import { SubmissionApiError } from "../client";
import type { AssetDto, PublicProject, ProjectSummary } from "../contracts";
export function useProjectText() {
  const { language } = useLanguage();
  return {
    language,
    zh: language === "zh",
    say: (zh: string, en: string) => (language === "zh" ? zh : en),
  };
}
export function ProjectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site ps-module">
      <Header signedIn />
      <main className="ps-main">{children}</main>
      <Footer />
    </div>
  );
}
export function projectError(error: unknown, zh: boolean) {
  const code = error instanceof SubmissionApiError ? error.code : "NETWORK";
  const messages: Record<string, [string, string]> = {
    INVALID_INPUT: [
      "请检查必填内容、长度及数量。",
      "Check required fields, lengths and counts.",
    ],
    DECLARATIONS_REQUIRED: [
      "请添加封面并确认全部投稿声明。",
      "Add a cover and confirm the submission declarations.",
    ],
    INVALID_FILE: [
      "附件格式、大小、用途或归属不正确。",
      "Invalid file format, size, purpose or ownership.",
    ],
    INVALID_LINK: [
      "链接必须使用 HTTPS，且不能含账号密码。",
      "Links must use HTTPS without embedded credentials.",
    ],
    CLOSED: [
      "该活动投稿已截止，已有内容仍可查看。",
      "Event submissions are closed. Existing content remains available.",
    ],
    NOT_OPEN: ["该活动投稿尚未开放。", "Event submissions have not opened."],
    REGISTRATION_REQUIRED: [
      "请先报名该活动。",
      "Register for this event first.",
    ],
    EVENT_LOCKED: [
      "首次送审后不能更换关联活动。",
      "Event association is fixed after first submission.",
    ],
    EVENT_UNAVAILABLE: [
      "关联活动未公开，暂不能执行此操作。",
      "The associated event is unavailable.",
    ],
    FORBIDDEN: ["没有操作权限。", "You do not have permission."],
    UNAUTHENTICATED: [
      "登录已过期，请重新登录。",
      "Your session expired. Sign in again.",
    ],
    REVISION_CONFLICT: [
      "资料已变化。当前输入已保留，请读取最新状态再确认。",
      "The project changed. Your input is preserved; read the latest state before confirming.",
    ],
    NOT_APPROVED: [
      "当前版本尚未通过审核，或作者已撤销授权。",
      "The current version is not approved or consent has been withdrawn.",
    ],
    NOT_PENDING: [
      "当前版本不在待审核状态。",
      "This version is not pending review.",
    ],
    NOT_FOUND: [
      "项目或附件不存在，或没有访问权限。",
      "Project or file not found, or access denied.",
    ],
    NOT_SUBMITTED: [
      "该项目尚未正式提交。",
      "This project has not been submitted.",
    ],
    NETWORK: [
      "未能确认请求结果，请核实最新状态，不要重复操作。",
      "The result is uncertain. Read the latest state before repeating an operation.",
    ],
  };
  return (messages[code] ?? messages.NETWORK)[zh ? 0 : 1];
}
export function ProjectStatus({
  project,
}: {
  project: Pick<ProjectSummary, "reviewState" | "publicationState" | "source">;
}) {
  const { say } = useProjectText();
  const review = {
    pending: say("待审核", "Pending"),
    approved: say("通过", "Approved"),
    rejected: say("驳回", "Rejected"),
  };
  const publication = {
    unpublished: say("未发布", "Unpublished"),
    published: say("已发布", "Published"),
    withdrawn: say("已下架", "Withdrawn"),
  };
  return (
    <div className="ps-status">
      <span className="adm-badge">
        {project.source === "demo"
          ? say("演示项目 · 不适用审核", "Demo · Review not applicable")
          : project.reviewState
            ? review[project.reviewState]
            : say("草稿", "Draft")}
      </span>
      <span className="adm-badge">{publication[project.publicationState]}</span>
    </div>
  );
}
export function Assets({ assets }: { assets: AssetDto[] }) {
  const { say } = useProjectText();
  return (
    <ul className="ps-assets">
      {assets.map((a) => (
        <li key={a.id}>
          <a href={a.href} target="_blank" rel="noopener noreferrer">
            {a.name} ↗
          </a>{" "}
          ·{" "}
          {a.purpose === "document"
            ? say("PDF · 仅供审核", "PDF · Review only")
            : say("展示图片", "Display image")}
        </li>
      ))}
    </ul>
  );
}
export function PublicPreview({ project }: { project: PublicProject }) {
  const { language, say } = useProjectText();
  return (
    <article className="ps-preview">
      <p className="adm-muted">
        {say(
          "授权预览 · 不改变公开版本",
          "Authorized preview · Does not change the public version",
        )}
      </p>
      <h2>{project.name[language]}</h2>
      <p className="lead">{project.introduction[language]}</p>
      <p>
        {project.creator[language]} · {project.category}
      </p>
      {project.details.media.map((m) => (
        <Image
          key={m.src}
          src={m.src}
          alt={m.alt[language]}
          width={1100}
          height={650}
          unoptimized
        />
      ))}
      {project.details.description.map((p, i) => (
        <p className="ps-prewrap" key={i}>
          {p[language]}
        </p>
      ))}
      <div className="adm-actions">
        {project.details.links.map((l) => (
          <a
            key={l.kind}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {l.label[language]} ↗
          </a>
        ))}
      </div>
      <Link href="/projects">
        {say("探索公开项目", "Explore published projects")} ↗
      </Link>
    </article>
  );
}

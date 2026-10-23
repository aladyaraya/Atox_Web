"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Header, Footer } from "@/components/site-shell";
import { useLanguage } from "@/components/language-provider";
import type { AccountProfileDto } from "@/modules/auth/profile-contracts";
import { Comments } from "@/modules/project-interaction/components/comments";
import { LikeButton } from "@/modules/project-interaction/components/like-button";
import type { CommentPage } from "@/modules/project-interaction/contracts";
import type { ProjectDetailDto, ProjectMedia } from "../contracts";
import { categories } from "../categories";
function Lightbox({
  media,
  close,
}: {
  media: ProjectMedia;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { language } = useLanguage(),
    zh = language === "zh";
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null,
      element = ref.current!;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      trigger?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className="pi-lightbox"
      ref={ref}
      aria-label={media.alt[language]}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <button
        type="button"
        onClick={close}
        aria-label={zh ? "关闭大图" : "Close image"}
      >
        ×
      </button>
      <Image
        src={media.src}
        alt={media.alt[language]}
        width={1200}
        height={800}
        unoptimized
      />
    </dialog>
  );
}
export function ProjectDetail({
  initial,
  comments,
  profile,
  viewerId,
  returnTo,
}: {
  initial: ProjectDetailDto;
  comments: CommentPage;
  profile: AccountProfileDto | null;
  viewerId: string | null;
  returnTo: string;
}) {
  const { language } = useLanguage(),
    zh = language === "zh";
  const [stats, setStats] = useState(initial.project.stats),
    [index, setIndex] = useState(0),
    [zoom, setZoom] = useState(false);
  const p = initial.project,
    details = initial.details,
    media = details.media[index];
  const next =
    "/projects/" +
    p.id +
    "?returnTo=" +
    encodeURIComponent(returnTo) +
    "#comments";
  return (
    <div className="site project-board">
      <Header signedIn={Boolean(viewerId)} />
      <main className="pi-detail">
        <Link className="pi-back" href={returnTo}>
          <span aria-hidden="true">← </span>
          {zh ? "返回项目展区" : "Back to projects"}
        </Link>
        <header className="pi-detail-header">
          <p className="pb-eyebrow">
            {p.demo
              ? zh
                ? "原创演示项目"
                : "ORIGINAL DEMO PROJECT"
              : zh
                ? "创作者项目"
                : "CREATOR PROJECT"}{" "}
            / {p.id}
          </p>
          <h1>{p.name[language]}</h1>
          <p className="pi-lead">{p.introduction[language]}</p>
          <div className="pi-detail-meta">
            <span>
              {categories.find((c) => c.id === p.category)?.name[language]}
            </span>
            <span>{p.creator[language]}</span>
            <time dateTime={p.publishedAt}>
              {new Date(p.publishedAt).toLocaleDateString(
                zh ? "zh-CN" : "en-GB",
                { timeZone: "Asia/Shanghai" },
              )}
            </time>
          </div>
          <div className="pb-tags">
            {p.tags.map((tag) => (
              <span key={tag.en}>{tag[language]}</span>
            ))}
          </div>
          <div className="pi-detail-actions">
            <LikeButton
              projectId={p.id}
              stats={stats}
              signedIn={Boolean(viewerId)}
              next={next}
              onChange={setStats}
            />
            <a href="#comments">
              {zh ? "评论" : "Comments"} {stats.commentCount}
            </a>
            {p.event ? (
              <Link href={p.event.href}>{p.event.name[language]} ↗</Link>
            ) : (
              <span>{zh ? "独立项目" : "Independent project"}</span>
            )}
          </div>
        </header>
        <section
          className="pi-gallery"
          aria-label={zh ? "项目媒体" : "Project media"}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              setIndex(
                (current) =>
                  (current +
                    (e.key === "ArrowRight" ? 1 : details.media.length - 1)) %
                  details.media.length,
              );
            }
          }}
        >
          <button
            className="pi-main-image"
            onClick={() => setZoom(true)}
            aria-label={zh ? "放大项目图片" : "Enlarge project image"}
          >
            <Image
              src={media.src}
              alt={media.alt[language]}
              width={1200}
              height={720}
              unoptimized
            />
          </button>
          <div className="pi-gallery-controls">
            <button
              aria-label={zh ? "上一张图片" : "Previous image"}
              onClick={() =>
                setIndex(
                  (index + details.media.length - 1) % details.media.length,
                )
              }
            >
              ←
            </button>
            <span>
              {index + 1} / {details.media.length} · {media.alt[language]}
            </span>
            <button
              aria-label={zh ? "下一张图片" : "Next image"}
              onClick={() => setIndex((index + 1) % details.media.length)}
            >
              →
            </button>
          </div>
        </section>
        <section
          className="pi-description"
          aria-label={zh ? "项目介绍" : "Project introduction"}
        >
          <h2>{zh ? "关于这个想法" : "About the idea"}</h2>
          {details.description.map((text, i) => (
            <p key={i}>{text[language]}</p>
          ))}
          <div className="pi-detail-actions">
            {details.links
              .filter((link) => {
                try {
                  const url = new URL(link.href);
                  return (
                    url.protocol === "https:" && !url.username && !url.password
                  );
                } catch {
                  return false;
                }
              })
              .map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {link.label[language]} ↗
                </a>
              ))}
          </div>
        </section>
        <Comments
          projectId={p.id}
          viewerId={viewerId}
          initial={comments}
          initialProfile={profile}
          next={next}
          onCount={(commentCount) =>
            setStats((current) => ({ ...current, commentCount }))
          }
        />
      </main>
      <Footer />
      {zoom && <Lightbox media={media} close={() => setZoom(false)} />}
    </div>
  );
}

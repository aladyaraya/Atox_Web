"use client";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Header, Footer } from "@/components/site-shell";
import { useLanguage } from "@/components/language-provider";
import type {
  ProjectBoardDto,
  ProjectCard,
  ProjectFilters,
} from "../contracts";
import { fetchProjects } from "../client";
import { normalizeFilters, parseFilters, projectQuery } from "../rules";
import { projectCopy } from "../copy";
import { LikeButton } from "@/modules/project-interaction/components/like-button";

function ProjectCover({ project }: { project: ProjectCard }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="pb-cover">
      {project.cover && !failed ? (
        <Image
          unoptimized
          src={project.cover}
          width={800}
          height={500}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="pb-cover-fallback" data-testid="project-cover-fallback">
          <span aria-hidden="true">✳</span>
          <small>ROOM FOR AN IDEA</small>
        </div>
      )}
    </div>
  );
}

export function ProjectBoardView({
  initial,
  signedIn,
}: {
  initial: ProjectBoardDto;
  signedIn: boolean;
}) {
  const { language } = useLanguage();
  const t = projectCopy[language];
  const [data, setData] = useState(initial);
  const [active, setActive] = useState(initial.filters);
  const [search, setSearch] = useState(initial.filters.q);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (filters: ProjectFilters, history = true) => {
    const next = normalizeFilters(filters);
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setActive(next);
    setPending(true);
    setError(false);
    if (history) {
      const url = `/projects${projectQuery(next)}`;
      if (url !== window.location.pathname + window.location.search)
        window.history.pushState(null, "", url);
    }
    try {
      const result = await fetchProjects(next, request.signal);
      if (!request.signal.aborted) setData(result);
    } catch {
      if (!request.signal.aborted) setError(true);
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim() !== active.q)
        void load({ ...active, q: search, page: "1" });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, active, load]);
  useEffect(() => {
    function restore() {
      const filters = parseFilters(new URLSearchParams(window.location.search));
      setSearch(filters.q);
      void load(filters, false);
    }
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      controller.current?.abort();
    };
  }, [load]);
  function reset() {
    setSearch("");
    void load({});
  }
  function filter(key: "event" | "category", value: string) {
    void load({ ...active, q: search, [key]: value, page: "1" });
  }
  const hasFilters = Boolean(active.q || active.category || active.event);
  return (
    <div className="site project-board">
      <Header signedIn={signedIn} projectSubmission />
      <main className="pb-main">
        <section className="pb-hero">
          <div>
            <p className="pb-eyebrow">{t.eyebrow}</p>
            <h1>
              {t.title}
              <br />
              <em>{t.accent}</em>
            </h1>
            <p className="pb-lead">{t.intro}</p>
            <div className="pb-hero-links">
              <Link className="pb-primary" href="/projects/submit">
                {t.submit} <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/events">
                {t.events} <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <p className="pb-demo-note">
              <span aria-hidden="true">●</span> {t.demoNote}
            </p>
          </div>
          <div className="pb-hero-art" aria-hidden="true">
            <div className="pb-orbit" />
            <div className="pb-art-window">
              <span>IDEA / 001</span>
              <b>✳</b>
              <small>WHAT IF?</small>
            </div>
            <span className="pb-art-dot" />
            <span className="pb-art-label">BUILD / PLAY / DISCOVER</span>
          </div>
        </section>
        <form
          className="pb-filters"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            void load({ ...active, q: search, page: "1" });
          }}
        >
          <label className="pb-search">
            <span>{t.search}</span>
            <input
              type="search"
              value={search}
              placeholder={t.placeholder}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span>{t.category}</span>
            <select
              aria-label={t.category}
              value={active.category}
              onChange={(event) => filter("category", event.target.value)}
            >
              <option value="">{t.allCategories}</option>
              {data.options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name[language]}
                </option>
              ))}
              {active.category &&
                !data.options.categories.some(
                  (c) => c.id === active.category,
                ) && <option value={active.category}>{active.category}</option>}
            </select>
          </label>
          <label>
            <span>{t.event}</span>
            <select
              aria-label={t.event}
              value={active.event}
              onChange={(event) => filter("event", event.target.value)}
            >
              <option value="">{t.allEvents}</option>
              <option value="independent">{t.independent}</option>
              {data.options.events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name[language]}
                </option>
              ))}
              {active.event &&
                active.event !== "independent" &&
                !data.options.events.some((e) => e.id === active.event) && (
                  <option value={active.event}>{active.event}</option>
                )}
            </select>
          </label>
        </form>
        <section
          className="pb-results"
          aria-busy={pending}
          aria-label={t.results}
        >
          <div className="pb-results-heading">
            <h2>
              {t.results}
              <span aria-live="polite">
                {pending ? "…" : `${data.total} ${t.count}`}
              </span>
            </h2>
            <div>
              {hasFilters && (
                <button type="button" onClick={reset}>
                  {t.reset} ×
                </button>
              )}
              <label className="pi-sort">
                {language === "zh" ? "排序" : "Sort"}
                <select
                  aria-label={language === "zh" ? "项目排序" : "Project sort"}
                  value={active.sort}
                  onChange={(e) =>
                    void load({ ...active, sort: e.target.value, page: "1" })
                  }
                >
                  <option value="newest">
                    {language === "zh" ? "最新发布" : "Newest first"}
                  </option>
                  <option value="oldest">
                    {language === "zh" ? "最早发布" : "Oldest first"}
                  </option>
                  <option value="likes">
                    {language === "zh" ? "点赞最多" : "Most liked"}
                  </option>
                </select>
              </label>
            </div>
          </div>
          {pending ? (
            <div className="pb-empty" role="status">
              {t.loading}
            </div>
          ) : error ? (
            <div className="pb-empty" role="alert">
              <p>{t.error}</p>
              <button
                className="pb-primary"
                onClick={() => void load(active, false)}
              >
                {t.retry}
              </button>
            </div>
          ) : data.projects.length ? (
            <div className="pb-grid">
              {data.projects.map((project) => (
                <article className="pb-card" key={project.id}>
                  <Link
                    className="pb-card-button"
                    aria-label={t.preview + ": " + project.name[language]}
                    href={
                      "/projects/" +
                      project.id +
                      "?returnTo=" +
                      encodeURIComponent("/projects" + projectQuery(active))
                    }
                  >
                    <ProjectCover project={project} />
                    <div className="pb-card-body">
                      <div className="pb-card-meta">
                        <span className="pb-category">
                          {
                            data.options.categories.find(
                              (c) => c.id === project.category,
                            )?.name[language]
                          }
                        </span>
                        <span>{t.demo}</span>
                      </div>
                      <h3>{project.name[language]}</h3>
                      <p className="pb-card-intro">
                        {project.introduction[language]}
                      </p>
                      <div className="pb-tags">
                        {project.tags.slice(0, 3).map((tag) => (
                          <span key={tag.en}>{tag[language]}</span>
                        ))}
                      </div>
                      <p className="pb-creator">{project.creator[language]}</p>
                      <div className="pb-card-bottom">
                        <span>
                          {project.event?.name[language] ?? t.independent}
                        </span>
                        <span aria-hidden="true">↗</span>
                      </div>
                    </div>
                  </Link>
                  <div className="pi-card-actions">
                    <LikeButton
                      projectId={project.id}
                      stats={project.stats}
                      signedIn={signedIn}
                      next={
                        "/projects/" +
                        project.id +
                        "?returnTo=" +
                        encodeURIComponent("/projects" + projectQuery(active)) +
                        "#comments"
                      }
                      onChange={(stats) =>
                        setData((current) => ({
                          ...current,
                          projects: current.projects.map((p) =>
                            p.id === project.id ? { ...p, stats } : p,
                          ),
                        }))
                      }
                    />
                    <Link
                      href={
                        "/projects/" +
                        project.id +
                        "?returnTo=" +
                        encodeURIComponent("/projects" + projectQuery(active)) +
                        "#comments"
                      }
                    >
                      {language === "zh" ? "评论" : "Comments"}{" "}
                      {project.stats.commentCount}
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="pb-empty">
              <span aria-hidden="true">✳</span>
              <h3>{data.total > 0 ? t.outOfRange : t.empty}</h3>
              <p>{t.emptyHint}</p>
              <button
                className="pb-primary"
                onClick={
                  data.total > 0
                    ? () => void load({ ...active, page: "1" })
                    : reset
                }
              >
                {data.total > 0 ? t.firstPage : t.reset}
              </button>
            </div>
          )}
          {!pending && !error && data.totalPages > 0 && (
            <nav className="pb-pagination" aria-label={t.pagination}>
              <button
                disabled={data.page <= 1}
                onClick={() =>
                  void load({
                    ...active,
                    page: String(Math.min(data.page - 1, data.totalPages)),
                  })
                }
              >
                ← {t.previous}
              </button>
              <span>
                {data.page} / {data.totalPages}
              </span>
              <button
                disabled={data.page >= data.totalPages}
                onClick={() =>
                  void load({ ...active, page: String(data.page + 1) })
                }
              >
                {t.next} →
              </button>
            </nav>
          )}
        </section>
        <div className="pb-closing">
          <span>YOUR NEXT IDEA STARTS HERE.</span>
          <Link href="/projects/submit">{t.submit} ↗</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function ProjectSubmissionPlaceholder({
  signedIn,
}: {
  signedIn: boolean;
}) {
  const { language } = useLanguage();
  const t = projectCopy[language];
  return (
    <div className="site project-board">
      <Header signedIn={signedIn} projectSubmission />
      <main className="pb-submit">
        <p className="pb-eyebrow">A SPACE FOR YOUR NEXT IDEA</p>
        <div className="pb-submit-art" aria-hidden="true">
          ✳
        </div>
        <h1>{t.submitTitle}</h1>
        <h2>{t.submitIntro}</h2>
        <p>{t.submitBody}</p>
        <p className="pb-demo-note">{t.submitNote}</p>
        <div className="pb-hero-links">
          <Link className="pb-primary" href="/projects">
            {t.back} ↗
          </Link>
          <Link href="/events">{t.events} ↗</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}

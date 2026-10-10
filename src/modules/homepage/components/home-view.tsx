"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useLanguage } from "@/components/language-provider";
import { Header } from "@/components/site-shell";
import { homepageConfig as config } from "../config";
import { HomepageFooter } from "./navigation";
import { HeroArt } from "./hero-art";
import type { HomepageContent } from "../../content-management/contracts";
import { homeCopy } from "../../content-management/home-copy";

export function HomeView({
  signedIn,
  year,
  content,
}: {
  signedIn: boolean;
  year: number;
  content?: HomepageContent;
}) {
  const { language } = useLanguage();
  const t = homeCopy(language, content);
  useEffect(() => {
    if (!content) return;
    document.title = content.metadata.title[language];
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (meta) meta.content = content.metadata.description[language];
  }, [content, language]);
  return (
    <div className="hp-site" id="top">
      <Header signedIn={signedIn} variant="homepage" />
      <main id="main-content" tabIndex={-1}>
        <section className="hp-hero" aria-labelledby="hp-title">
          <HeroArt />
          <div className="hp-hero-copy hp-container">
            <p className="hp-eyebrow">
              <span className="hp-live-dot" />
              {t.heroEyebrow}
            </p>
            <h1 id="hp-title">
              {t.heroLineOne}
              <br />
              {t.heroLineTwo}
              <span>{t.heroAccent}</span>
            </h1>
            <p className="hp-hero-description">{t.heroDescription}</p>
            <div className="hp-buttons">
              <Link
                className="hp-button hp-button-primary"
                href={config.routes.events}
              >
                {t.exploreEvents}
                <span aria-hidden="true">↗</span>
              </Link>
              <Link
                className="hp-button hp-button-secondary"
                href={config.routes.projects}
              >
                {t.projects}
                <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <p className="hp-hero-note">{t.heroNote}</p>
          </div>
          <div className="hp-hero-bottom hp-container">
            <span>{t.demo}</span>
            <a href="#about">
              {t.exploreDown}
              <span aria-hidden="true">↓</span>
            </a>
            <span className="hp-hero-coordinate" aria-hidden="true">
              IDEA → POSSIBILITY / 001
            </span>
          </div>
        </section>
        <section
          id="about"
          className="hp-about hp-section hp-container"
          aria-labelledby="hp-about-title"
        >
          <p className="hp-section-label">{t.aboutEyebrow}</p>
          <div className="hp-about-layout">
            <h2 id="hp-about-title">{t.aboutTitle}</h2>
            <div>
              <p className="hp-about-lead">{t.aboutLead}</p>
              <p>{t.aboutBody}</p>
              <p>{t.aboutClosing}</p>
              <span className="hp-about-signature" aria-hidden="true">
                CURIOSITY INTO CREATION <span>↗</span>
              </span>
            </div>
          </div>
        </section>
        <section
          id="programs"
          className="hp-programs hp-section"
          aria-labelledby="hp-programs-title"
        >
          <div className="hp-container">
            <p className="hp-section-label">{t.programsEyebrow}</p>
            <div className="hp-section-heading">
              <h2 id="hp-programs-title">{t.programsTitle}</h2>
              <p>{t.programsIntro}</p>
            </div>
            <div className="hp-program-grid">
              {t.programItems.map((item, index) => (
                <article key={item.subtitle} className="hp-program">
                  <div className="hp-program-top">
                    <span>0{index + 1}</span>
                    <span aria-hidden="true">{["⌘", "↗", "✳"][index]}</span>
                  </div>
                  <p className="hp-program-subtitle">{item.subtitle}</p>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section
          id="explore"
          className="hp-explore hp-section hp-container"
          aria-labelledby="hp-explore-title"
        >
          <p className="hp-section-label">{t.exploreEyebrow}</p>
          <h2 id="hp-explore-title">{t.exploreTitle}</h2>
          <div className="hp-explore-grid">
            <Link
              className="hp-explore-card hp-event-entry"
              href={config.routes.events}
            >
              <span className="hp-card-tag">
                <span />
                {t.eventCardTag}
              </span>
              <h3>{t.eventCardTitle}</h3>
              <p>{t.eventCardBody}</p>
              <span className="hp-card-action">
                {t.eventCardAction}
                <span aria-hidden="true">↗</span>
              </span>
              <span className="hp-card-art" aria-hidden="true">
                ↗
              </span>
            </Link>
            <Link
              className="hp-explore-card hp-project-entry"
              href={config.routes.projects}
            >
              <span className="hp-card-tag">
                <span />
                {t.projectCardTag}
              </span>
              <h3>{t.projectCardTitle}</h3>
              <p>{t.projectCardBody}</p>
              <span className="hp-card-action">
                {t.projectCardAction}
                <span aria-hidden="true">↗</span>
              </span>
              <span className="hp-card-art" aria-hidden="true">
                ✳
              </span>
            </Link>
          </div>
        </section>
      </main>
      <HomepageFooter signedIn={signedIn} year={year} content={content} />
    </div>
  );
}

export function ProjectsPlaceholder({
  signedIn,
  year,
}: {
  signedIn: boolean;
  year: number;
}) {
  const { language } = useLanguage();
  const t = config.copy[language];
  return (
    <div className="hp-site hp-projects-page" id="top">
      <Header signedIn={signedIn} variant="homepage" />
      <main
        id="main-content"
        className="hp-projects-main hp-container"
        tabIndex={-1}
      >
        <div className="hp-projects-art" aria-hidden="true">
          <span>✳</span>
          <i />
        </div>
        <p className="hp-eyebrow">{t.projectEyebrow}</p>
        <h1>{t.projectTitle}</h1>
        <p className="hp-projects-description">{t.projectBody}</p>
        <span className="hp-projects-status">
          <span className="hp-live-dot" />
          {t.projectStatus}
        </span>
        <div className="hp-buttons">
          <Link
            className="hp-button hp-button-primary"
            href={config.routes.events}
          >
            {t.exploreEvents}
            <span aria-hidden="true">↗</span>
          </Link>
          <Link
            className="hp-button hp-button-secondary"
            href={config.routes.home}
          >
            {t.backHome}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </main>
      <HomepageFooter signedIn={signedIn} year={year} />
    </div>
  );
}

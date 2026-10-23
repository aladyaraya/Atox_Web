"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminRequest, AdminApiError } from "@/modules/admin/client";
import type { AdminIdentity } from "@/modules/admin/contracts";
import {
  AccessDenied,
  AdminShell,
  Pagination,
} from "@/modules/admin/components/shared";
import type {
  MaterialReviewItem,
  MaterialReviewList,
  ReviewFilters,
  ReviewStatus,
} from "../contracts";
import { readFilters, reviewQuery } from "../rules";
import { useReviewText } from "./shared";
import { ReviewWindow, receivedPolicy, useReviewClock } from "./window";
import { RevokeDialog } from "./revoke";
export type ListFilters = ReviewFilters;
export function ReviewList({
  identity,
  initial,
}: {
  identity: AdminIdentity;
  initial: ListFilters;
}) {
  const { t, language } = useReviewText(),
    zh = language === "zh";
  const [filters, setFilters] = useState(initial),
    [applied, setApplied] = useState(initial);
  const [refresh, setRefresh] = useState(0),
    [data, setData] = useState<MaterialReviewList | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState<unknown>(null),
    [revoke, setRevoke] = useState<MaterialReviewItem | null>(null);
  const scrollRestored = useRef(false);
  const apply = useCallback((value: ListFilters) => {
    setBusy(true);
    setApplied(value);
    setFilters(value);
    const query = reviewQuery(value),
      path = "/admin/materials" + (query ? `?${query}` : "");
    if (path !== window.location.pathname + window.location.search)
      window.history.pushState(null, "", path);
  }, []);
  useEffect(() => {
    function restore() {
      const value = readFilters(new URLSearchParams(window.location.search));
      setFilters(value);
      setApplied(value);
      setBusy(true);
    }
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    if ((filters.q ?? "").trim() === (applied.q ?? "").trim()) return;
    const timer = setTimeout(
      () => apply({ ...filters, q: filters.q?.trim(), page: 1 }),
      300,
    );
    return () => clearTimeout(timer);
  }, [filters, applied.q, apply]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    adminRequest<MaterialReviewList>(
      `/materials?${reviewQuery(applied)}`,
      "GET",
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (active) {
          setData({
            ...value,
            events: value.events.map((event) => ({
              ...event,
              reviewPolicy: receivedPolicy(event.reviewPolicy),
            })),
            items: value.items.map((item) => ({
              ...item,
              reviewPolicy: receivedPolicy(item.reviewPolicy),
            })),
          });
          setError(null);
        }
      })
      .catch((reason) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    function focus() {
      setBusy(true);
      setRefresh((value) => value + 1);
    }
    window.addEventListener("focus", focus);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener("focus", focus);
    };
  }, [applied, refresh]);
  useEffect(() => {
    if (!data || busy || scrollRestored.current) return;
    scrollRestored.current = true;
    try {
      const value = sessionStorage.getItem(
        "m009-scroll:" + reviewQuery(applied),
      );
      if (value) {
        window.scrollTo(0, Number(value));
        sessionStorage.removeItem("m009-scroll:" + reviewQuery(applied));
      }
    } catch {
      /* Storage is optional. */
    }
  }, [data, busy, applied]);
  const selected = data?.events.find((event) => event.id === applied.eventId);
  const selectedClock = useReviewClock(selected?.reviewPolicy);
  if (error instanceof AdminApiError && [401, 403].includes(error.status))
    return <AccessDenied expired={error.status === 401} />;
  const returnTo =
    "/admin/materials" +
    (reviewQuery(applied) ? `?${reviewQuery(applied)}` : "");
  const href = (item: MaterialReviewItem) =>
    `/admin/materials/${item.id}?returnTo=${encodeURIComponent(returnTo)}`;
  const rememberScroll = () => {
    try {
      sessionStorage.setItem(
        "m009-scroll:" + reviewQuery(applied),
        String(window.scrollY),
      );
    } catch {
      /* optional */
    }
  };
  const dates = (value: string | null, zone: string) =>
    value
      ? new Intl.DateTimeFormat(zh ? "zh-CN" : "en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: zone,
        }).format(new Date(value))
      : "—";
  const updated = () => {
    setBusy(true);
    setRefresh((value) => value + 1);
  };
  const tracks = (data?.events ?? [])
    .filter((event) => !filters.eventId || filters.eventId === event.id)
    .flatMap((event) =>
      event.tracks.map((track) => ({
        value: `${event.id}:${track.id}`,
        name: `${filters.eventId ? "" : event.name[language] + " · "}${track.name[language]}`,
      })),
    );
  return (
    <AdminShell identity={identity}>
      <div className="adm-heading">
        <h1>{t.title}</h1>
        <a
          className="mr-table-jump"
          href="#material-review-table"
          onClick={(event) => {
            event.preventDefault();
            const table = document.getElementById("material-review-table");
            table?.focus({ preventScroll: true });
            table?.scrollIntoView({ block: "start", behavior: "instant" });
          }}
        >
          {zh ? "查看总表 ↓" : "View table ↓"}
        </a>
        <button disabled={busy} onClick={updated}>
          {t.refresh}
        </button>
      </div>
      <p className="adm-muted">{t.introduction}</p>
      <form
        className="mr-filters"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ ...filters, page: 1 });
        }}
      >
        <label htmlFor="mr-event">
          {t.event}
          <select
            id="mr-event"
            value={filters.eventId ?? ""}
            onChange={(event) =>
              apply({
                ...filters,
                eventId: event.target.value || undefined,
                trackId: undefined,
                page: 1,
              })
            }
          >
            <option value="">{t.allEvents}</option>
            {data?.events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name[language]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="mr-q">
          {zh ? "搜索项目或提交人" : "Search project or participant"}
          <input
            id="mr-q"
            maxLength={200}
            value={filters.q ?? ""}
            onChange={(event) =>
              setFilters({ ...filters, q: event.target.value })
            }
          />
        </label>
        <label htmlFor="mr-status">
          {t.state}
          <select
            id="mr-status"
            value={filters.status ?? ""}
            onChange={(event) =>
              apply({
                ...filters,
                status: (event.target.value || undefined) as
                  ReviewStatus | undefined,
                page: 1,
              })
            }
          >
            <option value="">{t.allStates}</option>
            {(["pending", "approved", "rejected"] as const).map((status) => (
              <option key={status} value={status}>
                {t[status === "approved" ? "accepted" : status]}
              </option>
            ))}
          </select>
        </label>
        <div className="mr-filter-actions">
          <button type="submit">{t.filter}</button>
          <button type="button" onClick={() => apply({ page: 1 })}>
            {zh ? "清空筛选" : "Clear filters"}
          </button>
        </div>
        <details
          className="mr-more-filters"
          open={Boolean(
            filters.trackId ||
            filters.coordination ||
            filters.sort === "oldest",
          )}
        >
          <summary>
            {zh
              ? "更多筛选（赛道、协调、排序）"
              : "More filters (track, coordination, sort)"}
          </summary>
          <div className="mr-secondary-filters">
            <label htmlFor="mr-track">
              {t.track}
              <select
                id="mr-track"
                value={filters.trackId ?? ""}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    trackId: event.target.value || undefined,
                  })
                }
              >
                <option value="">{zh ? "全部赛道" : "All tracks"}</option>
                {tracks.map((track) => (
                  <option key={track.value} value={track.value}>
                    {track.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="mr-coordination">
              {zh ? "协调情况" : "Coordination"}
              <select
                id="mr-coordination"
                value={filters.coordination ?? ""}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    coordination: (event.target.value ||
                      undefined) as ReviewFilters["coordination"],
                  })
                }
              >
                <option value="">{zh ? "全部" : "All"}</option>
                <option value="required">
                  {zh ? "待协调" : "Needs coordination"}
                </option>
                <option value="none">
                  {zh ? "无需协调" : "No coordination needed"}
                </option>
              </select>
            </label>
            <label htmlFor="mr-sort">
              {zh ? "排序" : "Sort"}
              <select
                id="mr-sort"
                value={filters.sort ?? "newest"}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    sort: event.target.value as ReviewFilters["sort"],
                  })
                }
              >
                <option value="newest">
                  {zh ? "最新提交优先" : "Newest first"}
                </option>
                <option value="oldest">
                  {zh ? "最早提交优先" : "Oldest first"}
                </option>
              </select>
            </label>
          </div>
        </details>
      </form>
      {selected ? (
        <ReviewWindow
          policy={selected.reviewPolicy}
          compact
          edit
          onSaved={updated}
        />
      ) : (
        <p className="adm-muted">
          {zh
            ? "全部活动总览 · 点击项目进入审核；选定活动可调整时间，默认跟随活动起止。"
            : "All events · Open a project to review it. Select an event to adjust timing; event dates apply by default."}
        </p>
      )}
      {data && (
        <>
          <div className="mr-stats">
            {(
              [
                ["total", zh ? "正式提交" : "Submitted"],
                ["pending", t.pending],
                ["approved", t.accepted],
                ["rejected", t.rejected],
                ["coordination", zh ? "待协调" : "Needs coordination"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <span>{label}</span>
                <strong>{data.statistics[key]}</strong>
              </div>
            ))}
          </div>
          <details className="mr-stat-scope">
            <summary>{zh ? "统计范围说明" : "Statistics scope"}</summary>
            <p className="adm-muted">
              {zh
                ? "统计应用活动、搜索、赛道和协调条件，不应用审核状态；列表数量应用全部筛选。"
                : "Statistics apply event, search, track and coordination filters, excluding review status. List count applies every filter."}
            </p>
          </details>
        </>
      )}
      {busy && <p role="status">{t.loading}</p>}
      {error != null && (
        <div role="alert" className="adm-error">
          {t.network}
          <button onClick={updated}>{t.retry}</button>
        </div>
      )}
      <section
        id="material-review-table"
        className="mr-table-section"
        tabIndex={-1}
        aria-label={zh ? "正式材料记录" : "Official submission records"}
      >
        <h2>
          {zh ? "正式材料记录" : "Official submission records"}
          {data && (
            <small>
              {" "}
              · {data.total} {zh ? "份" : "matching"}
            </small>
          )}
        </h2>
        {!busy && !error && data?.items.length === 0 && (
          <div className="adm-panel">
            <p>
              {data.statistics.total === 0 &&
              !applied.q &&
              !applied.trackId &&
              !applied.coordination
                ? zh
                  ? "尚无正式提交。选手保存的草稿不会进入审核总表，正式提交后才会显示。"
                  : "No official submissions yet. Saved drafts appear here only after participants submit them."
                : zh
                  ? "当前筛选没有匹配的正式材料，请清空筛选或返回第一页。"
                  : "No official submissions match. Clear filters or return to page one."}
            </p>
            <button onClick={() => apply({ page: 1 })}>
              {zh ? "查看所有正式材料" : "View all submissions"}
            </button>
          </div>
        )}
        {data && !error && (
          <div className="mr-table-wrap" aria-busy={busy}>
            <table className="mr-table">
              <caption>
                {zh
                  ? "材料审核总表 · 每页 20 份"
                  : "Material review table · 20 per page"}
              </caption>
              <thead>
                <tr>
                  {[
                    zh ? "项目" : "Project",
                    t.event,
                    t.participant,
                    t.track,
                    t.submittedRevision,
                    t.state,
                    zh ? "协调情况" : "Coordination",
                    zh ? "最近处理" : "Last decision",
                    zh ? "操作" : "Actions",
                  ].map((value) => (
                    <th key={value} scope="col">
                      {value}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} data-material-id={item.id}>
                    <td data-label={zh ? "项目" : "Project"}>
                      <Link href={href(item)} onClick={rememberScroll}>
                        {item.projectName}
                      </Link>
                      <p className="mr-truncate">{item.tagline}</p>
                    </td>
                    <td data-label={t.event}>{item.eventName[language]}</td>
                    <td data-label={t.participant}>{item.participantName}</td>
                    <td data-label={t.track}>{item.trackName[language]}</td>
                    <td data-label={t.submittedRevision}>
                      {dates(item.submittedAt, item.reviewPolicy.timeZone)}
                      <small>v{item.submittedRevision}</small>
                    </td>
                    <td data-label={t.state}>
                      <span className="adm-badge">
                        {
                          t[
                            item.status === "approved"
                              ? "accepted"
                              : item.status
                          ]
                        }
                      </span>
                    </td>
                    <td data-label={zh ? "协调情况" : "Coordination"}>
                      {item.coordinationRequired
                        ? zh
                          ? "待协调"
                          : "Needs coordination"
                        : zh
                          ? "无需协调"
                          : "No coordination needed"}
                    </td>
                    <td data-label={zh ? "最近处理" : "Last decision"}>
                      {item.recentAction ? (
                        <>
                          {item.recentAction.actor.label}
                          <small>
                            {dates(
                              item.recentAction.createdAt,
                              item.reviewPolicy.timeZone,
                            )}
                          </small>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="adm-actions">
                      <Link href={href(item)} onClick={rememberScroll}>
                        {t.review}
                      </Link>
                      {selected &&
                        item.status === "approved" &&
                        selectedClock.state === "open" && (
                          <button onClick={() => setRevoke(item)}>
                            {zh ? "撤回通过" : "Revoke approval"}
                          </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <Pagination
            data={data}
            busy={busy}
            change={(page) => apply({ ...applied, page })}
          />
        )}
      </section>
      {revoke && (
        <RevokeDialog
          item={revoke}
          close={() => setRevoke(null)}
          onSaved={() => {
            setRevoke(null);
            updated();
          }}
        />
      )}
    </AdminShell>
  );
}

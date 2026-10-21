import { test } from "node:test";
import assert from "node:assert/strict";
import { projectRegistry } from "../src/modules/project-board/config";
import { readProjectCatalog } from "../src/modules/project-board/catalog";
import {
  normalizeFilters,
  projectQuery,
  parseFilters,
} from "../src/modules/project-board/rules";
import { eventRegistry } from "../src/modules/event-board/config";
import { getEventStage, getEventYear } from "../src/modules/event-board/rules";
import { safeProjectReturn } from "../src/modules/project-board/return-to";
const events = eventRegistry
  .filter((e) => e.published)
  .map((e) => ({ ...e, year: getEventYear(e), stage: getEventStage(e) }));
const query = (filters = {}) =>
  readProjectCatalog(projectRegistry, events, filters);

test("Sorts the full filtered catalog before pagination, with deterministic ties and safe return URLs", () => {
  const counts = new Map(
    projectRegistry.map((p) => [
      p.id,
      { likeCount: 0, commentCount: 0, likedByMe: false },
    ]),
  );
  counts.get("trail-lines")!.likeCount = 50;
  counts.get("blank-canvas")!.likeCount = 49;
  const sorted = readProjectCatalog(
    projectRegistry,
    events,
    { sort: "likes" },
    counts,
  );
  assert.deepEqual(
    sorted.projects.slice(0, 2).map((p) => p.id),
    ["trail-lines", "blank-canvas"],
  );
  assert.equal(query({ sort: "oldest" }).projects[0].id, "blank-canvas");
  assert.deepEqual(query({ sort: "invalid" }), query());
  assert.equal(
    readProjectCatalog(
      projectRegistry,
      events,
      { sort: "likes", category: "hardware" },
      counts,
    ).projects[0].id,
    "pocket-garden",
  );
  assert.equal(
    parseFilters(new URLSearchParams("sort=likes&page=2")).sort,
    "likes",
  );
  for (const value of [
    "https://example.com",
    "//example.com/projects",
    "/projects/idea-atlas",
    "/projects\\evil",
    "/login",
    "/projects#evil",
  ])
    assert.equal(safeProjectReturn(value), "/projects");
  assert.equal(
    safeProjectReturn("/projects?sort=likes&page=2"),
    "/projects?sort=likes&page=2",
  );
});

test("Project catalog sorts across page boundaries, preserves ties and never mutates configuration", () => {
  const original = JSON.stringify(projectRegistry);
  const first = query();
  const second = query({ page: "2" });
  assert.equal(first.total, 12);
  assert.equal(first.projects.length, 9);
  assert.equal(second.projects.length, 3);
  assert.equal(
    new Set([...first.projects, ...second.projects].map((p) => p.id)).size,
    12,
  );
  assert.deepEqual(
    first.projects.slice(0, 2).map((p) => p.id),
    ["idea-atlas", "pocket-garden"],
  );
  assert.deepEqual(
    second.projects.map((p) => p.id),
    ["blank-canvas", "neighborhood-kit", "trail-lines"],
  );
  assert.equal(JSON.stringify(projectRegistry), original);
});

test("Search is bilingual, trimmed and case insensitive, matching creator and all tags", () => {
  assert.equal(query({ q: "  IdEa ATLAS  " }).projects[0].id, "idea-atlas");
  assert.equal(query({ q: "灵感地图" }).projects[0].id, "idea-atlas");
  assert.equal(query({ q: "CREATIVE TOOLS" }).projects[0].id, "idea-atlas");
  assert.equal(query({ q: "好奇心工坊" }).total, 12);
  assert.equal(query({ q: "unseen island" }).projects[0].id, "echo-island");
  assert.equal(query({ q: "not a real project" }).total, 0);
});

test("Category/event intersections, independent projects and invalid filters are predictable", () => {
  assert.equal(
    query({ category: "hardware", event: "independent" }).projects[0].id,
    "pocket-garden",
  );
  assert.equal(query({ category: "hardware", event: "demo" }).total, 0);
  assert.equal(
    query({ q: "atlas", category: "software", event: "demo" }).total,
    1,
  );
  assert.equal(query({ category: "invalid" }).total, 0);
  assert.equal(query({ event: "private-event" }).total, 0);
  assert.equal(query({ event: "independent" }).total, 5);
  assert.equal(query().options.events.length, 3);
  assert.equal(query({ q: "none" }).options.events.length, 3);
});

test("Bad pages normalize, out-of-range pages stay empty and query parameters round trip", () => {
  for (const page of [
    "0",
    "-1",
    "1.5",
    "Infinity",
    "abc",
    "999999999999999999",
  ])
    assert.equal(query({ page }).page, 1);
  assert.equal(query({ page: "42" }).projects.length, 0);
  assert.equal(query({ page: "42" }).total, 12);
  const filters = {
    q: "  灵感 & ideas  ",
    event: "independent",
    category: "software",
    page: "2",
  };
  assert.deepEqual(
    parseFilters(new URLSearchParams(projectQuery(filters))),
    normalizeFilters(filters),
  );
});

test("Public projection excludes unpublished projects, hidden activities and private source fields", () => {
  const registry = structuredClone(projectRegistry);
  Object.assign(registry[0], {
    email: "private@example.com",
    internalNote: "SECRET",
    draft: { name: "PRIVATE" },
    storageName: "hidden.pdf",
  });
  registry[1].published = false;
  const result = readProjectCatalog(
    registry,
    events.filter((e) => e.id !== "past-demo"),
  );
  assert.equal(result.total, 9);
  assert.equal(
    result.options.events.some((e) => e.id === "past-demo"),
    false,
  );
  const serialized = JSON.stringify(result);
  for (const word of [
    "email",
    "private@example.com",
    "internalNote",
    "SECRET",
    "draft",
    "PRIVATE",
    "storageName",
    "hidden.pdf",
  ])
    assert.equal(serialized.includes(word), false);
  assert.deepEqual(
    Object.keys(result.projects[0]).sort(),
    [
      "id",
      "name",
      "introduction",
      "cover",
      "category",
      "tags",
      "creator",
      "eventId",
      "event",
      "publishedAt",
      "demo",
      "stats",
    ].sort(),
  );
  assert.ok(
    result.projects
      .filter((p) => p.event)
      .every((p) => p.event!.href === `/events/${p.eventId}`),
  );
});

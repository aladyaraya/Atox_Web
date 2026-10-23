import { test, expect } from "@playwright/test";

test("Production admin remains authenticated and exposes no initialization endpoint", async ({
  request,
}) => {
  for (const path of [
    "/admin",
    "/admin/administrators",
    "/admin/audit",
    "/admin/materials",
    "/admin/project-comments",
    "/admin/projects",
    "/admin/projects/idea-atlas/preview",
    "/admin/events",
    "/admin/content/homepage",
    "/admin/content/homepage/preview",
    "/admin/events/demo/preview",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(
      "/login?next=" + encodeURIComponent(path),
    );
  }
  for (const path of [
    "/api/admin/me",
    "/api/admin/administrators",
    "/api/admin/audit",
    "/api/admin/materials",
    "/api/admin/materials/review-policies/demo",
    "/api/admin/project-comments",
    "/api/admin/projects",
    "/api/account/projects",
    "/api/admin/content/events",
    "/api/admin/content/events/demo",
    "/api/admin/content/homepage",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  const grant = await request.post("/api/admin/administrators", {
    headers: { Origin: "http://127.0.0.1:3101" },
    data: { email: "visitor@example.com", role: "super_admin" },
  });
  expect(grant.status()).toBe(401);
  for (const [path, method] of [
    [
      "/api/admin/materials/00000000-0000-0000-0000-000000000000/revoke-approval",
      "POST",
    ],
    [
      "/api/admin/materials/00000000-0000-0000-0000-000000000000/coordination",
      "PATCH",
    ],
    ["/api/admin/materials/review-policies/demo", "PATCH"],
  ] as const) {
    const response = await request.fetch(path, {
      method,
      headers: { Origin: "http://127.0.0.1:3101" },
      data: {},
    });
    expect(response.status()).toBe(401);
  }
  expect(
    (await request.post("/api/admin/bootstrap", { data: {} })).status(),
  ).toBe(404);
  expect((await request.get("/")).status()).toBe(200);
});

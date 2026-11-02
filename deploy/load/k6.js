/* global __ENV, __VU, open */
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
const base = __ENV.LOAD_ORIGIN;
if (
  __ENV.OWNED_LOAD_TARGET_ACK !== "owned-isolated-staging" ||
  !/^https:\/\/[^/?#]+$/.test(base || "")
)
  throw new Error(
    "Explicit company-owned isolated HTTPS staging origin required",
  );
const fixtures = new SharedArray(
  "private fixtures",
  () =>
    JSON.parse(open(__ENV.LOAD_FIXTURE_FILE || "/fixtures/fixtures.json"))
      .users,
);
const eventId = __ENV.LOAD_EVENT_ID;
const event = JSON.parse(open(__ENV.LOAD_EVENT_FILE || "/fixtures/event.json"));
if (event.eventId !== eventId || !event.trackId)
  throw new Error("Fixture activity must match the explicit load activity");
const cover = open("/fixtures/upload.png", "b");
const document = open("/fixtures/document.pdf", "b");
const upload = open(__ENV.LOAD_UPLOAD_FILE || "/fixtures/upload.png", "b");
const documentUpload = __ENV.LOAD_UPLOAD_PURPOSE === "document";
if (!eventId) throw new Error("LOAD_EVENT_ID required");
export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "2m", target: 150 },
    { duration: "2m", target: 300 },
    { duration: "15m", target: 300 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    "http_req_duration{kind:ordinary}": ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
  discardResponseBodies: true,
};
function params(user, kind = "ordinary", json = false) {
  return {
    redirects: 0,
    tags: { kind },
    responseType: json ? "text" : "none",
    headers: {
      Origin: base,
      Cookie: "hackathon_session=" + user.cookie,
      ...(__ENV.LOAD_BASIC_TOKEN
        ? { Authorization: "Basic " + __ENV.LOAD_BASIC_TOKEN }
        : {}),
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
  };
}
let registered = false;
let assets = null;
function uploadAsset(user, purpose, data, filename, mime) {
  const response = http.post(
    base + "/api/events/" + encodeURIComponent(eventId) + "/files",
    { purpose, file: http.file(data, filename, mime) },
    { ...params(user, "upload"), responseType: "text" },
  );
  return check(response, { "private upload": (r) => r.status === 200 })
    ? response.json("id")
    : null;
}
export default function scenario() {
  const user = fixtures[(__VU - 1) % fixtures.length],
    mode = Math.random();
  const endpoint = base + "/api/events/" + encodeURIComponent(eventId);
  if (!registered) {
    registered = check(
      http.post(
        endpoint + "/registration",
        JSON.stringify({
          displayName: "Synthetic load " + __VU,
          role: "developer",
          country: "TEST",
          organization: "",
          contact: "",
          acceptedTerms: true,
        }),
        params(user, "ordinary", true),
      ),
      { registration: (r) => r.status === 200 },
    );
    if (!registered) {
      sleep(1);
      return;
    }
  }
  if (mode < 0.8) {
    const route = [
      "/",
      "/events",
      "/projects",
      "/api/projects",
      "/api/account/profile",
    ][Math.floor(Math.random() * 5)];
    check(http.get(base + route, params(user)), {
      "browse OK": (r) => r.status === 200,
    });
  } else if (mode < 0.95) {
    if (!assets) {
      const coverId = uploadAsset(
        user,
        "cover",
        cover,
        "synthetic.png",
        "image/png",
      );
      const documentId = uploadAsset(
        user,
        "document",
        document,
        "synthetic.pdf",
        "application/pdf",
      );
      if (!coverId || !documentId) {
        sleep(1);
        return;
      }
      assets = { coverId, documentId };
    }
    const current = http.get(
      endpoint + "/materials",
      params(user, "ordinary", true),
    );
    if (!check(current, { "materials read": (r) => r.status === 200 })) {
      sleep(1);
      return;
    }
    const revision = current.json("revision");
    const response = http.put(
      endpoint + "/materials/draft",
      JSON.stringify({
        revision,
        payload: {
          name: "Synthetic project " + __VU,
          tagline: "Synthetic load submission",
          description:
            "Isolated staging data. No real participant information.",
          trackId: event.trackId,
          ...assets,
          screenshotIds: [],
          videoUrl: "",
          experienceUrl: "",
          codeUrl: "",
          original: true,
          usageAuthorized: true,
          publicDisplay: false,
        },
      }),
      params(user, "ordinary", true),
    );
    if (check(response, { "draft saved": (r) => r.status === 200 })) {
      check(
        http.post(
          endpoint + "/materials/submit",
          JSON.stringify({ revision: response.json("revision") }),
          params(user, "ordinary", true),
        ),
        { "formal submission": (r) => r.status === 200 },
      );
    }
  } else {
    uploadAsset(
      user,
      documentUpload ? "document" : "cover",
      upload,
      documentUpload ? "synthetic.pdf" : "synthetic.png",
      documentUpload ? "application/pdf" : "image/png",
    );
  }
  sleep(1);
}

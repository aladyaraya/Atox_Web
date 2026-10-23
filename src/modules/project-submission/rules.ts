import type { ProjectInput } from "./contracts";
import { ProjectSubmissionError as E } from "./errors";
export const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function object(v: unknown, keys: string[]) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    throw new E("INVALID_INPUT");
}
export function revision(v: unknown): asserts v is number {
  if (!Number.isSafeInteger(v) || Number(v) < 0) throw new E("INVALID_INPUT");
}
export function text(v: unknown, max: number, required = false) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v) ||
    (required && !v.trim())
  )
    throw new E("INVALID_INPUT");
  return v.trim();
}
export function refs(input: ProjectInput | null | undefined) {
  return input
    ? [input.coverId, ...input.screenshotIds, input.documentId].filter(
        (v): v is string => Boolean(v),
      )
    : [];
}
function link(v: unknown) {
  const value = text(v, 2000);
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error();
    return url.href;
  } catch {
    throw new E("INVALID_LINK");
  }
}
export function validatePayload(
  input: ProjectInput,
  formal = false,
): ProjectInput {
  object(input, [
    "language",
    "name",
    "tagline",
    "description",
    "translation",
    "creator",
    "category",
    "eventId",
    "tags",
    "coverId",
    "screenshotIds",
    "documentId",
    "demoUrl",
    "videoUrl",
    "codeUrl",
    "original",
    "usageAuthorized",
    "publicConsent",
  ]);
  if (
    !["zh", "en"].includes(input.language) ||
    !["software", "hardware", "game", "aigc", "other"].includes(
      input.category,
    ) ||
    (input.eventId !== null &&
      (typeof input.eventId !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.eventId)))
  )
    throw new E("INVALID_INPUT");
  object(input.translation, ["name", "tagline", "description"]);
  if (
    !Array.isArray(input.tags) ||
    input.tags.length > 8 ||
    !Array.isArray(input.screenshotIds) ||
    input.screenshotIds.length > 6 ||
    input.screenshotIds.some((v) => !uuid(v)) ||
    new Set(input.screenshotIds).size !== input.screenshotIds.length
  )
    throw new E("INVALID_INPUT");
  if (
    (input.coverId !== null && !uuid(input.coverId)) ||
    (input.documentId !== null && !uuid(input.documentId))
  )
    throw new E("INVALID_INPUT");
  if (
    [input.original, input.usageAuthorized, input.publicConsent].some(
      (v) => typeof v !== "boolean",
    )
  )
    throw new E("INVALID_INPUT");
  const result: ProjectInput = {
    ...input,
    name: text(input.name, 100, formal),
    tagline: text(input.tagline, 200, formal),
    description: text(input.description, 20000, formal),
    creator: text(input.creator, 100, formal),
    translation: {
      name: text(input.translation.name, 100),
      tagline: text(input.translation.tagline, 200),
      description: text(input.translation.description, 20000),
    },
    tags: [...new Set(input.tags.map((v) => text(v, 30, true)))],
    demoUrl: link(input.demoUrl),
    videoUrl: link(input.videoUrl),
    codeUrl: link(input.codeUrl),
  };
  if (
    formal &&
    (!result.coverId ||
      !result.original ||
      !result.usageAuthorized ||
      !result.publicConsent)
  )
    throw new E("DECLARATIONS_REQUIRED");
  return result;
}
export const localized = (
  value: string,
  translation: string,
  language: "zh" | "en",
) =>
  language === "zh"
    ? { zh: value, en: translation || value }
    : { zh: translation || value, en: value };

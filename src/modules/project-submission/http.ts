import { json, readJson, withUser as authenticated } from "../admin/http";
import { getCurrentUser } from "../auth/server";
import type { AuthUser } from "../auth/contracts";
import { ProjectSubmissionError as E } from "./errors";
import { readProjectFile, uploadProjectFile } from "./files";
export { json, readJson };
export function withUser(
  request: Request,
  mutate: boolean,
  operation: (user: AuthUser) => Promise<Response>,
) {
  return authenticated(request, mutate, async (user) => {
    try {
      return await operation(user);
    } catch (error) {
      if (error instanceof E) return json({ error: error.code }, error.status);
      throw error;
    }
  });
}
export async function upload(request: Request, user: AuthUser, id: string) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 21 * 1024 * 1024))
    throw new E("INVALID_FILE");
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw new E("INVALID_FILE");
  // Bound streaming before FormData parsing, including chunked requests.
  if (!request.body) throw new E("INVALID_FILE");
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 21 * 1024 * 1024) {
        await reader.cancel();
        throw new E("INVALID_FILE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new E("INVALID_FILE");
  }
  const file = form.get("file"),
    purpose = form.get("purpose");
  if (
    !(file instanceof File) ||
    typeof purpose !== "string" ||
    form.getAll("file").length !== 1 ||
    form.getAll("purpose").length !== 1 ||
    [...form.keys()].some((k) => !["file", "purpose"].includes(k))
  )
    throw new E("INVALID_FILE");
  return json(
    await uploadProjectFile(
      user,
      id,
      purpose,
      Buffer.from(await file.arrayBuffer()),
      file.name,
    ),
  );
}
export async function fileResponse(id: string) {
  try {
    const { asset, buffer } = await readProjectFile(await getCurrentUser(), id);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": asset.mediaType,
        "Content-Disposition": `${asset.purpose === "document" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(asset.name).replace(/'/g, "%27")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof E) return json({ error: error.code }, error.status);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
}

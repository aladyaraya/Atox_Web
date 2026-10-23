import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
export async function normalizeUpload(
  purpose: "cover" | "screenshot" | "document",
  buffer: Buffer,
  limits: { imageMaxBytes: number; documentMaxBytes: number },
) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0)
    throw new Error("INVALID_FILE");
  const max =
    purpose === "document" ? limits.documentMaxBytes : limits.imageMaxBytes;
  if (buffer.length > max) throw new Error("INVALID_FILE");
  try {
    if (purpose === "document") {
      if (
        !/^%PDF-(?:1\.[0-7]|2\.0)/.test(
          buffer.subarray(0, 8).toString("ascii"),
        ) ||
        !/%%EOF\s*$/.test(buffer.subarray(-1024).toString("latin1"))
      )
        throw new Error();
      const pdf = await PDFDocument.load(buffer, {
        ignoreEncryption: false,
        updateMetadata: false,
        throwOnInvalidObject: true,
      });
      if (pdf.isEncrypted || pdf.getPageCount() < 1) throw new Error();
      // Resolve page dictionaries as well as the cross-reference/object structure.
      for (const page of pdf.getPages()) {
        const size = page.getSize();
        if (
          !Number.isFinite(size.width) ||
          !Number.isFinite(size.height) ||
          size.width <= 0 ||
          size.height <= 0
        )
          throw new Error();
      }
      return { buffer, extension: "pdf", mediaType: "application/pdf" };
    }
    const image = sharp(buffer, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
      animated: false,
    });
    const metadata = await image.metadata();
    if (
      !metadata.format ||
      !["png", "jpeg", "webp"].includes(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 16384 ||
      metadata.height > 16384 ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error();
    const extension = metadata.format as "png" | "jpeg" | "webp";
    // Decode and re-encode to reject corrupt images and remove unrelated metadata/payload.
    const normalized = await image.rotate().toFormat(extension).toBuffer();
    if (normalized.length > max) throw new Error();
    return { buffer: normalized, extension, mediaType: `image/${extension}` };
  } catch {
    throw new Error("INVALID_FILE");
  }
}

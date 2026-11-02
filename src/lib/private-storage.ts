import path from "node:path";
import {
  mkdir,
  readFile,
  writeFile,
  unlink,
  readdir,
  stat,
} from "node:fs/promises";
import OSS from "ali-oss";

type Area = "events" | "projects";
export function objectStorageConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.STORAGE_DRIVER !== "oss") return null;
  const region = env.OSS_REGION,
    bucket = env.OSS_BUCKET,
    prefix = env.OSS_PREFIX;
  if (
    !region ||
    !/^oss-[a-z0-9-]+$/.test(region) ||
    !bucket ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !prefix ||
    !/^[a-zA-Z0-9_-]+\/$/.test(prefix) ||
    !env.OSS_ACCESS_KEY_ID ||
    !env.OSS_ACCESS_KEY_SECRET
  )
    throw new Error("Private object storage configuration is incomplete");
  return {
    region,
    bucket,
    prefix,
    accessKeyId: env.OSS_ACCESS_KEY_ID,
    accessKeySecret: env.OSS_ACCESS_KEY_SECRET,
  };
}
function name(value: string) {
  if (!/^[a-f0-9-]{36}\.(png|jpeg|webp|pdf)$/.test(value))
    throw new Error("Invalid private object name");
  return value;
}
function directory(area: Area) {
  const root = path.resolve(
    /* turbopackIgnore: true */ process.env.UPLOAD_PATH || ".data/uploads",
  );
  const relative = path.relative(path.resolve("public"), root);
  if (!relative || (!relative.startsWith("..") && !path.isAbsolute(relative)))
    throw new Error("UPLOAD_PATH must be outside public");
  return area === "projects" ? path.join(root, "project-submissions") : root;
}
function backend() {
  if (
    process.env.STORAGE_DRIVER &&
    !["local", "oss"].includes(process.env.STORAGE_DRIVER)
  )
    throw new Error("Unknown storage driver");
  const config = objectStorageConfig();
  if (!config && process.env.DEPLOYMENT_MODE === "production")
    throw new Error("Released websites require private object storage");
  return config
    ? { client: new OSS({ ...config, secure: true, timeout: 20000 }), config }
    : null;
}
function key(prefix: string, area: Area, filename: string) {
  return `${prefix}${area}/${name(filename)}`;
}
export async function putPrivateFile(
  area: Area,
  filename: string,
  buffer: Buffer,
) {
  name(filename);
  const remote = backend();
  if (remote) {
    try {
      await remote.client.put(
        key(remote.config.prefix, area, filename),
        buffer,
        {
          headers: {
            "x-oss-object-acl": "private",
            "x-oss-forbid-overwrite": "true",
            "Cache-Control": "private, no-store",
          },
        },
      );
    } catch {
      throw new Error("Private object upload failed");
    }
    return;
  }
  await mkdir(directory(area), { recursive: true });
  await writeFile(path.join(directory(area), filename), buffer, {
    flag: "wx",
    mode: 0o600,
  });
}
export async function readPrivateFile(
  area: Area,
  filename: string,
): Promise<Buffer> {
  name(filename);
  const remote = backend();
  if (remote) {
    try {
      const result = await remote.client.get(
        key(remote.config.prefix, area, filename),
      );
      return Buffer.from(result.content);
    } catch {
      throw new Error("Private object is unavailable");
    }
  }
  return readFile(path.join(directory(area), filename));
}
export async function removePrivateFile(area: Area, filename: string) {
  name(filename);
  // OSS objects are immutable and retained for backup recovery. Metadata/API
  // authorization revokes access immediately. Physical purge is a separate,
  // reviewed operation after the backup retention window, never this helper.
  if (backend()) return;
  await unlink(path.join(directory(area), filename));
}
export async function listPrivateFiles(
  area: Area,
): Promise<Array<{ name: string; modifiedAt: Date }>> {
  const remote = backend();
  if (remote) {
    const result: Array<{ name: string; modifiedAt: Date }> = [];
    let continuationToken: string | undefined;
    do {
      const prefix = remote.config.prefix + area + "/";
      const page = await remote.client.listV2(
        {
          prefix,
          "max-keys": 1000,
          ...(continuationToken
            ? { "continuation-token": continuationToken }
            : {}),
        },
        {},
      );
      for (const object of page.objects ?? []) {
        const filename = object.name.slice(prefix.length);
        if (/^[a-f0-9-]{36}\.(png|jpeg|webp|pdf)$/.test(filename))
          result.push({
            name: filename,
            modifiedAt: new Date(object.lastModified),
          });
      }
      continuationToken = page.isTruncated
        ? page.nextContinuationToken
        : undefined;
    } while (continuationToken);
    return result;
  }
  const files = await readdir(directory(area)).catch((error) => {
    if (error.code === "ENOENT") return [] as string[];
    throw error;
  });
  const result = [];
  for (const filename of files)
    if (/^[a-f0-9-]{36}\.(png|jpeg|webp|pdf)$/.test(filename)) {
      const info = await stat(path.join(directory(area), filename));
      if (info.isFile())
        result.push({ name: filename, modifiedAt: info.mtime });
    }
  return result;
}

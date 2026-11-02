import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const profile = pkg.portalProfile;
if (!["core", "preview-ticketing", "preview-oidc"].includes(profile))
  throw new Error("Unknown portal profile");
function hasFiles(directory) {
  if (!existsSync(directory)) return false;
  return readdirSync(directory, { withFileTypes: true }).some((entry) =>
    entry.isDirectory() ? hasFiles(path.join(directory, entry.name)) : true,
  );
}
const excluded = [];
if (profile !== "preview-ticketing")
  excluded.push(
    "src/modules/ticketing",
    "src/app/preview/ticketing",
    "src/app/api/preview/ticketing",
  );
if (profile !== "preview-oidc")
  excluded.push(
    "src/modules/auth/oidc",
    "src/app/api/auth/oidc",
    "src/app/auth/oidc",
    "labs/logto-oidc",
    "src/app/account/security",
    "src/app/api/account/identity",
  );
for (const directory of excluded)
  if (hasFiles(directory))
    throw new Error("Unexpected module runtime: " + directory);
if (profile !== "preview-oidc" && pkg.dependencies?.["@logto/node"])
  throw new Error("OIDC SDK is not a core dependency");
if (
  profile === "core" &&
  ["pg", "ali-oss"].some((name) => pkg.dependencies?.[name])
)
  throw new Error("Production adapters belong to the deferred branch");
console.log(
  "Module boundaries passed: " +
    profile +
    "; historical table metadata is compatibility-only.",
);

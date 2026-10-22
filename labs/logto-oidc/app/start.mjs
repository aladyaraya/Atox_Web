import { readFile } from "node:fs/promises";
import {
  apps,
  clientsFile,
  loadLabEnv,
  enabled,
  getConfig,
} from "./config.mjs";
import { createLabApp } from "./server.mjs";
loadLabEnv();
const id = process.argv[2];
if (!Object.hasOwn(apps, id)) throw new Error("Choose a or b.");
const config = enabled()
  ? getConfig(id, JSON.parse(await readFile(clientsFile, "utf8")))
  : null;
const server = createLabApp(config).listen(apps[id].port, "127.0.0.1", () => {
  console.log(
    `M013 App ${id}: ${apps[id].origin} (${config ? "local test only" : "disabled: all routes 404"})`,
  );
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());

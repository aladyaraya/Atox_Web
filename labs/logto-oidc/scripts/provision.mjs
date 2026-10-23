import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  labRoot,
  clientsFile,
  issuerEndpoint,
  apps,
  loadLabEnv,
  requireLab,
} from "../app/config.mjs";
loadLabEnv();
requireLab();
const bootstrapSecret = process.env.LOGTO_LAB_BOOTSTRAP_SECRET;
if (!/^[a-f0-9]{64}$/.test(bootstrapSecret ?? ""))
  throw new Error("Run init first.");

// Bootstrap ONLY the fixed, separate Compose PostgreSQL service/database.
// This is deliberately not a reusable arbitrary-DB SQL utility or migration.
function labSql(input) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--env-file",
      ".env.lab",
      "-f",
      "compose.yaml",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "m013_lab",
      "-d",
      "m013_logto_lab",
      "-tA",
    ],
    { cwd: labRoot, input, encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      "Isolated lab PostgreSQL operation failed; no website DB was accessed.",
    );
  return result.stdout.trim();
}
if (labSql("SELECT current_database();") !== "m013_logto_lab")
  throw new Error("Wrong lab database.");
const bootstrapId = "m013-bootstrap";
labSql(`BEGIN;
INSERT INTO applications (tenant_id,id,name,secret,type,oidc_client_metadata)
VALUES ('default','${bootstrapId}','M013 isolated bootstrap','${bootstrapSecret}','MachineToMachine','{"redirectUris":[],"postLogoutRedirectUris":[]}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO application_secrets (tenant_id,application_id,name,value)
VALUES ('default','${bootstrapId}','M013 local bootstrap','${bootstrapSecret}') ON CONFLICT DO NOTHING;
INSERT INTO applications_roles (tenant_id,id,application_id,role_id)
SELECT 'default','m013-bootstrap-role','${bootstrapId}',id FROM roles
WHERE tenant_id='default' AND name='Logto Management API access' AND type='MachineToMachine'
ON CONFLICT DO NOTHING;
COMMIT;`);
let token;
try {
  const response = await fetch(issuerEndpoint + "/oidc/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(bootstrapId + ":" + bootstrapSecret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      resource: "https://default.logto.app/api",
      scope: "all",
    }),
  });
  if (!response.ok)
    throw new Error(
      "Isolated Management API bootstrap authentication failed: " +
        response.status,
    );
  token = (await response.json()).access_token;
  async function api(route, method = "GET", body) {
    const r = await fetch(issuerEndpoint + "/api" + route, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!r.ok) {
      const error = await r.json().catch(() => ({}));
      throw new Error(
        `Logto Management API ${method} ${route}: ${r.status} ${error.code ?? ""}`,
      );
    }
    return r.status === 204 ? null : r.json();
  }
  let clients;
  try {
    clients = JSON.parse(await readFile(clientsFile, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!clients) {
    // Never search or link users by email. These are new, unrelated lab clients.
    clients = {};
    for (const [id, config] of Object.entries(apps)) {
      const created = await api("/applications", "POST", {
        name: `M013 isolated App ${id.toUpperCase()}`,
        type: "Traditional",
        oidcClientMetadata: {
          redirectUris: [config.origin + "/callback"],
          postLogoutRedirectUris: [config.origin + "/"],
        },
      });
      const secret = await api(`/applications/${created.id}/secrets`, "POST", {
        name: "M013 local test",
      });
      clients[id] = { appId: created.id, appSecret: secret.value };
    }
    await mkdir(path.dirname(clientsFile), { recursive: true });
    await writeFile(clientsFile, JSON.stringify(clients, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
  }
  for (const [id, config] of Object.entries(apps)) {
    const client = await api("/applications/" + clients[id].appId);
    if (
      client.type !== "Traditional" ||
      JSON.stringify(client.oidcClientMetadata.redirectUris) !==
        JSON.stringify([config.origin + "/callback"])
    )
      throw new Error(
        "Existing local client does not match its exact callback contract.",
      );
  }
  const connectors = await api("/connectors");
  const smtp = connectors.find(
    (c) => c.connectorId === "simple-mail-transfer-protocol",
  );
  const body = {
    connectorId: "simple-mail-transfer-protocol",
    config: {
      host: "mailpit",
      port: 1025,
      secure: false,
      ignoreTLS: true,
      auth: { user: "m013-lab", pass: "local-sink-only" },
      fromEmail: "M013 LOCAL TEST <no-reply@m013.example.test>",
      templates: ["Register", "SignIn", "ForgotPassword", "Generic"].map(
        (usageType) => ({
          usageType,
          subject: "M013 LOCAL TEST · " + usageType,
          contentType: "text/plain",
          content:
            "LOCAL LAB ONLY. Code: {{code}}. Not proof of real mailbox ownership.",
        }),
      ),
      disableFileAccess: true,
      disableUrlAccess: true,
    },
  };
  await api(
    "/connectors" + (smtp ? "/" + smtp.id : ""),
    smtp ? "PATCH" : "POST",
    smtp ? { config: body.config } : body,
  );
  await api("/sign-in-exp", "PATCH", {
    signInMode: "SignInAndRegister",
    signUp: { identifiers: ["email"], password: false, verify: true },
    signIn: {
      methods: [
        {
          identifier: "email",
          password: false,
          verificationCode: true,
          isPasswordPrimary: false,
        },
      ],
    },
    socialSignInConnectorTargets: [],
    languageInfo: { autoDetect: false, fallbackLanguage: "en" },
    branding: {},
  });
  console.log(
    "Provisioned separate A/B clients and email-only verification to local Mailpit. No real mailbox ownership established.",
  );
} finally {
  // No standing bootstrap Management API principal is left in the lab.
  labSql(
    "DELETE FROM applications WHERE tenant_id='default' AND id='m013-bootstrap';",
  );
}

import {readFile,mkdir,writeFile} from "node:fs/promises";
import {randomBytes} from "node:crypto";
import {spawnSync} from "node:child_process";
import path from "node:path";
const folder=path.resolve(".data/deploy-config-ci");await mkdir(folder,{recursive:true});
const keys=["RELEASE_ID","AUTH_SECRET","DB_BOOTSTRAP_PASSWORD","APP_DB_PASSWORD","MIGRATOR_DB_PASSWORD","BACKUP_ENCRYPTION_KEY","STAGING_PASSWORD_HASH","SMTP_PASSWORD","OSS_ACCESS_KEY_ID","OSS_ACCESS_KEY_SECRET","BACKUP_ACCESS_KEY_ID","BACKUP_ACCESS_KEY_SECRET"];
let contents=await readFile("deploy/.env.example","utf8");for(const key of keys)contents=contents.replace(new RegExp("^"+key+"=.*$","m"),key+"="+randomBytes(32).toString("hex"));
contents=contents.replace(/^OSS_BUCKET=.*$/m,"OSS_BUCKET=atox-ci-private").replace(/^BACKUP_BUCKET=.*$/m,"BACKUP_BUCKET=atox-ci-backup");
const filename=path.join(folder,"compose.env");await writeFile(filename,contents,{mode:0o600});
const checked=spawnSync("docker",["compose","--env-file",filename,"-f","deploy/compose.yaml","config","--quiet"],{stdio:"pipe"});
if(checked.error||checked.status!==0){console.error("Compose schema/interpolation check failed; environment values withheld.");process.exitCode=1;}
else console.log("Compose validated using generated isolated credentials only.");

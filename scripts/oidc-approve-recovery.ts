import { userInfo } from "node:os";
import { closeDb } from "../src/lib/db";
import { approveIdentityRecovery } from "../src/modules/auth/oidc/service";
// Stop the website before running: PGlite is a single-process database.
const args = process.argv.slice(2);
function arg(key: string) {
  const at = args.indexOf(key);
  return at >= 0 ? args[at + 1] : undefined;
}
try {
  const flowId = arg("--request"),
    userId = arg("--user"),
    caseId = arg("--case"),
    evidenceRef = arg("--evidence");
  if (
    !flowId ||
    !userId ||
    !caseId ||
    !evidenceRef ||
    !args.includes("--acknowledge-reviewed-evidence")
  )
    throw new Error();
  await approveIdentityRecovery({
    flowId,
    userId,
    caseId,
    evidenceRef,
    reviewedBy: userInfo().username,
    acknowledgeReviewedEvidence: true,
  });
  console.log(
    "One-time approval recorded. Restart the website, refresh status and explicitly confirm in the requesting browser. No identity has been linked yet.",
  );
} catch {
  console.error(
    "Approval refused. Required: stopped website, configured OIDC environment, exact --request UUID --user UUID --case reference --evidence independent-proof-reference --acknowledge-reviewed-evidence. Development email/session is not ownership proof. No automatic linking or privilege changes.",
  );
  process.exitCode = 1;
} finally {
  await closeDb();
}

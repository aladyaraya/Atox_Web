import type { AuthUser } from "../../src/modules/auth/contracts";
import {
  getReviewPolicy,
  setReviewPolicy,
} from "../../src/modules/material-review/policy";
/** Explicit test-only setup. Production migration never creates an open policy. */
export async function openFixtureReview(user: AuthUser, eventId = "demo") {
  const { policy } = await getReviewPolicy(user, eventId);
  return setReviewPolicy(user, eventId, {
    revision: policy.revision,
    enabled: true,
    opensAt: "2020-01-01T00:00:00Z",
    closesAt: "2099-01-01T00:00:00Z",
    reason: "Isolated automated test fixture; not a business schedule",
  });
}

import type {
  RegistrationDto,
  MaterialPayload,
  AssetDto,
} from "../event-participation/contracts";
import type { AdminActor } from "../admin/contracts";
import type { AdminPage } from "../admin/contracts";
export type ReviewPolicyState =
  "unconfigured" | "not_started" | "open" | "paused" | "closed";
export type ReviewMode = "event" | "unlimited" | "custom";
export interface ReviewPolicy {
  mode: ReviewMode;
  /** Browser receipt timestamp; never an authorization input. */
  clientReceivedAt?: number;
  eventId: string;
  enabled: boolean;
  opensAt: string | null;
  closesAt: string | null;
  revision: number;
  updatedAt: string | null;
  updatedBy: string | null;
  timeZone: string;
  state: ReviewPolicyState;
  serverNow: string;
}
export interface ReviewPolicyInput {
  /** Omission preserves the original custom-window API contract. */
  mode?: ReviewMode;
  revision: number;
  enabled: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
  reason: string;
}
export interface ReviewEventOption {
  id: string;
  name: { zh: string; en: string };
  tracks: { id: string; name: { zh: string; en: string } }[];
  reviewPolicy: ReviewPolicy;
}
export type ReviewStatus = "pending" | "approved" | "rejected";
export interface MaterialReviewItem {
  id: string;
  eventId: string;
  eventName: { zh: string; en: string };
  projectName: string;
  participantName: string;
  tagline: string;
  trackId: string;
  trackName: { zh: string; en: string };
  coordinationRequired: boolean;
  coordinationSubmittedRevision: number | null;
  recentAction: { actor: AdminActor; createdAt: string; action: string } | null;
  reviewPolicy: ReviewPolicy;
  status: ReviewStatus;
  revision: number;
  submittedRevision: number;
  submittedAt: string | null;
  processedAt: string | null;
  reason: string | null;
}
export interface MaterialReviewSnapshot {
  revision: number;
  submittedRevision: number;
  status: ReviewStatus;
  reason: string | null;
  internalNote: string | null;
  coordinationRequired?: boolean;
  coordinationSubmittedRevision?: number | null;
  reviewNotice?: "approval_revoked" | null;
}
export interface MaterialReviewHistory extends MaterialReviewSnapshot {
  id: string;
  action: string;
  actor: AdminActor;
  before: MaterialReviewSnapshot | null;
  after: MaterialReviewSnapshot;
  createdAt: string;
}
export interface MaterialReviewDetail extends MaterialReviewItem {
  registration: RegistrationDto;
  official: MaterialPayload;
  internalNote: string | null;
  assets: AssetDto[];
  history: MaterialReviewHistory[];
  reviewNotice: "approval_revoked" | null;
  canDecide: boolean;
  canRevoke: boolean;
  canAnnotate: boolean;
  readOnlyReason: Exclude<ReviewPolicyState, "open"> | null;
}
export interface ReviewFilters {
  page?: number;
  eventId?: string;
  status?: ReviewStatus;
  q?: string;
  trackId?: string;
  coordination?: "required" | "none";
  sort?: "newest" | "oldest";
}
export interface MaterialReviewList extends AdminPage<MaterialReviewItem> {
  statistics: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    coordination: number;
  };
  events: ReviewEventOption[];
  serverNow: string;
}
export interface RevokeApprovalInput {
  revision: number;
  submittedRevision: number;
  reason: string;
  internalNote?: string;
}
export interface CoordinationInput {
  revision: number;
  submittedRevision: number;
  coordinationRequired: boolean;
  internalNote: string;
}
export interface DecisionInput {
  revision: number;
  submittedRevision: number;
  action: "approved" | "rejected";
  reason: string;
  internalNote?: string;
}

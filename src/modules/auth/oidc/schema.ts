import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import { users, sessions } from "../schema";
import type { FlowStatus, OidcTrust } from "./contracts";
const date = (n: string) => timestamp(n, { withTimezone: true, mode: "date" });
export const externalIdentities = pgTable(
  "external_identities",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    trust: text("trust").$type<OidcTrust>().notNull(),
    createdAt: date("created_at").notNull(),
    lastAuthenticatedAt: date("last_authenticated_at").notNull(),
  },
  (t) => [
    uniqueIndex("external_identity_subject").on(t.issuer, t.subject),
    uniqueIndex("external_identity_user_issuer").on(t.userId, t.issuer),
    check(
      "external_identity_trust",
      sql`${t.trust} in ('local-sandbox','verified-email')`,
    ),
  ],
);
export const oidcFlows = pgTable(
  "oidc_flows",
  {
    id: uuid("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    purpose: text("purpose").$type<"login" | "link">().notNull(),
    status: text("status").$type<FlowStatus>().notNull(),
    fingerprint: text("fingerprint").notNull(),
    ipHash: text("ip_hash").notNull(),
    returnTo: text("return_to").notNull(),
    nonce: text("nonce").notNull(),
    stateHash: text("state_hash").notNull(),
    sdkCipher: text("sdk_cipher"),
    identityCipher: text("identity_cipher"),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    initiatorHash: text("initiator_hash"),
    expectedSubject: text("expected_subject"),
    receiptCipher: text("receipt_cipher"),
    createdAt: date("created_at").notNull(),
    expiresAt: date("expires_at").notNull(),
  },
  (t) => [
    index("oidc_flows_rate").on(t.ipHash, t.createdAt),
    check("oidc_flow_purpose", sql`${t.purpose} in ('login','link')`),
    check(
      "oidc_flow_status",
      sql`${t.status} in ('authorizing','exchanging','needs_link','awaiting_approval','completed','failed','cancelled')`,
    ),
  ],
);
export const identityRecoveryApprovals = pgTable(
  "identity_recovery_approvals",
  {
    id: uuid("id").primaryKey(),
    flowId: uuid("flow_id")
      .notNull()
      .unique()
      .references(() => oidcFlows.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    caseId: text("case_id").notNull(),
    evidenceRef: text("evidence_ref").notNull(),
    reviewedBy: text("reviewed_by").notNull(),
    createdAt: date("created_at").notNull(),
    expiresAt: date("expires_at").notNull(),
    usedAt: date("used_at"),
  },
);
export const oidcSessionContexts = pgTable("oidc_session_contexts", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => sessions.id, { onDelete: "cascade" }),
  identityId: uuid("identity_id")
    .notNull()
    .references(() => externalIdentities.id, { onDelete: "restrict" }),
  fingerprint: text("fingerprint").notNull(),
  idTokenCipher: text("id_token_cipher").notNull(),
});
export const identityAudit = pgTable(
  "identity_audit",
  {
    id: uuid("id").primaryKey(),
    action: text("action").notNull(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    flowId: uuid("flow_id"),
    detail: text("detail").notNull(),
    createdAt: date("created_at").notNull(),
  },
  (t) => [index("identity_audit_user").on(t.userId, t.createdAt)],
);

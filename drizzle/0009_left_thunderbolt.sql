CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"trust" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_authenticated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "external_identity_trust" CHECK ("external_identities"."trust" in ('local-sandbox','verified-email'))
);
--> statement-breakpoint
CREATE TABLE "identity_audit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"user_id" uuid,
	"flow_id" uuid,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_recovery_approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flow_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"case_id" text NOT NULL,
	"evidence_ref" text NOT NULL,
	"reviewed_by" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "identity_recovery_approvals_flow_id_unique" UNIQUE("flow_id")
);
--> statement-breakpoint
CREATE TABLE "oidc_flows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text NOT NULL,
	"fingerprint" text NOT NULL,
	"ip_hash" text NOT NULL,
	"return_to" text NOT NULL,
	"nonce" text NOT NULL,
	"state_hash" text NOT NULL,
	"sdk_cipher" text,
	"identity_cipher" text,
	"target_user_id" uuid,
	"initiator_hash" text,
	"expected_subject" text,
	"receipt_cipher" text,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "oidc_flows_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "oidc_flow_purpose" CHECK ("oidc_flows"."purpose" in ('login','link')),
	CONSTRAINT "oidc_flow_status" CHECK ("oidc_flows"."status" in ('authorizing','exchanging','needs_link','awaiting_approval','completed','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "oidc_session_contexts" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"identity_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"id_token_cipher" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_audit" ADD CONSTRAINT "identity_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_recovery_approvals" ADD CONSTRAINT "identity_recovery_approvals_flow_id_oidc_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."oidc_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_recovery_approvals" ADD CONSTRAINT "identity_recovery_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_flows" ADD CONSTRAINT "oidc_flows_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_session_contexts" ADD CONSTRAINT "oidc_session_contexts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_session_contexts" ADD CONSTRAINT "oidc_session_contexts_identity_id_external_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."external_identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_subject" ON "external_identities" USING btree ("issuer","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "external_identity_user_issuer" ON "external_identities" USING btree ("user_id","issuer");--> statement-breakpoint
CREATE INDEX "identity_audit_user" ON "identity_audit" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "oidc_flows_rate" ON "oidc_flows" USING btree ("ip_hash","created_at");
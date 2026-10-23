CREATE TABLE "material_review_policies" (
	"event_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "material_review_policy_period_valid" CHECK ("material_review_policies"."opens_at" < "material_review_policies"."closes_at"),
	CONSTRAINT "material_review_policy_revision_positive" CHECK ("material_review_policies"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "event_materials" ADD COLUMN "coordination_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_materials" ADD COLUMN "coordination_submitted_revision" integer;--> statement-breakpoint
ALTER TABLE "event_materials" ADD COLUMN "review_notice" text;--> statement-breakpoint
ALTER TABLE "material_review_policies" ADD CONSTRAINT "material_review_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_materials_event_submitted_idx" ON "event_materials" USING btree ("event_id","submitted_at","id");
CREATE TABLE "account_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_profile_revision" CHECK ("account_profiles"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text,
	"body_hash" text NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "project_comments_status" CHECK ("project_comments"."status" IN ('visible','hidden','deleted')),
	CONSTRAINT "project_comments_revision" CHECK ("project_comments"."revision" > 0),
	CONSTRAINT "project_comments_deleted_body" CHECK (("project_comments"."status" = 'deleted' AND "project_comments"."body" IS NULL) OR ("project_comments"."status" != 'deleted' AND "project_comments"."body" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "project_likes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_profiles" ADD CONSTRAINT "account_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_likes" ADD CONSTRAINT "project_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_comments_request" ON "project_comments" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "project_comments_list" ON "project_comments" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "project_comments_account_rate" ON "project_comments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_likes_project_user" ON "project_likes" USING btree ("project_id","user_id");
CREATE TYPE "public"."dashboard_invitation_status" AS ENUM('pending', 'revoked', 'accepted', 'expired');--> statement-breakpoint
CREATE TABLE "dashboard_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"host_id" text NOT NULL,
	"host_username" text NOT NULL,
	"host_shell" text,
	"host_groups" jsonb,
	"token_digest" text NOT NULL,
	"status" "dashboard_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_by_user_id" text NOT NULL,
	"accepted_by_user_id" text,
	"accepted_at" bigint,
	"revoked_at" bigint,
	"last_error" text,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "dashboard_invitations_token_digest_unique" UNIQUE("token_digest")
);
--> statement-breakpoint
CREATE INDEX "dashboard_invitations_host_id_index" ON "dashboard_invitations" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "dashboard_invitations_email_index" ON "dashboard_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "dashboard_invitations_status_expires_at_index" ON "dashboard_invitations" USING btree ("status","expires_at");
CREATE TABLE "host_user_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"host_id" text NOT NULL,
	"host_username" text NOT NULL,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	"updated_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
CREATE INDEX "host_user_mappings_user_id_index" ON "host_user_mappings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "host_user_mappings_host_id_index" ON "host_user_mappings" USING btree ("host_id");
CREATE TYPE "public"."tetra_enrollment_status" AS ENUM('pending', 'approved', 'denied', 'expired');
--> statement-breakpoint
CREATE TABLE "tetra_enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code" text NOT NULL,
	"display_name" text NOT NULL,
	"hostname" text,
	"agent_url" text NOT NULL,
	"host_public_key" text NOT NULL,
	"tls_ca_certificate" text,
	"status" "tetra_enrollment_status" DEFAULT 'pending' NOT NULL,
	"controller_public_key" text,
	"controller_private_key_encrypted" text,
	"host_id" text,
	"expires_at" bigint NOT NULL,
	"approved_at" bigint,
	"created_at" bigint DEFAULT (extract(epoch from now()) * 1000)::bigint NOT NULL,
	CONSTRAINT "tetra_enrollments_device_code_hash_unique" UNIQUE("device_code_hash"),
	CONSTRAINT "tetra_enrollments_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE INDEX "tetra_enrollments_status_index" ON "tetra_enrollments" USING btree ("status");

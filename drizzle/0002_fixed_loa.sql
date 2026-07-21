ALTER TABLE "managed_hosts" ADD COLUMN "controller_key_id" text;--> statement-breakpoint
ALTER TABLE "managed_hosts" ADD COLUMN "controller_public_key" text;--> statement-breakpoint
ALTER TABLE "managed_hosts" ADD COLUMN "controller_private_key_encrypted" text;
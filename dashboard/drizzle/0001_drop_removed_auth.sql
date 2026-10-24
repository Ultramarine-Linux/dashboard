DROP TABLE `dashboard_invitations`;--> statement-breakpoint
DROP TABLE `host_user_mappings`;--> statement-breakpoint
DROP TABLE `managed_hosts`;--> statement-breakpoint
DROP TABLE `server_setup`;--> statement-breakpoint
DROP TABLE `passkey`;--> statement-breakpoint
DROP TABLE `two_factor`;--> statement-breakpoint
ALTER TABLE `session` DROP COLUMN `impersonated_by`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `role`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `banned`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `ban_reason`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `ban_expires`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `two_factor_enabled`;--> statement-breakpoint
ALTER TABLE `user` DROP COLUMN `is_admin`;
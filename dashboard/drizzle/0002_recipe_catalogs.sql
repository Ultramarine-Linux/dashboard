CREATE TABLE `recipe_catalogs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_catalogs_url_unique` ON `recipe_catalogs` (`url`);
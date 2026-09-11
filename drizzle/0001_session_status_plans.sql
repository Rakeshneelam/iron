CREATE TABLE `session_exercise` (
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`source` text NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`target_sets` integer,
	`rep_lo` integer,
	`rep_hi` integer,
	`target_rir` integer,
	`rest_seconds` integer,
	`superset_group` text,
	`start_weight` real,
	PRIMARY KEY(`session_id`, `exercise_id`),
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `routine` ADD `archived_at` text;--> statement-breakpoint
ALTER TABLE `routine_slot` ADD `start_weight` real;--> statement-breakpoint
ALTER TABLE `session` ADD `status` text DEFAULT 'completed' NOT NULL;--> statement-breakpoint
UPDATE `session` SET `status` = 'active' WHERE `ended_at` IS NULL;
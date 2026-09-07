CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`value_kg` real NOT NULL,
	`count` integer DEFAULT 2 NOT NULL,
	`machine_name` text
);
--> statement-breakpoint
CREATE TABLE `exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`load_type` text NOT NULL,
	`load_step` real DEFAULT 2.5 NOT NULL,
	`primary_muscles` text NOT NULL,
	`secondary_muscles` text,
	`is_unilateral` integer DEFAULT 0 NOT NULL,
	`is_custom` integer DEFAULT 0 NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE TABLE `exercise_link` (
	`id` text PRIMARY KEY NOT NULL,
	`from_exercise_id` text NOT NULL,
	`to_exercise_id` text NOT NULL,
	`ratio` real DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`from_exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercise_session_stat` (
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`best_e1rm` real NOT NULL,
	`tonnage` real NOT NULL,
	`hard_sets` integer NOT NULL,
	`top_weight` real NOT NULL,
	`date` text NOT NULL,
	PRIMARY KEY(`session_id`, `exercise_id`),
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_stat_ex_date` ON `exercise_session_stat` (`exercise_id`,`date`);--> statement-breakpoint
CREATE TABLE `food` (
	`id` text PRIMARY KEY NOT NULL,
	`barcode` text,
	`name` text NOT NULL,
	`brand` text,
	`serving_g` real NOT NULL,
	`serving_label` text,
	`kcal` real NOT NULL,
	`protein` real NOT NULL,
	`carb` real NOT NULL,
	`fat` real NOT NULL,
	`fiber` real,
	`is_custom` integer DEFAULT 0 NOT NULL,
	`times_used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_food_name` ON `food` (`name`);--> statement-breakpoint
CREATE INDEX `idx_food_barcode` ON `food` (`barcode`);--> statement-breakpoint
CREATE TABLE `meal_log` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`meal_slot` text NOT NULL,
	`food_id` text,
	`recipe_id` text,
	`grams` real NOT NULL,
	`logged_at` text NOT NULL,
	FOREIGN KEY (`food_id`) REFERENCES `food`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_meal_date` ON `meal_log` (`date`);--> statement-breakpoint
CREATE TABLE `measurement` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`site` text NOT NULL,
	`cm` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`servings` real DEFAULT 1 NOT NULL,
	`times_used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recipe_item` (
	`id` text PRIMARY KEY NOT NULL,
	`recipe_id` text NOT NULL,
	`food_id` text NOT NULL,
	`grams` real NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipe`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`food_id`) REFERENCES `food`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `routine` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`days_per_week` integer NOT NULL,
	`active` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `routine_day` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`label` text NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routine`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `routine_slot` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_day_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`target_sets` integer NOT NULL,
	`rep_lo` integer NOT NULL,
	`rep_hi` integer NOT NULL,
	`target_rir` integer DEFAULT 1 NOT NULL,
	`rest_seconds` integer DEFAULT 150 NOT NULL,
	`superset_group` text,
	`notes` text,
	FOREIGN KEY (`routine_day_id`) REFERENCES `routine_day`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_day_id` text,
	`date` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`bodyweight_kg` real,
	`sleep_hours` real,
	`soreness` integer,
	`stress` integer,
	`session_rpe` integer,
	`notes` text,
	FOREIGN KEY (`routine_day_id`) REFERENCES `routine_day`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_session_date` ON `session` (`date`);--> statement-breakpoint
CREATE TABLE `set_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`weight` real NOT NULL,
	`reps` integer NOT NULL,
	`rir` integer NOT NULL,
	`is_warmup` integer DEFAULT 0 NOT NULL,
	`pain_flag` integer DEFAULT 0 NOT NULL,
	`rest_taken_seconds` integer,
	`logged_at` text NOT NULL,
	`e1rm` real NOT NULL,
	`was_override` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_setlog_ex_date` ON `set_log` (`exercise_id`,`logged_at`);--> statement-breakpoint
CREATE INDEX `idx_setlog_session` ON `set_log` (`session_id`);--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timer_state` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`ends_at` text NOT NULL,
	`label` text
);
--> statement-breakpoint
CREATE TABLE `water_log` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`ml` integer NOT NULL,
	`logged_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_water_date` ON `water_log` (`date`);--> statement-breakpoint
CREATE TABLE `weigh_in` (
	`date` text PRIMARY KEY NOT NULL,
	`kg` real NOT NULL,
	`note` text
);

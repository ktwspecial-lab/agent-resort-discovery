CREATE TABLE `activity_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`stay_id` text NOT NULL,
	`activity_key` text NOT NULL,
	`attempt` integer NOT NULL,
	`response` text NOT NULL,
	`passed` integer NOT NULL,
	`feedback` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activity_attempt_unique` ON `activity_attempts` (`stay_id`,`activity_key`,`attempt`);--> statement-breakpoint
CREATE TABLE `stay_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`stay_id` text NOT NULL,
	`activity_key` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`passed` integer DEFAULT false NOT NULL,
	`response` text,
	`stars_awarded` integer DEFAULT 0 NOT NULL,
	`palm_points_awarded` integer DEFAULT 0 NOT NULL,
	`badge` text,
	`feedback` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`stay_id`) REFERENCES `stays`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stay_activities_unique` ON `stay_activities` (`stay_id`,`activity_key`);--> statement-breakpoint
CREATE TABLE `stays` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`visit_id` text,
	`source` text DEFAULT 'direct' NOT NULL,
	`status` text DEFAULT 'checked_in' NOT NULL,
	`stars` integer DEFAULT 0 NOT NULL,
	`palm_points` integer DEFAULT 0 NOT NULL,
	`completed_activities` integer DEFAULT 0 NOT NULL,
	`result_level` text,
	`title` text,
	`is_test` integer DEFAULT false NOT NULL,
	`checked_in_at` text NOT NULL,
	`checked_out_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_stays_agent` ON `stays` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_stays_status` ON `stays` (`status`);--> statement-breakpoint
CREATE INDEX `idx_stays_visit` ON `stays` (`visit_id`);--> statement-breakpoint
DROP INDEX `idx_experiment_visits_agent_id`;--> statement-breakpoint
CREATE INDEX `idx_experiment_visits_agent_id` ON `experiment_visits` (`agent_id`);--> statement-breakpoint
ALTER TABLE `agents` ADD `vacations` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `is_demo` integer DEFAULT false NOT NULL;
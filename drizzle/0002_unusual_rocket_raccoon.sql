CREATE TABLE `experiment_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'direct' NOT NULL,
	`client_kind` text DEFAULT 'unknown' NOT NULL,
	`agent_id` text,
	`discovered_at` text,
	`registered_at` text,
	`checked_in_at` text,
	`first_activity_at` text,
	`activities_completed` integer DEFAULT 0 NOT NULL,
	`checked_out_at` text,
	`passport_visits` integer DEFAULT 0 NOT NULL,
	`last_passport_visit_at` text,
	`owner_passport_opened_at` text,
	`created_at` text NOT NULL,
	`last_event_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_experiment_visits_agent_id` ON `experiment_visits` (`agent_id`);--> statement-breakpoint
CREATE INDEX `idx_experiment_visits_created_at` ON `experiment_visits` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_experiment_visits_source` ON `experiment_visits` (`source`);
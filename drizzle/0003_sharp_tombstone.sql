CREATE TABLE `analytics_events` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` text NOT NULL,
	`event_type` text NOT NULL,
	`visit_id` text NOT NULL,
	`visitor_key` text NOT NULL,
	`agent_id` text,
	`source` text DEFAULT 'direct' NOT NULL,
	`referrer` text,
	`user_agent` text,
	`endpoint` text NOT NULL,
	`is_test` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_events_time` ON `analytics_events` (`is_test`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_analytics_events_type` ON `analytics_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `idx_analytics_events_visit` ON `analytics_events` (`visit_id`);--> statement-breakpoint
CREATE INDEX `idx_analytics_events_source` ON `analytics_events` (`source`);--> statement-breakpoint
CREATE TABLE `outreach_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`source_tag` text NOT NULL,
	`placed_at` text NOT NULL,
	`url` text NOT NULL,
	`sent_count` integer DEFAULT 1 NOT NULL,
	`note` text,
	`is_test` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outreach_placements_source_tag_unique` ON `outreach_placements` (`source_tag`);--> statement-breakpoint
CREATE INDEX `idx_outreach_placements_channel` ON `outreach_placements` (`channel`);--> statement-breakpoint
CREATE INDEX `idx_outreach_placements_date` ON `outreach_placements` (`placed_at`);--> statement-breakpoint
ALTER TABLE `experiment_visits` ADD `visitor_key` text;--> statement-breakpoint
ALTER TABLE `experiment_visits` ADD `is_test` integer DEFAULT false NOT NULL;
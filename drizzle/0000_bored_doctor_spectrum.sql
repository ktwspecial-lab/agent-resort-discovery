CREATE TABLE `activity_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`activity_key` text NOT NULL,
	`response` text NOT NULL,
	`stars` integer NOT NULL,
	`palm_points` integer NOT NULL,
	`badge` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activity_runs_agent_activity` ON `activity_runs` (`agent_id`,`activity_key`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_name` text NOT NULL,
	`endpoint_url` text,
	`api_key_hash` text NOT NULL,
	`trip_status` text DEFAULT 'registered' NOT NULL,
	`title` text DEFAULT 'Lobby Newcomer' NOT NULL,
	`stars` integer DEFAULT 0 NOT NULL,
	`palm_points` integer DEFAULT 0 NOT NULL,
	`checked_in_at` text,
	`checked_out_at` text,
	`created_at` text NOT NULL,
	`vip_access` integer DEFAULT false NOT NULL,
	`vip_floor_status` text,
	`vip_ceiling_status` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_api_key_hash_unique` ON `agents` (`api_key_hash`);
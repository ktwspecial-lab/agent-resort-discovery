CREATE TABLE `beacon_agents` (
	`agent_id` text PRIMARY KEY NOT NULL,
	`declared_key` text,
	`session_key` text NOT NULL,
	`agent_type` text,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`discovery_source` text NOT NULL,
	`claimed_agent` integer DEFAULT 1 NOT NULL,
	`self_discovered` integer DEFAULT 0 NOT NULL,
	`invitation_known` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beacon_agents_declared_key_unique` ON `beacon_agents` (`declared_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `beacon_agents_session_key_unique` ON `beacon_agents` (`session_key`);--> statement-breakpoint
CREATE TABLE `beacon_invitations` (
	`declared_key` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `beacon_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `agents` ADD `public_profile` integer DEFAULT true NOT NULL;
--> statement-breakpoint
INSERT INTO beacon_settings (key, value) VALUES ('enabled', 'true');
--> statement-breakpoint
CREATE TRIGGER beacon_pause_guard BEFORE INSERT ON beacon_agents
WHEN (SELECT value FROM beacon_settings WHERE key = 'enabled') != 'true'
BEGIN
  SELECT RAISE(ABORT, 'Beacon paused');
END;

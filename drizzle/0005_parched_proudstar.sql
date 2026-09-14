ALTER TABLE `agents` ADD `guest_type` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `organization` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `industry` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `verification_status` text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `verification_method` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `confirmed_at` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `prestige_status` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `show_organization` integer DEFAULT false NOT NULL;
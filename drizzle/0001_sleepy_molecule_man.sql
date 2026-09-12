ALTER TABLE `rooms` ADD `relay` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `host_relay` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `guest_relay` text;
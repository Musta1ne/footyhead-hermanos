CREATE TABLE `rooms` (
	`pin` text PRIMARY KEY NOT NULL,
	`host` text NOT NULL,
	`guest` text,
	`offer` text,
	`answer` text,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_expires` ON `rooms` (`expires`);
CREATE TABLE `invoice_addresses` (
	`address` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`trade` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exchange_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL
);

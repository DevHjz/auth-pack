CREATE TABLE `account_sync_checkpoints` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`sync_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `account_sync_checkpoints` (`account_id`, `sync_at`)
SELECT `id`, `sync_at` FROM `accounts` WHERE `sync_at` IS NOT NULL;

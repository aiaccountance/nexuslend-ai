CREATE TABLE `outfit_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerId` int NOT NULL,
	`blockedId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `outfit_blocks_pair_idx` UNIQUE(`blockerId`,`blockedId`)
);
--> statement-breakpoint
CREATE TABLE `outfit_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`postId` int,
	`commentId` int,
	`reportedUserId` int,
	`reason` enum('nudity','harassment','hate','violence','spam','not_their_photo','under_age','other') NOT NULL,
	`note` varchar(500),
	`status` enum('open','actioned','dismissed') NOT NULL DEFAULT 'open',
	`resolvedBy` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wardrobe_wears` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`itemId` int NOT NULL,
	`outfitId` int,
	`wornOn` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wardrobe_wears_id` PRIMARY KEY(`id`),
	CONSTRAINT `wardrobe_wears_item_day_idx` UNIQUE(`itemId`,`wornOn`)
);
--> statement-breakpoint
CREATE INDEX `outfit_blocks_blockerId_idx` ON `outfit_blocks` (`blockerId`);--> statement-breakpoint
CREATE INDEX `outfit_blocks_blockedId_idx` ON `outfit_blocks` (`blockedId`);--> statement-breakpoint
CREATE INDEX `outfit_reports_status_createdAt_idx` ON `outfit_reports` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `outfit_reports_reporterId_idx` ON `outfit_reports` (`reporterId`);--> statement-breakpoint
CREATE INDEX `wardrobe_wears_userId_wornOn_idx` ON `wardrobe_wears` (`userId`,`wornOn`);
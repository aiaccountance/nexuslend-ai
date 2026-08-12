CREATE TABLE `outfit_challenge_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`challengeId` int NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_challenge_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `outfit_challenge_entries_challengeId_postId_idx` UNIQUE(`challengeId`,`postId`)
);
--> statement-breakpoint
CREATE TABLE `outfit_challenges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(80) NOT NULL,
	`title` varchar(120) NOT NULL,
	`prompt` varchar(400) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`winnerPostId` int,
	`settledAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_challenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `outfit_challenges_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `outfit_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`actorId` int,
	`kind` enum('rating','comment','follow','battle_won','battle_lost','challenge_won','weekly_winner') NOT NULL,
	`postId` int,
	`challengeId` int,
	`body` varchar(300) NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `outfit_challenge_entries_userId_idx` ON `outfit_challenge_entries` (`userId`);--> statement-breakpoint
CREATE INDEX `outfit_challenges_endsAt_idx` ON `outfit_challenges` (`endsAt`);--> statement-breakpoint
CREATE INDEX `outfit_notifications_userId_createdAt_idx` ON `outfit_notifications` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `outfit_notifications_userId_readAt_idx` ON `outfit_notifications` (`userId`,`readAt`);
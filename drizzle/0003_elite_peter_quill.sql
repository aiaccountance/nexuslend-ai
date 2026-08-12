CREATE TABLE `outfit_follows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`followerId` int NOT NULL,
	`followingId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_follows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outfit_matchups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postAId` int NOT NULL,
	`postBId` int NOT NULL,
	`winnerId` int NOT NULL,
	`voterUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_matchups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outfit_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`imageUrl` varchar(512) NOT NULL,
	`imageKey` varchar(512) NOT NULL,
	`caption` text,
	`category` enum('casual','streetwear','formal','athletic','vintage','other') NOT NULL DEFAULT 'other',
	`aiTags` json,
	`aiStyleScore` int,
	`aiOccasion` varchar(255),
	`aiFeedback` text,
	`aiSuggestions` json,
	`eloRating` int NOT NULL DEFAULT 1200,
	`battleWins` int NOT NULL DEFAULT 0,
	`battleLosses` int NOT NULL DEFAULT 0,
	`ratingSum` int NOT NULL DEFAULT 0,
	`ratingCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `outfit_ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`rating` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_ratings_id` PRIMARY KEY(`id`)
);

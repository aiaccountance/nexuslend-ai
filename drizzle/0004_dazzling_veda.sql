CREATE TABLE `outfit_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`body` varchar(500) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `outfit_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wardrobe_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`imageUrl` varchar(512) NOT NULL,
	`imageKey` varchar(512) NOT NULL,
	`name` varchar(160) NOT NULL,
	`slot` enum('top','bottom','outerwear','shoes','accessory','dress') NOT NULL,
	`colour` varchar(80),
	`aiTags` json,
	`aiNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wardrobe_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wardrobe_outfits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`itemIds` json NOT NULL,
	`occasion` varchar(160),
	`aiRationale` text,
	`aiScore` int,
	`source` enum('ai','manual') NOT NULL DEFAULT 'manual',
	`postedPostId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wardrobe_outfits_id` PRIMARY KEY(`id`)
);

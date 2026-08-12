CREATE TABLE `wardrobe_models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`imageUrl` varchar(512) NOT NULL,
	`imageKey` varchar(512) NOT NULL,
	`consentedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wardrobe_models_id` PRIMARY KEY(`id`),
	CONSTRAINT `wardrobe_models_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `wardrobe_items` ADD `cleanImageUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `wardrobe_items` ADD `cleanImageKey` varchar(512);--> statement-breakpoint
ALTER TABLE `wardrobe_outfits` ADD `renderImageUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `wardrobe_outfits` ADD `renderImageKey` varchar(512);--> statement-breakpoint
ALTER TABLE `wardrobe_outfits` ADD `renderStyle` enum('mannequin','personal');
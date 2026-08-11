CREATE INDEX `outfit_comments_postId_idx` ON `outfit_comments` (`postId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `outfit_follows_followerId_idx` ON `outfit_follows` (`followerId`);--> statement-breakpoint
CREATE INDEX `outfit_follows_followingId_idx` ON `outfit_follows` (`followingId`);--> statement-breakpoint
CREATE INDEX `outfit_matchups_voterUserId_idx` ON `outfit_matchups` (`voterUserId`);--> statement-breakpoint
CREATE INDEX `outfit_posts_createdAt_idx` ON `outfit_posts` (`createdAt`);--> statement-breakpoint
CREATE INDEX `outfit_posts_eloRating_idx` ON `outfit_posts` (`eloRating`);--> statement-breakpoint
CREATE INDEX `outfit_posts_userId_idx` ON `outfit_posts` (`userId`);--> statement-breakpoint
CREATE INDEX `outfit_posts_category_createdAt_idx` ON `outfit_posts` (`category`,`createdAt`);--> statement-breakpoint
CREATE INDEX `outfit_ratings_postId_userId_idx` ON `outfit_ratings` (`postId`,`userId`);--> statement-breakpoint
CREATE INDEX `wardrobe_items_userId_slot_idx` ON `wardrobe_items` (`userId`,`slot`);--> statement-breakpoint
CREATE INDEX `wardrobe_outfits_userId_idx` ON `wardrobe_outfits` (`userId`);
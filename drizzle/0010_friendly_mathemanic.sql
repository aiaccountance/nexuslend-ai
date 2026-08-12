ALTER TABLE `outfit_posts` ADD `ratingAvg` decimal(6,3) GENERATED ALWAYS AS ((COALESCE(`ratingSum` / NULLIF(`ratingCount`, 0), 0))) STORED;--> statement-breakpoint
CREATE INDEX `outfit_posts_ratingAvg_idx` ON `outfit_posts` (`ratingAvg`);--> statement-breakpoint
CREATE INDEX `outfit_posts_standings_idx` ON `outfit_posts` (`createdAt`,`userId`,`eloRating`,`battleWins`);
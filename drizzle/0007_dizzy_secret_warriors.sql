CREATE TABLE `outfit_avatars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`skinTone` enum('porcelain','fair','light','medium','tan','bronze','deep','rich') NOT NULL DEFAULT 'medium',
	`bodyShape` enum('slim','straight','athletic','curvy','full') NOT NULL DEFAULT 'straight',
	`height` enum('petite','average','tall') NOT NULL DEFAULT 'average',
	`hairStyle` enum('none','short','medium','long','curly','afro','bun') NOT NULL DEFAULT 'short',
	`hairColor` enum('black','brown','blonde','auburn','red','grey','dyed') NOT NULL DEFAULT 'brown',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outfit_avatars_id` PRIMARY KEY(`id`),
	CONSTRAINT `outfit_avatars_userId_unique` UNIQUE(`userId`)
);

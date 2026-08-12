CREATE TABLE `outfit_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`username` varchar(30) NOT NULL,
	`displayUsername` varchar(30) NOT NULL,
	`passwordHash` varchar(255),
	`bio` varchar(200),
	`avatarUrl` varchar(512),
	`avatarKey` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `outfit_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `outfit_accounts_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `outfit_accounts_username_unique` UNIQUE(`username`)
);

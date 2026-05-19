CREATE TABLE `analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`userId` int NOT NULL,
	`creditScore` int,
	`fraudScore` int,
	`affordabilityScore` int,
	`dataConfidenceScore` int,
	`recommendation` enum('PROCEED','REVIEW','DECLINE'),
	`recommendationReason` text,
	`fraudMatrixJson` json,
	`scoresJson` json,
	`narrativeJson` json,
	`keyFlagsJson` json,
	`rawText` text,
	`documentsAnalysed` int DEFAULT 0,
	`processingTimeMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`companyNumber` varchar(20),
	`loanAmount` decimal(12,2) NOT NULL,
	`loanType` varchar(100) NOT NULL,
	`loanTermMonths` int,
	`sector` varchar(100),
	`status` enum('pending','analysing','complete','flagged','declined','approved') NOT NULL DEFAULT 'pending',
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fraud_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`userId` int NOT NULL,
	`checkType` varchar(100) NOT NULL,
	`result` enum('PASS','FLAG','ALERT','REQUIRES_LIVE_API') NOT NULL,
	`details` text,
	`riskScore` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `fraud_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `model_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`metricDate` timestamp NOT NULL DEFAULT (now()),
	`totalDecisions` int DEFAULT 0,
	`autoApprovalRate` decimal(5,2),
	`averageCreditScore` decimal(5,2),
	`averageFraudScore` decimal(5,2),
	`proceedRate` decimal(5,2),
	`reviewRate` decimal(5,2),
	`declineRate` decimal(5,2),
	`avgProcessingTimeMs` int,
	`driftPsi` decimal(5,4),
	`driftAlert` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `open_banking_connections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dealId` int NOT NULL,
	`userId` int NOT NULL,
	`bankName` varchar(100),
	`connectionStatus` enum('pending','connected','expired','revoked') NOT NULL DEFAULT 'pending',
	`consentExpiresAt` timestamp,
	`transactionDataJson` json,
	`monthlyRevenueJson` json,
	`nsfCount` int DEFAULT 0,
	`avgMonthlyRevenue` decimal(12,2),
	`revenueVolatility` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `open_banking_connections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `policy_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ruleName` varchar(255) NOT NULL,
	`ruleType` enum('auto_decline','auto_approve','flag_review','pricing','condition') NOT NULL,
	`field` varchar(100) NOT NULL,
	`operator` enum('gt','lt','gte','lte','eq','neq','contains') NOT NULL,
	`value` varchar(255) NOT NULL,
	`action` text NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`priority` int NOT NULL DEFAULT 100,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `policy_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portfolio_loans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`dealId` int,
	`companyName` varchar(255) NOT NULL,
	`loanAmount` decimal(12,2) NOT NULL,
	`outstandingBalance` decimal(12,2) NOT NULL,
	`monthlyRepayment` decimal(10,2) NOT NULL,
	`interestRate` decimal(5,2) NOT NULL,
	`startDate` timestamp NOT NULL,
	`maturityDate` timestamp NOT NULL,
	`sector` varchar(100),
	`status` enum('current','watch','arrears','default','redeemed') NOT NULL DEFAULT 'current',
	`riskRating` enum('green','amber','red') NOT NULL DEFAULT 'green',
	`lastMonitoredAt` timestamp,
	`earlyWarningFlags` json,
	`revenueLastMonth` decimal(12,2),
	`revenueTrend` enum('improving','stable','declining') DEFAULT 'stable',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portfolio_loans_id` PRIMARY KEY(`id`)
);

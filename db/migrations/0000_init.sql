CREATE TABLE `archetypes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `archetypes_name_uq` ON `archetypes` (`name`);--> statement-breakpoint
CREATE TABLE `card_roles` (
	`deck_version_id` integer NOT NULL,
	`card_id` integer NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`deck_version_id`, `card_id`),
	FOREIGN KEY (`deck_version_id`) REFERENCES `deck_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`archetype` text,
	`image_url_cropped` text,
	`image_url_small` text,
	`updated_at` integer DEFAULT (strftime('%s','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deck_cards` (
	`deck_version_id` integer NOT NULL,
	`card_id` integer NOT NULL,
	`section` text NOT NULL,
	`copies` integer NOT NULL,
	PRIMARY KEY(`deck_version_id`, `card_id`, `section`),
	FOREIGN KEY (`deck_version_id`) REFERENCES `deck_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deck_cards_version_idx` ON `deck_cards` (`deck_version_id`);--> statement-breakpoint
CREATE TABLE `deck_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_id` integer NOT NULL,
	`version_label` text,
	`is_current` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deck_versions_deck_idx` ON `deck_versions` (`deck_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `deck_versions_current_uq` ON `deck_versions` (`deck_id`) WHERE "deck_versions"."is_current" = 1;--> statement-breakpoint
CREATE TABLE `decks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`archetype_id` integer,
	`created_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`archetype_id`) REFERENCES `archetypes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `game_opening_hand` (
	`game_id` integer NOT NULL,
	`card_id` integer NOT NULL,
	`copies` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`game_id`, `card_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `opening_hand_card_idx` ON `game_opening_hand` (`card_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`game_number` integer NOT NULL,
	`went_first` integer NOT NULL,
	`result` text NOT NULL,
	`loss_reason` text,
	`notes` text,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `games_match_idx` ON `games` (`match_id`);--> statement-breakpoint
CREATE INDEX `games_loss_reason_idx` ON `games` (`loss_reason`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`deck_version_id` integer NOT NULL,
	`opponent_archetype` text NOT NULL,
	`went_first` integer,
	`format` text DEFAULT 'tcg' NOT NULL,
	`result` text NOT NULL,
	`event` text,
	`notes` text,
	`played_at` integer DEFAULT (strftime('%s','now')) NOT NULL,
	FOREIGN KEY (`deck_version_id`) REFERENCES `deck_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `matches_deck_version_idx` ON `matches` (`deck_version_id`);--> statement-breakpoint
CREATE INDEX `matches_archetype_idx` ON `matches` (`opponent_archetype`);--> statement-breakpoint
CREATE INDEX `matches_played_at_idx` ON `matches` (`played_at`);--> statement-breakpoint
CREATE TABLE `tech_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`opponent_archetype` text NOT NULL,
	`card_id` integer NOT NULL,
	`reason` text NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`source` text DEFAULT 'curated' NOT NULL,
	`coverage_score` real,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tech_answers_opponent_idx` ON `tech_answers` (`opponent_archetype`);
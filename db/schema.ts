/**
 * DuelBrain database schema.
 *
 * Mirrors the SQL model pressure-tested in yugioh-app-notes.md.
 * Key invariants (do NOT relax without re-checking the queries in notes):
 *   - Stats join through `deck_version_id`, never `deck_id`.
 *   - `went_first` is required on every game (winrates swing 15-25% on coin flip).
 *   - `loss_reason` is a closed enum of 7 values (see loss_reason.ts).
 *   - `game_opening_hand` is normalized (one row per card) for indexed queries.
 *   - `card_roles` is per-deck_version, not per-deck (role depends on the list).
 */
import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

// ---------- Card catalog (seeded from YGOPRODeck bulk) ----------

export const cards = sqliteTable("cards", {
  id: integer("id").primaryKey(), // passcode
  name: text("name").notNull(),
  type: text("type").notNull(),
  archetype: text("archetype"),
  imageUrlCropped: text("image_url_cropped"),
  imageUrlSmall: text("image_url_small"),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(strftime('%s','now'))`),
});

export const archetypes = sqliteTable(
  "archetypes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
  },
  (t) => [uniqueIndex("archetypes_name_uq").on(t.name)],
);

// ---------- Decks ----------

export const decks = sqliteTable("decks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  archetypeId: integer("archetype_id").references(() => archetypes.id),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(strftime('%s','now'))`),
  archivedAt: integer("archived_at"), // null = active
});

export const deckVersions = sqliteTable(
  "deck_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deckId: integer("deck_id")
      .notNull()
      .references(() => decks.id),
    versionLabel: text("version_label"), // optional "v3", "post-ban", etc
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at")
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (t) => [
    index("deck_versions_deck_idx").on(t.deckId),
    // Only one is_current per deck — enforced with a partial unique index
    uniqueIndex("deck_versions_current_uq")
      .on(t.deckId)
      .where(sql`${t.isCurrent} = 1`),
  ],
);

export const deckCards = sqliteTable(
  "deck_cards",
  {
    deckVersionId: integer("deck_version_id")
      .notNull()
      .references(() => deckVersions.id, { onDelete: "cascade" }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    section: text("section", { enum: ["main", "extra", "side"] as const })
      .notNull(),
    copies: integer("copies").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.deckVersionId, t.cardId, t.section] }),
    index("deck_cards_version_idx").on(t.deckVersionId),
  ],
);

// Role is per-deck-version, not per-deck. Maxx C is a starter in some decks,
// dead in others.
export const cardRoles = sqliteTable(
  "card_roles",
  {
    deckVersionId: integer("deck_version_id")
      .notNull()
      .references(() => deckVersions.id, { onDelete: "cascade" }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    role: text("role", {
      enum: ["starter", "extender", "handtrap", "board_breaker", "tech", "side", "engine"] as const,
    }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.deckVersionId, t.cardId] })],
);

// ---------- Match logging ----------

export const matches = sqliteTable(
  "matches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deckVersionId: integer("deck_version_id")
      .notNull()
      .references(() => deckVersions.id),
    opponentArchetype: text("opponent_archetype").notNull(),
    wentFirst: integer("went_first", { mode: "boolean" }), // match-level (first game); per-game overrides
    format: text("format", {
      enum: ["tcg", "ocg", "speed_duel", "rush_duel", "goat", "edison", "other"] as const,
    }).notNull().default("tcg"),
    result: text("result", { enum: ["win", "loss", "draw"] as const }).notNull(),
    event: text("event"), // locals, regional, online, casual, ...
    notes: text("notes"),
    playedAt: integer("played_at")
      .notNull()
      .default(sql`(strftime('%s','now'))`),
  },
  (t) => [
    index("matches_deck_version_idx").on(t.deckVersionId),
    index("matches_archetype_idx").on(t.opponentArchetype),
    index("matches_played_at_idx").on(t.playedAt),
  ],
);

// loss_reason enum is locked at 7 values. See loss_reason.ts for the mapping
// to suggester actions. Null = match was a win.
export const games = sqliteTable(
  "games",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    gameNumber: integer("game_number").notNull(), // 1, 2, 3
    wentFirst: integer("went_first", { mode: "boolean" }).notNull(),
    result: text("result", { enum: ["win", "loss", "draw"] as const }).notNull(),
    lossReason: text("loss_reason", {
      enum: ["brick", "handtrapped", "floodgate", "broken_board", "outcombed", "misplay", "other"] as const,
    }),
    notes: text("notes"),
  },
  (t) => [
    index("games_match_idx").on(t.matchId),
    index("games_loss_reason_idx").on(t.lossReason),
  ],
);

// Normalized — one row per card in the opening hand, so we can run indexed
// "when I open X I win Y%" queries.
export const gameOpeningHand = sqliteTable(
  "game_opening_hand",
  {
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    copies: integer("copies").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.cardId] }),
    index("opening_hand_card_idx").on(t.cardId),
  ],
);

// ---------- Tech suggester ----------

// Curated map: when playing against <archetype>, these cards help.
// Priority 1 = top pick. Reason is shown in the UI for the "why" UX.
export const techAnswers = sqliteTable(
  "tech_answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    opponentArchetype: text("opponent_archetype").notNull(),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id),
    reason: text("reason").notNull(),
    priority: integer("priority").notNull().default(3), // 1 best .. 5 worst
    source: text("source", { enum: ["curated", "meta_mined", "personal"] as const })
      .notNull()
      .default("curated"),
    coverageScore: real("coverage_score"), // # of archetypes this card answers
  },
  (t) => [index("tech_answers_opponent_idx").on(t.opponentArchetype)],
);

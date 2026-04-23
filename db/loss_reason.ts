/**
 * loss_reason enum — locked at 7 values. Every value maps to one suggester
 * action. Source of truth: yugioh-app-notes.md.
 *
 * Concede is NOT a reason. Tag the underlying cause.
 * UI wording: "what caused you to lose?" not "how did the game end?"
 * Cross-check: broken_board + wentFirst=true -> likely mistagged.
 */

export const LOSS_REASONS = [
  "brick",
  "handtrapped",
  "floodgate",
  "broken_board",
  "outcombed",
  "misplay",
  "other",
] as const;

export type LossReason = (typeof LOSS_REASONS)[number];

export type SuggesterAction =
  | "build_fix_suppress_tech" // brick: ratios problem, hide tech suggestions
  | "tech_protection" // handtrapped: Called By, Crossout
  | "tech_removal" // floodgate: Cosmic Cyclone, Lightning Storm, Feather Duster
  | "tech_board_breaker" // broken_board: Dark Ruler, Evenly, Droplet, Kaijus
  | "tech_handtrap" // outcombed: Ash, Maxx C, Nibiru, Bystial
  | "not_actionable"; // misplay, other

export const SUGGESTER_ACTION: Record<LossReason, SuggesterAction> = {
  brick: "build_fix_suppress_tech",
  handtrapped: "tech_protection",
  floodgate: "tech_removal",
  broken_board: "tech_board_breaker",
  outcombed: "tech_handtrap",
  misplay: "not_actionable",
  other: "not_actionable",
};

// Shown as a hint in the picker UI.
export const LOSS_REASON_LABEL: Record<LossReason, string> = {
  brick: "Brick — dead hand or all handtraps, no engine",
  handtrapped: "Handtrapped — my combo stopped by Ash/Maxx/Droll/etc.",
  floodgate: "Floodgate — locked by Skill Drain / TCBOO / Anti-Spell",
  broken_board: "Broken board — couldn't break their set-up on my turn",
  outcombed: "Outcombed — they established and I had no answer",
  misplay: "Misplay — my mistake",
  other: "Other — time, deck-out, DQ",
};

// Generic fallback answers when tech_answers has no row for the opponent's
// archetype. Card names (we'll resolve to IDs at insert time).
export const GENERIC_FALLBACK: Partial<Record<LossReason, string[]>> = {
  handtrapped: ["Called by the Grave", "Crossout Designator"],
  floodgate: [
    "Cosmic Cyclone",
    "Lightning Storm",
    "Harpie's Feather Duster",
  ],
  broken_board: [
    "Dark Ruler No More",
    "Evenly Matched",
    "Forbidden Droplet",
    "Santa Claws", // placeholder; prefer real Kaiju IDs
  ],
  outcombed: [
    "Ash Blossom & Joyous Spring",
    "Maxx \"C\"",
    "Nibiru, the Primal Being",
    "Bystial Magnamhut",
  ],
};

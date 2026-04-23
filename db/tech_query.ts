/**
 * Read-side queries for the tech suggester UI.
 *
 * Two sources of answers per opponent archetype:
 *   1. Curated `tech_answers` — hand-seeded, always shown first when present.
 *   2. Personal fallback — mined from the user's own loss_reason histogram
 *      vs this archetype, mapped through `GENERIC_FALLBACK`. Surfaces even
 *      for archetypes the curated dataset doesn't cover, and gives a reason
 *      text grounded in real loss counts ("Handtrapped 3× vs Snake-Eye...").
 *
 * Curated sort order: priority ascending (1 best), then coverage descending
 * (more universal answers bubble up within the same priority tier), then
 * card name for stable ties.
 */
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db, schema } from "./client";
import {
  GENERIC_FALLBACK,
  type LossReason,
} from "./loss_reason";

export type TechPick = {
  id: number;
  cardId: number;
  cardName: string;
  cardType: string;
  imageUrlSmall: string | null;
  imageUrlCropped: string | null;
  reason: string;
  priority: number;
  coverageScore: number | null;
  source: "curated" | "meta_mined" | "personal";
};

export async function listTechForArchetype(
  archetype: string,
): Promise<TechPick[]> {
  const rows = await db
    .select({
      id: schema.techAnswers.id,
      cardId: schema.cards.id,
      cardName: schema.cards.name,
      cardType: schema.cards.type,
      imageUrlSmall: schema.cards.imageUrlSmall,
      imageUrlCropped: schema.cards.imageUrlCropped,
      reason: schema.techAnswers.reason,
      priority: schema.techAnswers.priority,
      coverageScore: schema.techAnswers.coverageScore,
      source: schema.techAnswers.source,
    })
    .from(schema.techAnswers)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.techAnswers.cardId))
    .where(eq(schema.techAnswers.opponentArchetype, archetype))
    .orderBy(
      asc(schema.techAnswers.priority),
      desc(schema.techAnswers.coverageScore),
      asc(schema.cards.name),
    )
    .all();
  return rows;
}

/** List every archetype that has at least one tech_answers row, for the
 *  picker. Ordered by entry count desc so the "biggest" matchups lead. */
export async function listArchetypesWithTech(): Promise<
  { archetype: string; count: number }[]
> {
  const rows = await db
    .select({
      archetype: schema.techAnswers.opponentArchetype,
    })
    .from(schema.techAnswers)
    .all();
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.archetype, (counts.get(r.archetype) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([archetype, count]) => ({ archetype, count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.archetype.localeCompare(b.archetype);
    });
}

// ---------- Personal fallback (loss_reason → generic cards) ----------

// Short "what the reason means" text used in the Tech UI so the row reason
// reads naturally. Only the reasons with a GENERIC_FALLBACK entry appear
// here; brick/misplay/other deliberately have no cards.
const LOSS_REASON_HEADLINE: Partial<Record<LossReason, string>> = {
  handtrapped: "Handtrapped",
  floodgate: "Locked by floodgates",
  broken_board: "Couldn't break their board",
  outcombed: "Outcombed",
};

const LOSS_REASON_FIX: Partial<Record<LossReason, string>> = {
  handtrapped: "protects your combo against Ash/Maxx/Droll",
  floodgate: "clears continuous lockouts",
  broken_board: "clears an established board",
  outcombed: "interrupts their turn before they set up",
};

/**
 * Mine the user's own loss_reason histogram for this opponent and turn it
 * into TechPick rows. Only fires for loss_reasons that have a generic card
 * list (handtrapped / floodgate / broken_board / outcombed — brick &
 * misplay & other are not-actionable by definition).
 *
 * Card resolution is case-insensitive against cards.name; missing cards
 * are silently skipped so the catalog can be partially seeded without
 * breaking the UI.
 *
 * @param excludeCardIds — card ids already shown by the curated list;
 *   dedupe so we don't show the same card twice with different reasons.
 */
export async function listPersonalFallbacks(
  archetype: string,
  excludeCardIds: number[] = [],
): Promise<TechPick[]> {
  // 1. Loss-reason histogram for lost games vs this archetype.
  const histogram = await db
    .select({
      lossReason: schema.games.lossReason,
      count: sql<number>`count(*)`,
    })
    .from(schema.games)
    .innerJoin(schema.matches, eq(schema.matches.id, schema.games.matchId))
    .where(
      and(
        eq(schema.matches.opponentArchetype, archetype),
        eq(schema.games.result, "loss"),
        isNotNull(schema.games.lossReason),
      ),
    )
    .groupBy(schema.games.lossReason)
    .orderBy(desc(sql`count(*)`))
    .all();

  if (histogram.length === 0) return [];

  // 2. Collect unique card names across the relevant reasons, preserving the
  //    reason-rank (most-frequent reason first, within a reason the order
  //    in GENERIC_FALLBACK).
  type Slot = { name: string; reason: LossReason; reasonRank: number; count: number };
  const slots: Slot[] = [];
  const seenNames = new Set<string>();
  histogram.forEach((h, rank) => {
    const reason = h.lossReason as LossReason | null;
    if (!reason) return;
    const cards = GENERIC_FALLBACK[reason];
    if (!cards) return;
    for (const name of cards) {
      if (seenNames.has(name.toLowerCase())) continue;
      seenNames.add(name.toLowerCase());
      slots.push({ name, reason, reasonRank: rank, count: h.count });
    }
  });

  if (slots.length === 0) return [];

  // 3. Resolve names → catalog rows. Case-insensitive match via lower() on
  //    both sides; single roundtrip, filtered client-side to preserve order.
  const lowered = slots.map((s) => s.name.toLowerCase());
  const catalog = await db
    .select({
      id: schema.cards.id,
      name: schema.cards.name,
      type: schema.cards.type,
      imageUrlSmall: schema.cards.imageUrlSmall,
      imageUrlCropped: schema.cards.imageUrlCropped,
    })
    .from(schema.cards)
    .where(inArray(sql<string>`lower(${schema.cards.name})`, lowered))
    .all();

  const byLoweredName = new Map<string, typeof catalog[number]>();
  for (const c of catalog) byLoweredName.set(c.name.toLowerCase(), c);

  const excluded = new Set(excludeCardIds);
  const picks: TechPick[] = [];
  for (const slot of slots) {
    const card = byLoweredName.get(slot.name.toLowerCase());
    if (!card) continue; // not in catalog yet
    if (excluded.has(card.id)) continue;

    const headline = LOSS_REASON_HEADLINE[slot.reason] ?? slot.reason;
    const fix = LOSS_REASON_FIX[slot.reason] ?? "helps in this matchup";
    const games = `${slot.count} game${slot.count === 1 ? "" : "s"}`;
    const reason = `${headline} ${games} vs ${archetype}. ${card.name} ${fix}.`;

    picks.push({
      // Negative synthetic id so React keys don't collide with curated rows.
      // Stable across renders because it's derived from the card id.
      id: -card.id,
      cardId: card.id,
      cardName: card.name,
      cardType: card.type,
      imageUrlSmall: card.imageUrlSmall,
      imageUrlCropped: card.imageUrlCropped,
      reason,
      priority: Math.min(slot.reasonRank + 1, 5),
      coverageScore: slot.count, // shown as "answers N losses"
      source: "personal",
    });
  }

  return picks;
}

/**
 * One-call loader for the Tech screen. Returns both curated + personal
 * sections so the UI can render them independently. Personal picks
 * deduplicate against curated card ids.
 */
export async function loadTechSuggestions(archetype: string): Promise<{
  curated: TechPick[];
  personal: TechPick[];
}> {
  const curated = await listTechForArchetype(archetype);
  const personal = await listPersonalFallbacks(
    archetype,
    curated.map((p) => p.cardId),
  );
  return { curated, personal };
}

/**
 * Archetypes the user has lost games against (with at least one non-null
 * loss_reason that maps to a generic fallback). Used to pad the picker
 * with matchups that will have personal picks even if curated has nothing.
 */
export async function listArchetypesWithLossHistory(): Promise<
  { archetype: string; count: number }[]
> {
  // Only reasons with a generic fallback count — others are not-actionable.
  const actionable = Object.keys(GENERIC_FALLBACK) as LossReason[];
  if (actionable.length === 0) return [];

  const rows = await db
    .select({
      archetype: schema.matches.opponentArchetype,
      count: sql<number>`count(*)`,
    })
    .from(schema.games)
    .innerJoin(schema.matches, eq(schema.matches.id, schema.games.matchId))
    .where(
      and(
        eq(schema.games.result, "loss"),
        inArray(schema.games.lossReason, actionable),
      ),
    )
    .groupBy(schema.matches.opponentArchetype)
    .orderBy(desc(sql`count(*)`))
    .all();

  return rows.map((r) => ({ archetype: r.archetype, count: r.count }));
}

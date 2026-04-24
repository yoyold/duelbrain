/**
 * Opening-hand CRUD.
 *
 * `game_opening_hand` is normalized (one row per distinct card) specifically
 * so we can run indexed "when I open X I win Y%" queries without parsing
 * JSON columns. Copies count matters because drawing 2× Maxx C is different
 * from drawing 1× — both dimensions feed the suggester.
 *
 * Writes go through `setOpeningHand`, which replaces the whole hand in a
 * single transaction. The UI treats the hand as a set; no point exposing
 * per-row add/remove RPCs.
 *
 * `listDeckCardsForPicker` scopes the opening-hand picker to main+side of
 * the match's deck_version. Extra deck is never drawn, so showing it would
 * only invite miss-taps. Side cards stay in scope because g2/g3 hands draw
 * post-side.
 */
import { and, asc, eq } from "drizzle-orm";

import { db, schema } from "./client";

export type OpeningHandCard = {
  cardId: number;
  name: string;
  type: string;
  copies: number;
  imageUrlSmall: string | null;
};

export async function listOpeningHand(gameId: number): Promise<OpeningHandCard[]> {
  const rows = await db
    .select({
      cardId: schema.cards.id,
      name: schema.cards.name,
      type: schema.cards.type,
      copies: schema.gameOpeningHand.copies,
      imageUrlSmall: schema.cards.imageUrlSmall,
    })
    .from(schema.gameOpeningHand)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.gameOpeningHand.cardId))
    .where(eq(schema.gameOpeningHand.gameId, gameId))
    .orderBy(asc(schema.cards.name))
    .all();
  return rows;
}

/** Replace the whole opening-hand atomically. Empty array clears it. */
export async function setOpeningHand(
  gameId: number,
  cards: { cardId: number; copies: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.gameOpeningHand)
      .where(eq(schema.gameOpeningHand.gameId, gameId));

    if (cards.length === 0) return;

    // Coalesce duplicates defensively — the UI shouldn't send them, but the
    // composite PK (gameId, cardId) would reject them anyway. Safer to sum.
    const merged = new Map<number, number>();
    for (const c of cards) {
      if (c.copies <= 0) continue;
      merged.set(c.cardId, (merged.get(c.cardId) ?? 0) + c.copies);
    }

    await tx.insert(schema.gameOpeningHand).values(
      Array.from(merged.entries()).map(([cardId, copies]) => ({
        gameId,
        cardId,
        copies,
      })),
    );
  });
}

export type DeckPickerCard = {
  cardId: number;
  name: string;
  type: string;
  section: "main" | "side";
  imageUrlSmall: string | null;
};

/**
 * Cards the user can pick for an opening hand, scoped to the played deck
 * version. Extra deck is excluded — never drawn. Each card appears once
 * with its max `copies` from the deck; the picker handles multi-copies by
 * letting the user bump the count.
 */
export async function listDeckCardsForPicker(
  deckVersionId: number,
): Promise<(DeckPickerCard & { maxCopies: number })[]> {
  const rows = await db
    .select({
      cardId: schema.cards.id,
      name: schema.cards.name,
      type: schema.cards.type,
      section: schema.deckCards.section,
      copies: schema.deckCards.copies,
      imageUrlSmall: schema.cards.imageUrlSmall,
    })
    .from(schema.deckCards)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.deckCards.cardId))
    .where(
      and(
        eq(schema.deckCards.deckVersionId, deckVersionId),
        // extra section explicitly excluded
      ),
    )
    .all();

  // Merge main+side entries for the same card so the picker shows one row
  // per card with total available copies.
  const byCard = new Map<
    number,
    DeckPickerCard & { maxCopies: number }
  >();
  for (const r of rows) {
    if (r.section === "extra") continue;
    const existing = byCard.get(r.cardId);
    if (existing) {
      existing.maxCopies += r.copies;
      // Prefer main section label over side for display.
      if (r.section === "main") existing.section = "main";
    } else {
      byCard.set(r.cardId, {
        cardId: r.cardId,
        name: r.name,
        type: r.type,
        section: r.section,
        imageUrlSmall: r.imageUrlSmall,
        maxCopies: r.copies,
      });
    }
  }

  return Array.from(byCard.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

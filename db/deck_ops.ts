/**
 * Deck operations. Versioning semantics in one place so the editor screen
 * doesn't have to reason about it.
 *
 * v1 policy: every save creates a NEW deck_version. Preserves match stats
 * attribution (matches reference deckVersionId directly). Old versions are
 * demoted (is_current=false). A v2 refinement could add "save in place" when
 * the current version has no matches referencing it — deferred.
 */
import { and, eq } from "drizzle-orm";

import { db, schema } from "./client";

/** Keyword rule for Extra-deck classification. A card's `type` string contains
 *  one of these iff the card belongs in the Extra deck. Pendulum-Normal /
 *  Pendulum-Effect monsters belong in Main and do NOT match. */
const EXTRA_TYPE_KEYWORDS = ["Fusion", "Synchro", "Xyz", "Link"] as const;

export function isExtraDeckType(type: string): boolean {
  return EXTRA_TYPE_KEYWORDS.some((k) => type.includes(k));
}

export type DeckCardRow = {
  cardId: number;
  name: string;
  type: string;
  section: "main" | "extra" | "side";
  copies: number;
  imageUrlSmall: string | null;
  imageUrlCropped: string | null;
};

/** Load every card in the given deck_version, joined to the cards catalog. */
export async function loadDeckCards(deckVersionId: number): Promise<DeckCardRow[]> {
  const rows = await db
    .select({
      cardId: schema.cards.id,
      name: schema.cards.name,
      type: schema.cards.type,
      section: schema.deckCards.section,
      copies: schema.deckCards.copies,
      imageUrlSmall: schema.cards.imageUrlSmall,
      imageUrlCropped: schema.cards.imageUrlCropped,
    })
    .from(schema.deckCards)
    .innerJoin(schema.cards, eq(schema.cards.id, schema.deckCards.cardId))
    .where(eq(schema.deckCards.deckVersionId, deckVersionId))
    .all();
  return rows.sort((a, b) => {
    if (a.section !== b.section) return sectionOrder(a.section) - sectionOrder(b.section);
    return a.name.localeCompare(b.name);
  });
}

function sectionOrder(s: "main" | "extra" | "side"): number {
  return s === "main" ? 0 : s === "extra" ? 1 : 2;
}

/** Find the current version for a deck; throws if the deck has none. */
export async function getCurrentVersion(deckId: number): Promise<{ id: number; label: string | null }> {
  const row = await db
    .select({ id: schema.deckVersions.id, label: schema.deckVersions.versionLabel })
    .from(schema.deckVersions)
    .where(
      and(
        eq(schema.deckVersions.deckId, deckId),
        eq(schema.deckVersions.isCurrent, true),
      ),
    )
    .limit(1)
    .get();
  if (!row) throw new Error(`Deck ${deckId} has no current version`);
  return row;
}

/** Save the given card list as a new deck_version. Demotes the previous
 *  current version. Returns the new version id. Transactional.
 *
 *  `newLabel` is optional; defaults to "v{N+1}" based on existing version count.
 */
export async function saveAsNewVersion(
  deckId: number,
  cards: { cardId: number; section: "main" | "extra" | "side"; copies: number }[],
  newLabel?: string,
): Promise<number> {
  return await db.transaction(async (tx) => {
    // Demote any current version.
    await tx
      .update(schema.deckVersions)
      .set({ isCurrent: false })
      .where(
        and(
          eq(schema.deckVersions.deckId, deckId),
          eq(schema.deckVersions.isCurrent, true),
        ),
      );

    // Count existing versions to auto-label.
    const existing = await tx
      .select()
      .from(schema.deckVersions)
      .where(eq(schema.deckVersions.deckId, deckId))
      .all();
    const label = newLabel ?? `v${existing.length + 1}`;

    const [inserted] = await tx
      .insert(schema.deckVersions)
      .values({ deckId, versionLabel: label, isCurrent: true })
      .returning();

    if (cards.length > 0) {
      await tx.insert(schema.deckCards).values(
        cards.map((c) => ({
          deckVersionId: inserted.id,
          cardId: c.cardId,
          section: c.section,
          copies: c.copies,
        })),
      );
    }

    return inserted.id;
  });
}

/** Create a brand-new deck with an initial empty v1. Returns the new deck id. */
export async function createDeck(name: string): Promise<number> {
  return await db.transaction(async (tx) => {
    const [deck] = await tx
      .insert(schema.decks)
      .values({ name })
      .returning();
    await tx.insert(schema.deckVersions).values({
      deckId: deck.id,
      versionLabel: "v1",
      isCurrent: true,
    });
    return deck.id;
  });
}

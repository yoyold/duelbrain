/**
 * Idempotent first-run seed. Populates a baseline archetype list for the
 * opponent picker so logging a match doesn't require scanning cards first.
 *
 * Real card catalog is synced from YGOPRODeck in a separate step (not yet wired).
 * Once decks are built from real lists, archetypes from cards.archetype will
 * fill in the gaps.
 */
import { db, schema } from "./client";
import { eq, sql } from "drizzle-orm";

// Curated meta archetype list. Kept small on purpose — 2026 TCG + greatest
// hits. Users will add more; YGOPRODeck sync will add the long tail.
const SEED_ARCHETYPES = [
  "Snake-Eye",
  "Fiendsmith",
  "Tenpai Dragon",
  "Yubel",
  "Ryzeal",
  "White Forest",
  "Maliss",
  "Voiceless Voice",
  "Sky Striker",
  "Blue-Eyes",
  "Labrynth",
  "Dragon Link",
  "Branded",
  "Runick",
  "Purrely",
  "Kashtira",
  "Floowandereeze",
  "Spright",
  "Tearlaments",
  "Eldlich",
  "Drytron",
  "Swordsoul",
  "Mathmech",
  "Exosister",
  "Phantom Knights / Rokket",
  "Stun",
  "Rogue",
  "Unknown",
];

// A default deck so the user can log their first match without detour.
// Real decks get created/edited on the Decks tab.
const DEFAULT_DECK_NAME = "My Deck";

export async function seedIfNeeded() {
  const existingArchCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.archetypes)
    .get();

  if (!existingArchCount || existingArchCount.n === 0) {
    await db
      .insert(schema.archetypes)
      .values(SEED_ARCHETYPES.map((name) => ({ name })))
      .onConflictDoNothing();
  }

  // Ensure at least one deck + one deck_version exist.
  const anyDeck = await db.select().from(schema.decks).limit(1).get();
  if (!anyDeck) {
    const [deck] = await db
      .insert(schema.decks)
      .values({ name: DEFAULT_DECK_NAME })
      .returning();
    await db.insert(schema.deckVersions).values({
      deckId: deck.id,
      versionLabel: "v1",
      isCurrent: true,
    });
  } else {
    // Make sure it has a current version (defensive).
    const currentVer = await db
      .select()
      .from(schema.deckVersions)
      .where(eq(schema.deckVersions.isCurrent, true))
      .limit(1)
      .get();
    if (!currentVer) {
      await db.insert(schema.deckVersions).values({
        deckId: anyDeck.id,
        versionLabel: "v1",
        isCurrent: true,
      });
    }
  }
}

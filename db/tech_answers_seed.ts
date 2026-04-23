/**
 * Seeder for tech_answers. Resolves the curated data in tech_answers_data.ts
 * from card names → card.id (YGOPRODeck passcode), then replaces all
 * `source = 'curated'` rows with a fresh snapshot.
 *
 * Designed to be idempotent: running it repeatedly gives the same table
 * state. User-created (`source = 'personal'`) rows are never touched.
 *
 * Coverage score: per card, we count how many archetypes in the curated
 * dataset list this card. Higher score = more universal answer. Used by
 * the tech suggester to surface "generic staple" vs "niche silver bullet".
 */
import { eq, inArray } from "drizzle-orm";

import { db, schema } from "./client";
import { TECH_ANSWERS } from "./tech_answers_data";

export type SeedTechResult = {
  inserted: number;
  archetypes: number;
  missingCardNames: string[];
};

export async function seedTechAnswers(): Promise<SeedTechResult> {
  // Gather the full set of card names we need to resolve.
  const allNames = new Set<string>();
  for (const bucket of TECH_ANSWERS) {
    for (const a of bucket.answers) allNames.add(a.card);
  }

  if (allNames.size === 0) {
    await db
      .delete(schema.techAnswers)
      .where(eq(schema.techAnswers.source, "curated"));
    return { inserted: 0, archetypes: 0, missingCardNames: [] };
  }

  // Resolve names → ids from the synced catalog.
  const nameList = Array.from(allNames);
  const rows = await db
    .select({ id: schema.cards.id, name: schema.cards.name })
    .from(schema.cards)
    .where(inArray(schema.cards.name, nameList))
    .all();

  const nameToId = new Map<string, number>();
  for (const r of rows) nameToId.set(r.name, r.id);
  const missing = nameList.filter((n) => !nameToId.has(n));

  // Coverage score: how many archetypes does each card answer in our data?
  const coverageByName = new Map<string, number>();
  for (const bucket of TECH_ANSWERS) {
    const seenInBucket = new Set<string>();
    for (const a of bucket.answers) {
      if (seenInBucket.has(a.card)) continue;
      seenInBucket.add(a.card);
      coverageByName.set(
        a.card,
        (coverageByName.get(a.card) ?? 0) + 1,
      );
    }
  }

  // Build the row set, skipping unresolved names.
  const toInsert: {
    opponentArchetype: string;
    cardId: number;
    reason: string;
    priority: number;
    source: "curated";
    coverageScore: number;
  }[] = [];

  for (const bucket of TECH_ANSWERS) {
    for (const a of bucket.answers) {
      const id = nameToId.get(a.card);
      if (id === undefined) continue;
      toInsert.push({
        opponentArchetype: bucket.archetype,
        cardId: id,
        reason: a.reason,
        priority: a.priority,
        source: "curated",
        coverageScore: coverageByName.get(a.card) ?? 1,
      });
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.techAnswers)
      .where(eq(schema.techAnswers.source, "curated"));
    if (toInsert.length > 0) {
      await tx.insert(schema.techAnswers).values(toInsert);
    }
  });

  return {
    inserted: toInsert.length,
    archetypes: TECH_ANSWERS.length,
    missingCardNames: missing,
  };
}

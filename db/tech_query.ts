/**
 * Read-side queries for the tech suggester UI.
 *
 * Returns tech_answers rows joined to the cards catalog so the UI can show
 * the card name + thumbnail without a second roundtrip per row.
 *
 * Sort order: priority ascending (1 best), then coverage descending (more
 * universal answers bubble up within the same priority tier), then card
 * name for stable ties.
 */
import { asc, desc, eq } from "drizzle-orm";

import { db, schema } from "./client";

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

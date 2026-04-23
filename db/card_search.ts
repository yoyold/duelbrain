/**
 * Card search backed by SQLite LIKE. Fast enough for 14k-card catalog
 * (sub-50ms on phone). Optional section filter restricts to main-eligible
 * (everything not Fusion/Synchro/Xyz/Link) or extra-eligible.
 */
import { and, asc, like, or, sql } from "drizzle-orm";

import { db, schema } from "./client";
import { isExtraDeckType } from "./deck_ops";

const EXTRA_TYPE_LIKE_PATTERNS = ["%Fusion%", "%Synchro%", "%Xyz%", "%Link%"];

export type CardHit = {
  id: number;
  name: string;
  type: string;
  archetype: string | null;
  imageUrlSmall: string | null;
  imageUrlCropped: string | null;
  isExtra: boolean;
};

/** Search by name substring. Empty query returns top-N alphabetical.
 *  `sectionFilter`:
 *    - "main"  → excludes extra-deck types (user wants main/side cards)
 *    - "extra" → only extra-deck types
 *    - undefined → no filter
 */
export async function searchCards(
  q: string,
  sectionFilter?: "main" | "extra",
  limit = 50,
): Promise<CardHit[]> {
  const clauses = [];

  const trimmed = q.trim();
  if (trimmed) {
    clauses.push(like(schema.cards.name, `%${trimmed}%`));
  }

  if (sectionFilter === "extra") {
    clauses.push(
      or(...EXTRA_TYPE_LIKE_PATTERNS.map((p) => like(schema.cards.type, p))),
    );
  } else if (sectionFilter === "main") {
    // Exclude all extra-deck types.
    clauses.push(
      sql`NOT (${schema.cards.type} LIKE '%Fusion%' OR ${schema.cards.type} LIKE '%Synchro%' OR ${schema.cards.type} LIKE '%Xyz%' OR ${schema.cards.type} LIKE '%Link%')`,
    );
  }

  const rows = await db
    .select({
      id: schema.cards.id,
      name: schema.cards.name,
      type: schema.cards.type,
      archetype: schema.cards.archetype,
      imageUrlSmall: schema.cards.imageUrlSmall,
      imageUrlCropped: schema.cards.imageUrlCropped,
    })
    .from(schema.cards)
    .where(clauses.length ? and(...clauses) : undefined)
    .orderBy(asc(schema.cards.name))
    .limit(limit)
    .all();

  return rows.map((r) => ({ ...r, isExtra: isExtraDeckType(r.type) }));
}

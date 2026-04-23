/**
 * Fuzzy card matching from OCR output.
 *
 * The scanner OCRs the card and hands us a list of text blocks. The card
 * name is (almost) always the biggest top-third line, but OCR noise — stray
 * set codes, partial rarity stamps, foil glare — can shuffle that ranking.
 * So instead of trusting ordering, we treat every non-trivial line as a
 * candidate query and rank the catalog by how well each card's name
 * matches any line.
 *
 * Strategy:
 *   1. Per line, tokenize on word-boundaries, drop tokens ≤2 chars.
 *   2. Build a SQL disjunction of LIKE '%token%' across all tokens.
 *   3. Pull back a candidate pool (few hundred rows max).
 *   4. Score each candidate with a lightweight Jaro-Winkler-ish metric
 *      that rewards shared prefix + high character overlap, tolerates
 *      swapped/missing letters.
 *   5. Return top N by score, deduped by card id.
 *
 * Scales fine at 14k rows because step 2 narrows the pool heavily before
 * we ever score in JS. No trigram index needed at v1.
 */
import { or, like } from "drizzle-orm";

import { db, schema } from "./client";

export type MatchCandidate = {
  id: number;
  name: string;
  type: string;
  archetype: string | null;
  imageUrlSmall: string | null;
  imageUrlCropped: string | null;
  score: number; // 0..1, 1 = perfect
};

/** Normalize a string for comparison: lowercase, collapse whitespace, strip
 *  punctuation that OCR commonly drops or adds. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 2);
}

/** Bigram-overlap similarity, scaled 0..1. Cheap and forgiving of small
 *  OCR typos. For two short strings with identical content but one dropped
 *  character ("Ash Blosom" vs "Ash Blossom") returns ~0.9. */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

/** Bonus for shared prefix — cards whose name starts how the query starts
 *  are typically the correct read even when OCR trails off ("Ash Blo..."). */
function prefixBonus(query: string, candidate: string): number {
  const n = Math.min(query.length, candidate.length, 8);
  let i = 0;
  while (i < n && query[i] === candidate[i]) i++;
  return i / 8; // 0..1
}

export async function fuzzyMatchFromOcr(
  lines: string[],
  limit = 8,
): Promise<MatchCandidate[]> {
  // Collect unique tokens from all OCR lines.
  const tokens = new Set<string>();
  for (const line of lines) {
    for (const t of tokenize(line)) tokens.add(t);
  }
  if (tokens.size === 0) return [];

  // Build the SQL OR of LIKE %token% to narrow the pool.
  const clauses = Array.from(tokens).map((t) =>
    like(schema.cards.name, `%${t}%`),
  );

  const pool = await db
    .select({
      id: schema.cards.id,
      name: schema.cards.name,
      type: schema.cards.type,
      archetype: schema.cards.archetype,
      imageUrlSmall: schema.cards.imageUrlSmall,
      imageUrlCropped: schema.cards.imageUrlCropped,
    })
    .from(schema.cards)
    .where(clauses.length === 1 ? clauses[0] : or(...clauses))
    .limit(500)
    .all();

  if (pool.length === 0) return [];

  // Score each candidate against every OCR line; take best per candidate.
  const normalizedLines = lines.map(normalize).filter((l) => l.length >= 3);
  const scored: MatchCandidate[] = pool.map((c) => {
    const candNorm = normalize(c.name);
    let best = 0;
    for (const line of normalizedLines) {
      const sim = bigramSimilarity(line, candNorm);
      const bonus = prefixBonus(line, candNorm);
      const combined = sim * 0.8 + bonus * 0.2;
      if (combined > best) best = combined;
    }
    return { ...c, score: best };
  });

  scored.sort((a, b) => b.score - a.score);
  // Drop obviously-bad matches; keeps the picker focused.
  const filtered = scored.filter((c) => c.score >= 0.35);
  return filtered.slice(0, limit);
}


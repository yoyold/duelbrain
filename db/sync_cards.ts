/**
 * Card catalog sync from YGOPRODeck.
 *
 * One HTTP call pulls the entire card list (~14k cards, ~5 MB JSON). We slim
 * it to the fields we actually use, upsert into `cards`, and backfill the
 * `archetypes` table from distinct non-null archetypes.
 *
 * YGOPRODeck ToS: cache locally, don't hotlink. We only store image URLs, not
 * the binary images themselves. https://ygoprodeck.com/api-guide/
 *
 * Idempotent: ON CONFLICT DO UPDATE on card id, so repeat syncs just refresh.
 * Designed to be run manually (button in Decks tab), not on every boot.
 */
import { sql } from "drizzle-orm";

import { db, schema } from "./client";

const API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";

// SQLite's default SQLITE_MAX_VARIABLE_NUMBER is 32766 in modern builds, but
// we stay well under that for safety across platforms. 500 rows × 6 cols = 3000.
const CHUNK_SIZE = 500;

type RawCard = {
  id: number;
  name: string;
  type: string;
  archetype?: string;
  card_images?: { image_url?: string; image_url_small?: string; image_url_cropped?: string }[];
};

export type SyncProgress = {
  phase: "fetching" | "parsing" | "inserting" | "backfilling" | "done";
  /** 0..1, or null when indeterminate */
  ratio: number | null;
  /** total cards to insert; set once phase transitions to "inserting" */
  total?: number;
  /** rows inserted so far */
  done?: number;
};

export type SyncResult = {
  cardsUpserted: number;
  archetypesFound: number;
  durationMs: number;
};

export async function syncCardCatalog(
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const t0 = Date.now();

  onProgress?.({ phase: "fetching", ratio: null });
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`YGOPRODeck HTTP ${res.status}`);
  const payload = (await res.json()) as { data?: RawCard[] };

  onProgress?.({ phase: "parsing", ratio: null });
  const rawCards = payload.data ?? [];
  if (rawCards.length === 0) throw new Error("YGOPRODeck returned empty card list");

  const slim = rawCards
    .map((c) => {
      const img = c.card_images?.[0];
      if (!img) return null;
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        archetype: c.archetype ?? null,
        imageUrlCropped: img.image_url_cropped ?? null,
        imageUrlSmall: img.image_url_small ?? null,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Bulk upsert in chunks.
  onProgress?.({ phase: "inserting", ratio: 0, total: slim.length, done: 0 });
  let inserted = 0;
  for (let i = 0; i < slim.length; i += CHUNK_SIZE) {
    const chunk = slim.slice(i, i + CHUNK_SIZE);
    await db
      .insert(schema.cards)
      .values(chunk)
      .onConflictDoUpdate({
        target: schema.cards.id,
        set: {
          name: sql`excluded.name`,
          type: sql`excluded.type`,
          archetype: sql`excluded.archetype`,
          imageUrlCropped: sql`excluded.image_url_cropped`,
          imageUrlSmall: sql`excluded.image_url_small`,
          updatedAt: sql`(strftime('%s','now'))`,
        },
      });
    inserted += chunk.length;
    onProgress?.({
      phase: "inserting",
      ratio: inserted / slim.length,
      total: slim.length,
      done: inserted,
    });
  }

  // Backfill archetypes from the distinct archetype values now in cards.
  // Uses INSERT OR IGNORE against the unique name index so we never dup.
  onProgress?.({ phase: "backfilling", ratio: null });
  await db.run(sql`
    INSERT OR IGNORE INTO archetypes (name)
    SELECT DISTINCT archetype FROM cards
    WHERE archetype IS NOT NULL AND archetype != ''
  `);

  const archCount = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.archetypes)
    .get();

  onProgress?.({ phase: "done", ratio: 1 });
  return {
    cardsUpserted: inserted,
    archetypesFound: archCount?.n ?? 0,
    durationMs: Date.now() - t0,
  };
}

/** Current card count — for the Decks tab to show "N cards synced". */
export async function getCardCount(): Promise<number> {
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.cards)
    .get();
  return row?.n ?? 0;
}

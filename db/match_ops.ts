/**
 * Match + per-game CRUD.
 *
 * The match logger always inserts a synthetic G1 (carrying match-level
 * wentFirst/result/lossReason) so aggregate stats work without per-game
 * detail. The Match Detail screen lets the user:
 *   - edit that synthetic G1 to reflect the real Game 1,
 *   - add G2/G3 with their own wentFirst/result/lossReason,
 *   - delete games that were mis-entered.
 *
 * `match.result` stays user-editable and is NOT auto-derived from games.
 * Reason: in a Bo3 a 1-1 match can still be a draw or a judge call; we let
 * the human pick the final bucket. We do offer `deriveMatchResult()` for
 * callers that want a sanity check / auto-fill.
 */
import { asc, desc, eq } from "drizzle-orm";

import { db, schema } from "./client";
import type { LossReason } from "./loss_reason";

export type MatchResult = "win" | "loss" | "draw";

export type GameRow = {
  id: number;
  gameNumber: number;
  wentFirst: boolean;
  result: MatchResult;
  lossReason: LossReason | null;
  notes: string | null;
};

export type MatchDetail = {
  id: number;
  deckName: string;
  deckVersionId: number;
  versionLabel: string | null;
  opponentArchetype: string;
  wentFirst: boolean | null;
  result: MatchResult;
  event: string | null;
  notes: string | null;
  playedAt: number; // unix seconds
  games: GameRow[];
};

/** Load a single match with its games and enough deck context to display. */
export async function loadMatch(matchId: number): Promise<MatchDetail> {
  const row = await db
    .select({
      id: schema.matches.id,
      deckVersionId: schema.matches.deckVersionId,
      opponentArchetype: schema.matches.opponentArchetype,
      wentFirst: schema.matches.wentFirst,
      result: schema.matches.result,
      event: schema.matches.event,
      notes: schema.matches.notes,
      playedAt: schema.matches.playedAt,
      deckName: schema.decks.name,
      versionLabel: schema.deckVersions.versionLabel,
    })
    .from(schema.matches)
    .innerJoin(
      schema.deckVersions,
      eq(schema.deckVersions.id, schema.matches.deckVersionId),
    )
    .innerJoin(schema.decks, eq(schema.decks.id, schema.deckVersions.deckId))
    .where(eq(schema.matches.id, matchId))
    .limit(1)
    .get();
  if (!row) throw new Error(`Match ${matchId} not found`);

  const games = await db
    .select()
    .from(schema.games)
    .where(eq(schema.games.matchId, matchId))
    .orderBy(asc(schema.games.gameNumber))
    .all();

  return {
    id: row.id,
    deckName: row.deckName,
    deckVersionId: row.deckVersionId,
    versionLabel: row.versionLabel,
    opponentArchetype: row.opponentArchetype,
    wentFirst: row.wentFirst,
    result: row.result,
    event: row.event,
    notes: row.notes,
    playedAt: row.playedAt,
    games: games.map((g) => ({
      id: g.id,
      gameNumber: g.gameNumber,
      wentFirst: g.wentFirst,
      result: g.result,
      lossReason: g.lossReason,
      notes: g.notes,
    })),
  };
}

export type MatchListRow = {
  id: number;
  deckName: string;
  opponentArchetype: string;
  result: MatchResult;
  wentFirst: boolean | null;
  playedAt: number;
  gameCount: number;
};

/** Recent matches for the history list. Limit default 100; adjust when we
 *  add paging. */
export async function listRecentMatches(limit = 100): Promise<MatchListRow[]> {
  // One roundtrip for matches, then a second for per-match game counts.
  // SQLite doesn't need fancier joins at this scale.
  const rows = await db
    .select({
      id: schema.matches.id,
      opponentArchetype: schema.matches.opponentArchetype,
      result: schema.matches.result,
      wentFirst: schema.matches.wentFirst,
      playedAt: schema.matches.playedAt,
      deckName: schema.decks.name,
    })
    .from(schema.matches)
    .innerJoin(
      schema.deckVersions,
      eq(schema.deckVersions.id, schema.matches.deckVersionId),
    )
    .innerJoin(schema.decks, eq(schema.decks.id, schema.deckVersions.deckId))
    .orderBy(desc(schema.matches.playedAt))
    .limit(limit)
    .all();

  if (rows.length === 0) return [];

  // Count games per match in one query. In SQLite a GROUP BY with IN(...)
  // is fine for 100 ids.
  const counts = await db
    .select({ matchId: schema.games.matchId })
    .from(schema.games)
    .all();
  const countByMatch = new Map<number, number>();
  for (const c of counts) {
    countByMatch.set(c.matchId, (countByMatch.get(c.matchId) ?? 0) + 1);
  }

  return rows.map((r) => ({
    ...r,
    gameCount: countByMatch.get(r.id) ?? 0,
  }));
}

/** Add a game. Auto-assigns game_number as (max existing) + 1. */
export async function addGame(
  matchId: number,
  data: {
    wentFirst: boolean;
    result: MatchResult;
    lossReason: LossReason | null;
    notes?: string | null;
  },
): Promise<number> {
  const existing = await db
    .select({ gameNumber: schema.games.gameNumber })
    .from(schema.games)
    .where(eq(schema.games.matchId, matchId))
    .all();
  const nextNum =
    existing.length === 0
      ? 1
      : Math.max(...existing.map((g) => g.gameNumber)) + 1;

  const [inserted] = await db
    .insert(schema.games)
    .values({
      matchId,
      gameNumber: nextNum,
      wentFirst: data.wentFirst,
      result: data.result,
      lossReason: data.result === "loss" ? data.lossReason : null,
      notes: data.notes ?? null,
    })
    .returning();
  return inserted.id;
}

/** Update a game. lossReason auto-nulls on non-loss. */
export async function updateGame(
  gameId: number,
  data: {
    wentFirst: boolean;
    result: MatchResult;
    lossReason: LossReason | null;
    notes?: string | null;
  },
): Promise<void> {
  await db
    .update(schema.games)
    .set({
      wentFirst: data.wentFirst,
      result: data.result,
      lossReason: data.result === "loss" ? data.lossReason : null,
      notes: data.notes ?? null,
    })
    .where(eq(schema.games.id, gameId));
}

export async function deleteGame(gameId: number): Promise<void> {
  await db.delete(schema.games).where(eq(schema.games.id, gameId));
}

/** Update the match-level header fields (not the games). */
export async function updateMatchHeader(
  matchId: number,
  data: {
    opponentArchetype: string;
    wentFirst: boolean | null;
    result: MatchResult;
    event: string | null;
    notes: string | null;
  },
): Promise<void> {
  await db
    .update(schema.matches)
    .set({
      opponentArchetype: data.opponentArchetype,
      wentFirst: data.wentFirst,
      result: data.result,
      event: data.event,
      notes: data.notes,
    })
    .where(eq(schema.matches.id, matchId));
}

export async function deleteMatch(matchId: number): Promise<void> {
  // games cascade via FK (onDelete: "cascade").
  await db.delete(schema.matches).where(eq(schema.matches.id, matchId));
}

/** Derive the intended match result from a games list. Returns null when
 *  ambiguous (draw games, no decisive outcome). UI may use this as a hint
 *  or leave the user to pick. */
export function deriveMatchResult(games: Pick<GameRow, "result">[]): MatchResult | null {
  let w = 0,
    l = 0,
    d = 0;
  for (const g of games) {
    if (g.result === "win") w++;
    else if (g.result === "loss") l++;
    else d++;
  }
  if (d > 0 && w === l) return "draw";
  if (w > l) return "win";
  if (l > w) return "loss";
  return null;
}


/**
 * Tiny in-memory channel from the scanner screen back to whatever screen
 * launched it. Used because expo-router navigation params are one-way
 * and don't survive the back-pop we do after picking a candidate.
 *
 * Not persistence. Not state management. Just a single pending slot plus
 * subscribers. Scanner writes, deck editor reads-and-clears on focus.
 */
export type PickedScan = {
  cardId: number;
  cardName: string;
  section: "main" | "extra" | "side";
};

let pending: PickedScan | null = null;
const listeners = new Set<() => void>();

export function setPendingScan(p: PickedScan): void {
  pending = p;
  for (const fn of listeners) fn();
}

export function consumePendingScan(): PickedScan | null {
  const p = pending;
  pending = null;
  return p;
}

export function subscribeScan(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

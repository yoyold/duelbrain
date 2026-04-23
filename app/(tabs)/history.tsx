/**
 * Match history. Scrollable list of recent matches, newest first. Tap to
 * open the match detail editor (per-game CRUD).
 *
 * Intentionally lean: no filters, no search, no paging. Adding when the
 * list gets long enough in real usage to warrant it.
 */
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { palette, resultColor } from "@/constants/theme";
import { listRecentMatches, type MatchListRow } from "@/db/match_ops";

export default function HistoryScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<MatchListRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setRows(await listRecentMatches(200));
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: 12 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/match/${item.id}`)}
          >
            <View style={styles.left}>
              <Text style={styles.date}>{formatDate(item.playedAt)}</Text>
              <Text style={styles.main} numberOfLines={1}>
                {item.deckName} vs {item.opponentArchetype}
              </Text>
              <Text style={styles.meta}>
                {item.wentFirst === null
                  ? "turn unknown"
                  : item.wentFirst
                    ? "went 1st"
                    : "went 2nd"}
                {" · "}
                {item.gameCount} game{item.gameCount === 1 ? "" : "s"}
              </Text>
            </View>
            <ResultBadge result={item.result} />
          </Pressable>
        )}
        ListEmptyComponent={
          loaded ? (
            <Text style={styles.empty}>
              No matches yet. Log your first one on the Log tab.
            </Text>
          ) : null
        }
      />
    </View>
  );
}

function ResultBadge({ result }: { result: "win" | "loss" | "draw" }) {
  const color = resultColor(result);
  const letter = result === "win" ? "W" : result === "loss" ? "L" : "D";
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{letter}</Text>
    </View>
  );
}

function formatDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `Today ${d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: palette.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  left: { flex: 1, paddingRight: 12 },
  date: {
    fontSize: 11,
    color: palette.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "700",
  },
  main: { fontSize: 15, fontWeight: "700", marginTop: 4, color: palette.text },
  meta: { fontSize: 12, color: palette.textMuted, marginTop: 4 },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: palette.textOnAccent, fontWeight: "800", fontSize: 16 },
  empty: { padding: 32, textAlign: "center", color: palette.textMuted },
});

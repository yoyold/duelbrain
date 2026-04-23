/**
 * Stats dashboard. v1: plain numbers per archetype, split on went_first.
 * Charts land in v2 once match volume is meaningful.
 */
import { sql } from "drizzle-orm";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { palette } from "@/constants/theme";
import { db, schema } from "@/db/client";

type Row = {
  opponent: string;
  total: number;
  wins: number;
  wentFirstTotal: number;
  wentFirstWins: number;
};

export default function StatsScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const data = await db
          .select({
            opponent: schema.matches.opponentArchetype,
            total: sql<number>`count(*)`,
            wins: sql<number>`sum(case when ${schema.matches.result} = 'win' then 1 else 0 end)`,
            wentFirstTotal: sql<number>`sum(case when ${schema.matches.wentFirst} = 1 then 1 else 0 end)`,
            wentFirstWins: sql<number>`sum(case when ${schema.matches.wentFirst} = 1 and ${schema.matches.result} = 'win' then 1 else 0 end)`,
          })
          .from(schema.matches)
          .groupBy(schema.matches.opponentArchetype)
          .orderBy(sql`count(*) desc`)
          .all();
        setRows(data);
        setTotal(data.reduce((s, r) => s + r.total, 0));
      })();
    }, []),
  );

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Matches logged</Text>
        <Text style={styles.heroNumber}>{total}</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.opponent}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const wr = item.total ? Math.round((100 * item.wins) / item.total) : 0;
          const wfWr = item.wentFirstTotal
            ? Math.round((100 * item.wentFirstWins) / item.wentFirstTotal)
            : null;
          const ws = item.total - item.wentFirstTotal;
          const wsWins = item.wins - item.wentFirstWins;
          const wsWr = ws ? Math.round((100 * wsWins) / ws) : null;
          return (
            <View style={styles.row}>
              <Text style={styles.opponent}>{item.opponent}</Text>
              <View style={styles.metrics}>
                <Metric label="overall" value={`${wr}%`} sub={`${item.wins}/${item.total}`} />
                <Metric
                  label="1st"
                  value={wfWr === null ? "—" : `${wfWr}%`}
                  sub={`${item.wentFirstWins}/${item.wentFirstTotal}`}
                />
                <Metric
                  label="2nd"
                  value={wsWr === null ? "—" : `${wsWr}%`}
                  sub={`${wsWins}/${ws}`}
                />
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Log your first match and stats will appear here.
          </Text>
        }
      />
    </View>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={{ alignItems: "center", minWidth: 60 }}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricSub}>{sub}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  hero: {
    padding: 28,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  heroLabel: {
    fontSize: 12,
    color: palette.gold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "700",
  },
  heroNumber: {
    fontSize: 44,
    fontWeight: "800",
    color: palette.gold,
    marginTop: 6,
    letterSpacing: 1,
  },
  row: {
    padding: 14,
    backgroundColor: palette.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  opponent: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 12,
    color: palette.text,
  },
  metrics: { flexDirection: "row", justifyContent: "space-around" },
  metricValue: { fontSize: 20, fontWeight: "800", color: palette.text },
  metricSub: { fontSize: 11, color: palette.textMuted, marginTop: 2 },
  metricLabel: {
    fontSize: 10,
    color: palette.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "700",
    marginTop: 2,
  },
  empty: { padding: 24, textAlign: "center", color: palette.textMuted },
});

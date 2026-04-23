/**
 * Stats dashboard. v1: plain numbers per archetype, split on went_first.
 * Charts land in v2 once match volume is meaningful.
 */
import { eq, sql } from "drizzle-orm";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

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
  root: { flex: 1 },
  hero: {
    padding: 24,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  heroLabel: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.4 },
  heroNumber: { fontSize: 40, fontWeight: "800" },
  row: {
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  opponent: { fontSize: 15, fontWeight: "600", marginBottom: 10 },
  metrics: { flexDirection: "row", justifyContent: "space-around" },
  metricValue: { fontSize: 18, fontWeight: "700" },
  metricSub: { fontSize: 11, color: "#888" },
  metricLabel: { fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 0.4 },
  empty: { padding: 24, textAlign: "center", color: "#888" },
});

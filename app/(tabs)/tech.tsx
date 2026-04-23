/**
 * Tech suggester. Pick an opponent archetype, get a ranked list of cards
 * that counter it with the reasoning spelled out.
 *
 * Data comes from the curated tech_answers table (seeded during catalog
 * sync). When the user logs a match, the logger deep-links here with
 * ?archetype=... so the picker is pre-populated.
 *
 * v1 UI stays deliberately flat: picker modal on top, scrollable answer
 * list below. No "in your deck already" badges yet — needs deck-cards
 * cross-join; deferred until we have evidence the feature is used.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  listArchetypesWithTech,
  listTechForArchetype,
  type TechPick,
} from "@/db/tech_query";

export default function TechScreen() {
  const params = useLocalSearchParams<{ archetype?: string }>();
  const router = useRouter();

  const [archetype, setArchetype] = useState<string | null>(null);
  const [picks, setPicks] = useState<TechPick[]>([]);
  const [available, setAvailable] = useState<{ archetype: string; count: number }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (a: string | null) => {
    setAvailable(await listArchetypesWithTech());
    if (a) {
      setPicks(await listTechForArchetype(a));
    } else {
      setPicks([]);
    }
    setLoaded(true);
  }, []);

  // Respond to ?archetype= deep links (match logger, history, etc).
  useEffect(() => {
    if (params.archetype && params.archetype !== archetype) {
      setArchetype(params.archetype);
    }
  }, [params.archetype, archetype]);

  // Refresh on focus (catalog might have re-seeded tech answers).
  useFocusEffect(
    useCallback(() => {
      reload(archetype);
    }, [reload, archetype]),
  );

  return (
    <View style={styles.root}>
      <Pressable style={styles.picker} onPress={() => setPickerOpen(true)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pickerLabel}>Opponent</Text>
          <Text style={styles.pickerValue}>
            {archetype ?? "Pick an archetype..."}
          </Text>
        </View>
        <Text style={styles.pickerHint}>change</Text>
      </Pressable>

      {archetype ? (
        <FlatList
          data={picks}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => <TechRow pick={item} />}
          ListEmptyComponent={
            loaded ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>
                  No tech answers for "{archetype}"
                </Text>
                <Text style={styles.emptyBody}>
                  Either the card catalog isn't synced yet, or this archetype
                  isn't in the curated dataset. Try syncing the catalog on the
                  Decks tab, or pick a different archetype.
                </Text>
              </View>
            ) : null
          }
        />
      ) : (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>Pick an archetype to see tech picks.</Text>
          <Text style={styles.emptyBody}>
            The curated dataset covers {available.length} archetype
            {available.length === 1 ? "" : "s"} so far. Re-sync the catalog to
            refresh.
          </Text>
        </View>
      )}

      <ArchetypePickerModal
        visible={pickerOpen}
        options={available}
        current={archetype}
        onClose={() => setPickerOpen(false)}
        onPick={(a) => {
          setPickerOpen(false);
          setArchetype(a);
          // Keep the URL param in sync so refresh stays on the same archetype.
          router.setParams({ archetype: a });
        }}
      />
    </View>
  );
}

// ---------- Row ----------

function TechRow({ pick }: { pick: TechPick }) {
  const priorityColor =
    pick.priority === 1
      ? "#2a8a4d"
      : pick.priority === 2
        ? "#3a6bd9"
        : pick.priority <= 3
          ? "#b77a1a"
          : "#888";

  return (
    <View style={styles.row}>
      {pick.imageUrlSmall ? (
        <Image source={{ uri: pick.imageUrlSmall }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={{ color: "#888", fontSize: 10 }}>no img</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text style={styles.rowName} numberOfLines={1}>
            {pick.cardName}
          </Text>
          <View style={[styles.priorityPill, { backgroundColor: priorityColor }]}>
            <Text style={styles.priorityText}>P{pick.priority}</Text>
          </View>
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {pick.cardType}
          {pick.coverageScore != null
            ? ` · answers ${pick.coverageScore} matchup${
                pick.coverageScore === 1 ? "" : "s"
              }`
            : ""}
          {pick.source !== "curated" ? ` · ${pick.source}` : ""}
        </Text>
        <Text style={styles.rowReason}>{pick.reason}</Text>
      </View>
    </View>
  );
}

// ---------- Picker modal ----------

function ArchetypePickerModal({
  visible,
  options,
  current,
  onClose,
  onPick,
}: {
  visible: boolean;
  options: { archetype: string; count: number }[];
  current: string | null;
  onClose: () => void;
  onPick: (archetype: string) => void;
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (visible) setQ("");
  }, [visible]);

  const filtered = useMemo(() => {
    if (!q.trim()) return options;
    const n = q.toLowerCase();
    return options.filter((o) => o.archetype.toLowerCase().includes(n));
  }, [q, options]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Pick opponent</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.modalClose}>Done</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.modalInput}
          placeholder="Filter..."
          value={q}
          onChangeText={setQ}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
        />
        <FlatList
          data={filtered}
          keyExtractor={(a) => a.archetype}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={[
                styles.modalRow,
                item.archetype === current && styles.modalRowActive,
              ]}
              onPress={() => onPick(item.archetype)}
            >
              <Text style={styles.modalRowName}>{item.archetype}</Text>
              <Text style={styles.modalRowCount}>
                {item.count} pick{item.count === 1 ? "" : "s"}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.modalEmpty}>
              {options.length === 0
                ? "No curated archetypes. Sync the catalog on the Decks tab."
                : "No matches for that filter."}
            </Text>
          }
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fafafa" },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e9f0",
    backgroundColor: "#f5f7fb",
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  pickerValue: { fontSize: 16, fontWeight: "600", marginTop: 2 },
  pickerHint: { fontSize: 12, color: "#3a6bd9", fontWeight: "600" },
  row: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e9f0",
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: "#f0f0f0",
  },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1 },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowName: { fontSize: 15, fontWeight: "600", flex: 1, paddingRight: 8 },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  priorityText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  rowMeta: { fontSize: 12, color: "#888", marginTop: 2 },
  rowReason: { fontSize: 13, color: "#333", marginTop: 6, lineHeight: 18 },
  emptyBlock: { padding: 24 },
  emptyTitle: { fontSize: 15, fontWeight: "600", marginBottom: 6 },
  emptyBody: { fontSize: 13, color: "#666", lineHeight: 19 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalTitle: { fontSize: 17, fontWeight: "700" },
  modalClose: { fontSize: 16, color: "#3a6bd9", fontWeight: "600" },
  modalInput: {
    margin: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    fontSize: 16,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f3f3",
  },
  modalRowActive: { backgroundColor: "#eef3fb" },
  modalRowName: { fontSize: 15, fontWeight: "500" },
  modalRowCount: { fontSize: 12, color: "#888" },
  modalEmpty: { padding: 24, textAlign: "center", color: "#888" },
});

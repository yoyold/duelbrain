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
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { palette } from "@/constants/theme";
import {
  listArchetypesWithLossHistory,
  listArchetypesWithTech,
  loadTechSuggestions,
  type TechPick,
} from "@/db/tech_query";

export default function TechScreen() {
  const params = useLocalSearchParams<{ archetype?: string }>();
  const router = useRouter();

  const [archetype, setArchetype] = useState<string | null>(null);
  const [curated, setCurated] = useState<TechPick[]>([]);
  const [personal, setPersonal] = useState<TechPick[]>([]);
  const [available, setAvailable] = useState<{ archetype: string; count: number }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (a: string | null) => {
    // Picker options = union of archetypes with curated picks + archetypes
    // the user has actually lost actionable games to. Merge counts so the
    // most-relevant matchups surface first.
    const [curatedOpts, personalOpts] = await Promise.all([
      listArchetypesWithTech(),
      listArchetypesWithLossHistory(),
    ]);
    const merged = new Map<string, number>();
    for (const o of curatedOpts) merged.set(o.archetype, o.count);
    for (const o of personalOpts) {
      merged.set(o.archetype, (merged.get(o.archetype) ?? 0) + o.count);
    }
    setAvailable(
      Array.from(merged.entries())
        .map(([archetype, count]) => ({ archetype, count }))
        .sort((x, y) =>
          y.count !== x.count ? y.count - x.count : x.archetype.localeCompare(y.archetype),
        ),
    );

    if (a) {
      const { curated: c, personal: p } = await loadTechSuggestions(a);
      setCurated(c);
      setPersonal(p);
    } else {
      setCurated([]);
      setPersonal([]);
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
        (() => {
          const sections: { title: string; subtitle: string; data: TechPick[] }[] = [];
          if (curated.length > 0) {
            sections.push({
              title: "Curated picks",
              subtitle: "hand-seeded answers for this matchup",
              data: curated,
            });
          }
          if (personal.length > 0) {
            sections.push({
              title: "From your losses",
              subtitle: "mined from your own loss_reason history",
              data: personal,
            });
          }
          if (sections.length === 0 && loaded) {
            return (
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>
                  No tech answers for "{archetype}"
                </Text>
                <Text style={styles.emptyBody}>
                  Nothing is curated for this archetype yet, and you haven't
                  logged any losses with a fixable loss_reason against them.
                  Try syncing the catalog on the Decks tab, or come back after
                  logging a few losses with the game-level reason set.
                </Text>
              </View>
            );
          }
          return (
            <SectionList
              sections={sections}
              keyExtractor={(p) => String(p.id)}
              contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                  <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
                </View>
              )}
              renderItem={({ item }) => <TechRow pick={item} />}
            />
          );
        })()
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
      ? palette.win
      : pick.priority === 2
        ? palette.gold
        : pick.priority <= 3
          ? palette.warn
          : palette.draw;

  return (
    <View style={styles.row}>
      {pick.imageUrlSmall ? (
        <Image source={{ uri: pick.imageUrlSmall }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback]}>
          <Text style={{ color: palette.textDim, fontSize: 10 }}>no img</Text>
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
          {pick.source === "personal"
            ? pick.coverageScore != null
              ? ` · ${pick.coverageScore} loss${pick.coverageScore === 1 ? "" : "es"} tagged`
              : ""
            : pick.coverageScore != null
              ? ` · answers ${pick.coverageScore} matchup${pick.coverageScore === 1 ? "" : "s"}`
              : ""}
          {pick.source === "meta_mined" ? " · meta-mined" : ""}
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
          placeholderTextColor={palette.textDim}
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
  root: { flex: 1, backgroundColor: palette.bg },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: palette.gold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  pickerValue: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
    color: palette.text,
  },
  pickerHint: {
    fontSize: 11,
    color: palette.gold,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHeader: {
    paddingTop: 8,
    paddingBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.gold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: palette.textDim,
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    backgroundColor: palette.surface,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 6,
    marginRight: 12,
    backgroundColor: palette.surfaceElevated,
  },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1 },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowName: {
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
    paddingRight: 8,
    color: palette.text,
  },
  priorityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  priorityText: { color: palette.textOnAccent, fontSize: 11, fontWeight: "800" },
  rowMeta: { fontSize: 12, color: palette.textMuted, marginTop: 2 },
  rowReason: {
    fontSize: 13,
    color: palette.text,
    marginTop: 6,
    lineHeight: 18,
  },
  emptyBlock: { padding: 24 },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 6,
    color: palette.text,
  },
  emptyBody: { fontSize: 13, color: palette.textMuted, lineHeight: 19 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: palette.gold,
    letterSpacing: 0.3,
  },
  modalClose: { fontSize: 16, color: palette.gold, fontWeight: "700" },
  modalInput: {
    margin: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
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
    borderBottomColor: palette.border,
    backgroundColor: palette.bg,
  },
  modalRowActive: { backgroundColor: palette.surfaceActive },
  modalRowName: { fontSize: 15, fontWeight: "600", color: palette.text },
  modalRowCount: { fontSize: 12, color: palette.textMuted },
  modalEmpty: { padding: 24, textAlign: "center", color: palette.textMuted },
});

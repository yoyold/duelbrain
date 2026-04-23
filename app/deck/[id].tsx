/**
 * Deck editor. Loads the current version's card list, lets the user
 * add/remove/adjust copies, and saves as a new version on commit.
 *
 * Scope v1:
 *  - No deck-legality validation (main >= 40, extra <= 15, side <= 15, copies <= 3).
 *    Shown as warnings/counts but don't block save.
 *  - No card preview images in-row (uses name only) for list perf. Search
 *    modal shows image thumbnails.
 *  - No drag-to-reorder.
 */
import { eq } from "drizzle-orm";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { searchCards, type CardHit } from "@/db/card_search";
import { db, schema } from "@/db/client";
import {
  getCurrentVersion,
  isExtraDeckType,
  loadDeckCards,
  saveAsNewVersion,
  type DeckCardRow,
} from "@/db/deck_ops";
import { consumePendingScan } from "@/db/scan_bridge";

type Section = "main" | "extra" | "side";

export default function DeckEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckId = Number(id);
  const router = useRouter();

  const [deckName, setDeckName] = useState("");
  const [versionLabel, setVersionLabel] = useState<string | null>(null);
  const [cards, setCards] = useState<DeckCardRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [searching, setSearching] = useState<Section | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const deck = await db
      .select()
      .from(schema.decks)
      .where(eq(schema.decks.id, deckId))
      .limit(1)
      .get();
    if (!deck) throw new Error(`Deck ${deckId} not found`);
    setDeckName(deck.name);
    const ver = await getCurrentVersion(deckId);
    setVersionLabel(ver.label);
    setCards(await loadDeckCards(ver.id));
    setDirty(false);
  }, [deckId]);

  useEffect(() => {
    load().catch((e) => Alert.alert("Failed to load deck", String(e?.message ?? e)));
  }, [load]);

  // When we return from the scanner, pick up whatever it dropped in the
  // bridge and add it to the target section. Runs on focus so it fires both
  // on first mount (no-op) and on scanner back-pop.
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingScan();
      if (!pending) return;
      (async () => {
        const card = await db
          .select({
            id: schema.cards.id,
            name: schema.cards.name,
            type: schema.cards.type,
            archetype: schema.cards.archetype,
            imageUrlSmall: schema.cards.imageUrlSmall,
            imageUrlCropped: schema.cards.imageUrlCropped,
          })
          .from(schema.cards)
          .where(eq(schema.cards.id, pending.cardId))
          .limit(1)
          .get();
        if (!card) return;
        // Reject mismatches: a scanned Fusion going into Main would be
        // silently wrong. The scanner doesn't enforce this.
        const targetIsExtra = pending.section === "extra";
        const cardIsExtra = isExtraDeckType(card.type);
        if (targetIsExtra !== cardIsExtra && pending.section !== "side") {
          Alert.alert(
            "Wrong section",
            `${card.name} is ${cardIsExtra ? "an Extra-deck" : "a Main-deck"} card — can't add it to ${pending.section}.`,
          );
          return;
        }
        addCard(
          {
            id: card.id,
            name: card.name,
            type: card.type,
            archetype: card.archetype,
            imageUrlSmall: card.imageUrlSmall,
            imageUrlCropped: card.imageUrlCropped,
            isExtra: cardIsExtra,
          },
          pending.section,
        );
      })().catch((e) => Alert.alert("Scan add failed", String(e?.message ?? e)));
    }, []),
  );

  const counts = useMemo(() => {
    const out = { main: 0, extra: 0, side: 0 };
    for (const c of cards) out[c.section] += c.copies;
    return out;
  }, [cards]);

  const grouped = useMemo(() => {
    const g: Record<Section, DeckCardRow[]> = { main: [], extra: [], side: [] };
    for (const c of cards) g[c.section].push(c);
    return g;
  }, [cards]);

  const adjustCopies = (cardId: number, section: Section, delta: number) => {
    setCards((prev) => {
      const out: DeckCardRow[] = [];
      for (const row of prev) {
        if (row.cardId === cardId && row.section === section) {
          const next = row.copies + delta;
          if (next > 0) out.push({ ...row, copies: Math.min(next, 3) });
          // else drop
        } else {
          out.push(row);
        }
      }
      return out;
    });
    setDirty(true);
  };

  const addCard = (hit: CardHit, section: Section) => {
    setCards((prev) => {
      const idx = prev.findIndex(
        (r) => r.cardId === hit.id && r.section === section,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          copies: Math.min(next[idx].copies + 1, 3),
        };
        return next;
      }
      return [
        ...prev,
        {
          cardId: hit.id,
          name: hit.name,
          type: hit.type,
          section,
          copies: 1,
          imageUrlSmall: hit.imageUrlSmall,
          imageUrlCropped: hit.imageUrlCropped,
        },
      ];
    });
    setDirty(true);
  };

  const onSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await saveAsNewVersion(
        deckId,
        cards.map(({ cardId, section, copies }) => ({ cardId, section, copies })),
      );
      await load();
      Alert.alert("Saved", "Deck saved as a new version. Match stats on earlier versions are preserved.");
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const onBack = () => {
    if (dirty) {
      Alert.alert("Unsaved changes", "Discard changes and go back?", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => router.back() },
      ]);
    } else {
      router.back();
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: deckName || "Deck",
          headerBackTitle: "Decks",
          headerLeft: () => (
            <Pressable onPress={onBack} style={{ paddingHorizontal: 8 }}>
              <Text style={{ color: "#3a6bd9", fontSize: 16 }}>Back</Text>
            </Pressable>
          ),
          headerRight: () =>
            dirty ? (
              <Pressable onPress={onSave} disabled={saving} style={{ paddingHorizontal: 8 }}>
                <Text style={{ color: saving ? "#999" : "#2a8a4d", fontSize: 16, fontWeight: "700" }}>
                  {saving ? "Saving..." : "Save"}
                </Text>
              </Pressable>
            ) : null,
        }}
      />

      <View style={styles.root}>
        <Text style={styles.subhead}>
          {versionLabel ?? "v1"}
          {dirty ? " · unsaved" : ""}
        </Text>

        <FlatList
          data={(["main", "extra", "side"] as Section[]).flatMap((s) => [
            { kind: "header" as const, section: s, count: counts[s] },
            ...grouped[s].map((c) => ({ kind: "card" as const, ...c })),
            { kind: "add" as const, section: s },
          ])}
          keyExtractor={(item, idx) =>
            item.kind === "card"
              ? `c-${item.cardId}-${item.section}`
              : `${item.kind}-${item.section}-${idx}`
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          renderItem={({ item }) => {
            if (item.kind === "header") {
              const limit = item.section === "main" ? "40–60" : "≤15";
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{titleFor(item.section)}</Text>
                  <Text style={styles.sectionCount}>
                    {item.count} <Text style={styles.sectionLimit}>/ {limit}</Text>
                  </Text>
                </View>
              );
            }
            if (item.kind === "add") {
              return (
                <Pressable
                  style={styles.addBtn}
                  onPress={() => setSearching(item.section)}
                >
                  <Text style={styles.addBtnText}>+ Add to {titleFor(item.section).toLowerCase()}</Text>
                </Pressable>
              );
            }
            return (
              <View style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardType}>{item.type}</Text>
                </View>
                <View style={styles.copiesGroup}>
                  <Pressable
                    style={styles.copiesBtn}
                    onPress={() => adjustCopies(item.cardId, item.section, -1)}
                  >
                    <Text style={styles.copiesBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.copiesText}>{item.copies}</Text>
                  <Pressable
                    style={[styles.copiesBtn, item.copies >= 3 && styles.copiesBtnDisabled]}
                    onPress={() => adjustCopies(item.cardId, item.section, +1)}
                    disabled={item.copies >= 3}
                  >
                    <Text style={styles.copiesBtnText}>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      </View>

      <CardSearchModal
        visible={searching !== null}
        section={searching}
        onClose={() => setSearching(null)}
        onPick={(hit) => {
          if (searching) addCard(hit, searching);
        }}
      />
    </>
  );
}

function titleFor(s: Section): string {
  return s === "main" ? "Main" : s === "extra" ? "Extra" : "Side";
}

// ---------- Card search modal ----------

function CardSearchModal({
  visible,
  section,
  onClose,
  onPick,
}: {
  visible: boolean;
  section: Section | null;
  onClose: () => void;
  onPick: (hit: CardHit) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CardHit[]>([]);
  const [loading, setLoading] = useState(false);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setQ("");
      setHits([]);
    }
  }, [visible]);

  // Debounced search
  useEffect(() => {
    if (!visible || !section) return;
    const filter = section === "extra" ? "extra" : "main";
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchCards(q, filter, 50);
        setHits(r);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q, visible, section]);

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
          <Text style={styles.modalTitle}>
            Add to {section ? titleFor(section).toLowerCase() : ""}
          </Text>
          <Pressable onPress={onClose}>
            <Text style={styles.modalClose}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.modalSearchRow}>
          <TextInput
            style={[styles.modalInput, { flex: 1, margin: 0 }]}
            placeholder={section === "side" ? "Search any card..." : "Search cards..."}
            value={q}
            onChangeText={setQ}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
          />
          <Pressable
            style={styles.scanBtn}
            onPress={() => {
              if (!section) return;
              // Close the modal first so the back-pop from scanner lands on
              // the deck editor, not on a stale modal.
              onClose();
              router.push({ pathname: "/scan", params: { section } });
            }}
          >
            <Text style={styles.scanBtnText}>📷</Text>
          </Pressable>
        </View>
        <FlatList
          data={hits}
          keyExtractor={(h) => String(h.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.hitRow}
              onPress={() => {
                onPick(item);
                // stay open so user can add multiple without re-typing
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.hitName}>{item.name}</Text>
                <Text style={styles.hitMeta}>
                  {item.type}
                  {item.archetype ? ` · ${item.archetype}` : ""}
                </Text>
              </View>
              <Text style={styles.hitAdd}>+</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={styles.modalEmpty}>
              {loading
                ? "Searching..."
                : q
                  ? "No matches."
                  : "Start typing to search the catalog."}
            </Text>
          }
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fafafa" },
  subhead: {
    paddingHorizontal: 16,
    paddingTop: 8,
    fontSize: 12,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700" },
  sectionCount: { fontSize: 16, fontWeight: "600" },
  sectionLimit: { fontSize: 12, color: "#888", fontWeight: "400" },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 6,
  },
  cardName: { fontSize: 15, fontWeight: "500" },
  cardType: { fontSize: 11, color: "#888", marginTop: 2 },
  copiesGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  copiesBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#eef3fb",
    alignItems: "center",
    justifyContent: "center",
  },
  copiesBtnDisabled: { opacity: 0.4 },
  copiesBtnText: { fontSize: 18, fontWeight: "700", color: "#3a6bd9" },
  copiesText: { fontSize: 16, fontWeight: "700", minWidth: 18, textAlign: "center" },
  addBtn: {
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccd",
    borderStyle: "dashed",
    borderRadius: 8,
    marginBottom: 4,
    marginTop: 4,
  },
  addBtnText: { color: "#3a6bd9", fontWeight: "600" },
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
  modalSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  scanBtn: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "#3a6bd9",
    alignItems: "center",
    justifyContent: "center",
  },
  scanBtnText: { fontSize: 22 },
  hitRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f3f3",
  },
  hitName: { fontSize: 15, fontWeight: "500" },
  hitMeta: { fontSize: 12, color: "#888", marginTop: 2 },
  hitAdd: { fontSize: 22, color: "#3a6bd9", fontWeight: "700", paddingLeft: 12 },
  modalEmpty: { padding: 24, textAlign: "center", color: "#888" },
});

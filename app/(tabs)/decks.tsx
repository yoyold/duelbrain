/**
 * Deck list. Shows each deck's current version. Tap a row to edit. The
 * "+ New deck" button creates an empty v1 and opens the editor.
 *
 * Also hosts the "Sync card catalog" button, which is the only place in v1
 * that cares about the YGOPRODeck data.
 */
import { eq } from "drizzle-orm";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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

import { db, schema } from "@/db/client";
import { createDeck } from "@/db/deck_ops";
import { getCardCount, syncCardCatalog, type SyncProgress } from "@/db/sync_cards";

type DeckRow = {
  id: number;
  name: string;
  versionLabel: string | null;
  versionId: number;
  isCurrent: boolean;
};

export default function DecksScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<DeckRow[]>([]);
  const [cardCount, setCardCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [newDeckOpen, setNewDeckOpen] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const data = await db
      .select({
        id: schema.decks.id,
        name: schema.decks.name,
        versionLabel: schema.deckVersions.versionLabel,
        versionId: schema.deckVersions.id,
        isCurrent: schema.deckVersions.isCurrent,
      })
      .from(schema.decks)
      .innerJoin(
        schema.deckVersions,
        eq(schema.deckVersions.deckId, schema.decks.id),
      )
      .where(eq(schema.deckVersions.isCurrent, true))
      .all();
    setRows(data);
    setCardCount(await getCardCount());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setProgress({ phase: "fetching", ratio: null });
    try {
      const result = await syncCardCatalog((p) => setProgress(p));
      await refresh();
      const missingNote =
        result.techAnswersMissing.length > 0
          ? `\n\nUnresolved tech names: ${result.techAnswersMissing.slice(0, 5).join(", ")}${result.techAnswersMissing.length > 5 ? ` (+${result.techAnswersMissing.length - 5} more)` : ""}`
          : "";
      Alert.alert(
        "Sync complete",
        `${result.cardsUpserted.toLocaleString()} cards · ${result.archetypesFound} archetypes · ${result.techAnswersInserted} tech answers\n${(result.durationMs / 1000).toFixed(1)}s${missingNote}`,
      );
    } catch (e: any) {
      Alert.alert("Sync failed", String(e?.message ?? e));
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  };

  const onCreateDeck = async () => {
    const name = newDeckName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const id = await createDeck(name);
      setNewDeckOpen(false);
      setNewDeckName("");
      router.push(`/deck/${id}`);
    } catch (e: any) {
      Alert.alert("Create failed", String(e?.message ?? e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Catalog banner */}
      <View style={styles.banner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Card catalog</Text>
          <Text style={styles.bannerSub}>
            {cardCount === null
              ? "…"
              : cardCount === 0
                ? "Not synced yet"
                : `${cardCount.toLocaleString()} cards synced`}
          </Text>
          {progress && (
            <Text style={styles.progressText}>{formatProgress(progress)}</Text>
          )}
        </View>
        <Pressable
          style={[styles.syncBtn, syncing && styles.syncBtnBusy]}
          onPress={onSync}
          disabled={syncing}
        >
          <Text style={styles.syncBtnText}>
            {syncing ? "Syncing..." : cardCount ? "Re-sync" : "Sync now"}
          </Text>
        </Pressable>
      </View>

      {/* New deck toolbar */}
      <View style={styles.toolbar}>
        <Pressable
          style={styles.newBtn}
          onPress={() => {
            setNewDeckName("");
            setNewDeckOpen(true);
          }}
        >
          <Text style={styles.newBtnText}>+ New deck</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.versionId)}
        contentContainerStyle={{ padding: 16 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable
            style={styles.deck}
            onPress={() => router.push(`/deck/${item.id}`)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.deckName}>{item.name}</Text>
              <Text style={styles.deckMeta}>
                {item.versionLabel ?? "v1"}
                {item.isCurrent ? " · current" : ""}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            No decks yet. Tap "+ New deck" to create one.
          </Text>
        }
      />

      {/* New-deck prompt modal (cross-platform; iOS Alert.prompt isn't on Android) */}
      <Modal
        visible={newDeckOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setNewDeckOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New deck</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Deck name (e.g. Snake-Eye)"
              value={newDeckName}
              onChangeText={setNewDeckName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onCreateDeck}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalBtnGhost}
                onPress={() => setNewDeckOpen(false)}
                disabled={creating}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalBtn,
                  (!newDeckName.trim() || creating) && styles.modalBtnDisabled,
                ]}
                onPress={onCreateDeck}
                disabled={!newDeckName.trim() || creating}
              >
                <Text style={styles.modalBtnText}>
                  {creating ? "Creating..." : "Create"}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function formatProgress(p: SyncProgress): string {
  switch (p.phase) {
    case "fetching":
      return "Fetching catalog from YGOPRODeck...";
    case "parsing":
      return "Parsing response...";
    case "inserting":
      if (p.total && p.done !== undefined) {
        const pct = Math.round(((p.ratio ?? 0) * 100));
        return `Inserting ${p.done.toLocaleString()} / ${p.total.toLocaleString()} (${pct}%)`;
      }
      return "Inserting...";
    case "backfilling":
      return "Backfilling archetype list...";
    case "tech_answers":
      return "Seeding tech answers...";
    case "done":
      return "Done";
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f5f7fb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e9f0",
  },
  bannerTitle: { fontSize: 11, fontWeight: "700", color: "#666", textTransform: "uppercase", letterSpacing: 0.4 },
  bannerSub: { fontSize: 15, fontWeight: "500", marginTop: 2 },
  progressText: { fontSize: 12, color: "#3a6bd9", marginTop: 4 },
  syncBtn: {
    backgroundColor: "#3a6bd9",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  syncBtnBusy: { backgroundColor: "#aaa" },
  syncBtnText: { color: "#fff", fontWeight: "600" },
  toolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  newBtn: {
    backgroundColor: "#2a8a4d",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newBtnText: { color: "#fff", fontWeight: "600" },
  deck: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#fff",
  },
  deckName: { fontSize: 16, fontWeight: "600" },
  deckMeta: { fontSize: 12, color: "#888", marginTop: 4 },
  chevron: { fontSize: 22, color: "#bbb", paddingLeft: 8 },
  empty: { padding: 24, textAlign: "center", color: "#888" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 16,
  },
  modalBtn: {
    backgroundColor: "#2a8a4d",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalBtnDisabled: { backgroundColor: "#aaa" },
  modalBtnText: { color: "#fff", fontWeight: "600" },
  modalBtnGhost: { paddingHorizontal: 16, paddingVertical: 10 },
  modalBtnGhostText: { color: "#666", fontWeight: "600" },
});

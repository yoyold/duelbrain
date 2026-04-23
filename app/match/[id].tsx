/**
 * Match detail / per-game editor.
 *
 * Entry: user taps a match in the History tab. Shows the match header
 * (deck, opponent, result, event, notes) and the list of games.
 *
 * Game editing is inline: tapping a game expands it into an edit card with
 * WF toggle, W/L/D buttons, and (on loss) the 7-value loss_reason pills.
 * "Add game" appends a new empty card ready to fill. All edits are saved
 * individually on "Save" per card — no batch dirty state to fight the user.
 * This keeps the mental model simple: each card is one row.
 *
 * Match header edits are committed via a separate Save button when that
 * section is dirty. Match deletion is a destructive action behind a
 * confirmation alert.
 */
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  addGame,
  deleteGame,
  deleteMatch,
  deriveMatchResult,
  loadMatch,
  updateGame,
  updateMatchHeader,
  type GameRow,
  type MatchDetail,
  type MatchResult,
} from "@/db/match_ops";
import {
  LOSS_REASONS,
  LOSS_REASON_LABEL,
  type LossReason,
} from "@/db/loss_reason";

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const matchId = Number(id);
  const router = useRouter();

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Header edit state (kept separate so inline game edits don't fight it).
  const [headerOpponent, setHeaderOpponent] = useState("");
  const [headerWentFirst, setHeaderWentFirst] = useState<boolean | null>(null);
  const [headerResult, setHeaderResult] = useState<MatchResult>("win");
  const [headerEvent, setHeaderEvent] = useState("");
  const [headerNotes, setHeaderNotes] = useState("");
  const [headerDirty, setHeaderDirty] = useState(false);
  const [savingHeader, setSavingHeader] = useState(false);

  const refresh = useCallback(async () => {
    const m = await loadMatch(matchId);
    setMatch(m);
    setHeaderOpponent(m.opponentArchetype);
    setHeaderWentFirst(m.wentFirst);
    setHeaderResult(m.result);
    setHeaderEvent(m.event ?? "");
    setHeaderNotes(m.notes ?? "");
    setHeaderDirty(false);
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    refresh().catch((e) =>
      Alert.alert("Failed to load match", String(e?.message ?? e)),
    );
  }, [refresh]);

  const onSaveHeader = async () => {
    if (!match || savingHeader) return;
    setSavingHeader(true);
    try {
      await updateMatchHeader(match.id, {
        opponentArchetype: headerOpponent.trim() || match.opponentArchetype,
        wentFirst: headerWentFirst,
        result: headerResult,
        event: headerEvent.trim() || null,
        notes: headerNotes.trim() || null,
      });
      await refresh();
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message ?? e));
    } finally {
      setSavingHeader(false);
    }
  };

  const onDeleteMatch = () => {
    if (!match) return;
    Alert.alert(
      "Delete match?",
      "This deletes the match and all its game rows. Aggregate stats will shift.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMatch(match.id);
              router.back();
            } catch (e: any) {
              Alert.alert("Delete failed", String(e?.message ?? e));
            }
          },
        },
      ],
    );
  };

  const onAddGame = async () => {
    if (!match) return;
    try {
      // Default the new game's wentFirst to the opposite of the last game's
      // (loser of previous game goes first is a rough heuristic; user can
      // flip it). If no games yet, fall back to the match-level value.
      const last = match.games[match.games.length - 1];
      const defaultWF =
        last != null ? !last.wentFirst : (match.wentFirst ?? true);
      await addGame(match.id, {
        wentFirst: defaultWF,
        result: "win",
        lossReason: null,
      });
      await refresh();
    } catch (e: any) {
      Alert.alert("Add game failed", String(e?.message ?? e));
    }
  };

  const onSaveGame = async (
    gameId: number,
    data: {
      wentFirst: boolean;
      result: MatchResult;
      lossReason: LossReason | null;
      notes: string | null;
    },
  ) => {
    try {
      await updateGame(gameId, data);
      await refresh();
    } catch (e: any) {
      Alert.alert("Save game failed", String(e?.message ?? e));
    }
  };

  const onDeleteGame = (gameId: number, gameNumber: number) => {
    Alert.alert(
      `Delete Game ${gameNumber}?`,
      "This only removes the game, not the match.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteGame(gameId);
              await refresh();
            } catch (e: any) {
              Alert.alert("Delete failed", String(e?.message ?? e));
            }
          },
        },
      ],
    );
  };

  if (loading || !match) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "#888" }}>Loading...</Text>
      </View>
    );
  }

  const derived = deriveMatchResult(match.games);
  const resultMismatch = derived != null && derived !== match.result;
  const headerTitle = `vs ${match.opponentArchetype}`;

  return (
    <>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerBackTitle: "History",
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.root}
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Context strip */}
          <Text style={styles.context}>
            {match.deckName}
            {match.versionLabel ? ` · ${match.versionLabel}` : ""}
            {" · "}
            {formatDate(match.playedAt)}
          </Text>

          {/* Match header (editable) */}
          <Section title="Match">
            <Label>Opponent archetype</Label>
            <TextInput
              style={styles.input}
              value={headerOpponent}
              onChangeText={(t) => {
                setHeaderOpponent(t);
                setHeaderDirty(true);
              }}
              autoCapitalize="words"
              autoCorrect={false}
            />

            <Label>Went first (match-level, G1)</Label>
            <RowTurn
              value={headerWentFirst}
              onChange={(v) => {
                setHeaderWentFirst(v);
                setHeaderDirty(true);
              }}
            />

            <Label>Match result</Label>
            <RowResult
              value={headerResult}
              onChange={(v) => {
                setHeaderResult(v);
                setHeaderDirty(true);
              }}
            />
            {resultMismatch && (
              <Text style={styles.warn}>
                Games indicate "{derived}", match is marked "{match.result}".
                Leave it if this was a judge call / draw — otherwise fix.
              </Text>
            )}

            <Label>Event</Label>
            <TextInput
              style={styles.input}
              value={headerEvent}
              onChangeText={(t) => {
                setHeaderEvent(t);
                setHeaderDirty(true);
              }}
              placeholder="Locals, online, regional..."
            />

            <Label>Notes</Label>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              value={headerNotes}
              onChangeText={(t) => {
                setHeaderNotes(t);
                setHeaderDirty(true);
              }}
              multiline
              placeholder="What happened?"
            />

            {headerDirty && (
              <Pressable
                style={[styles.saveBtn, savingHeader && styles.saveBtnBusy]}
                onPress={onSaveHeader}
                disabled={savingHeader}
              >
                <Text style={styles.saveBtnText}>
                  {savingHeader ? "Saving..." : "Save match"}
                </Text>
              </Pressable>
            )}
          </Section>

          {/* Games */}
          <Section title={`Games (${match.games.length})`}>
            {match.games.length === 0 && (
              <Text style={styles.empty}>
                No games recorded yet. Add G1 to start.
              </Text>
            )}
            {match.games.map((g) => (
              <GameCard
                key={g.id}
                game={g}
                onSave={(data) => onSaveGame(g.id, data)}
                onDelete={() => onDeleteGame(g.id, g.gameNumber)}
              />
            ))}
            <Pressable style={styles.addBtn} onPress={onAddGame}>
              <Text style={styles.addBtnText}>+ Add game</Text>
            </Pressable>
          </Section>

          {/* Danger zone */}
          <Section title="Danger">
            <Pressable style={styles.deleteMatch} onPress={onDeleteMatch}>
              <Text style={styles.deleteMatchText}>Delete match</Text>
            </Pressable>
          </Section>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

// ---------- Game card ----------

function GameCard({
  game,
  onSave,
  onDelete,
}: {
  game: GameRow;
  onSave: (data: {
    wentFirst: boolean;
    result: MatchResult;
    lossReason: LossReason | null;
    notes: string | null;
  }) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [wentFirst, setWentFirst] = useState(game.wentFirst);
  const [result, setResult] = useState<MatchResult>(game.result);
  const [lossReason, setLossReason] = useState<LossReason | null>(
    game.lossReason,
  );
  const [notes, setNotes] = useState(game.notes ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    wentFirst !== game.wentFirst ||
    result !== game.result ||
    (result === "loss" ? lossReason !== game.lossReason : false) ||
    notes !== (game.notes ?? "");

  const doSave = async () => {
    setSaving(true);
    try {
      await onSave({
        wentFirst,
        result,
        lossReason,
        notes: notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.gameCard}>
      <View style={styles.gameHeaderRow}>
        <Text style={styles.gameTitle}>Game {game.gameNumber}</Text>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Text style={styles.gameDelete}>Delete</Text>
        </Pressable>
      </View>

      <Label>Turn</Label>
      <RowTurn
        value={wentFirst}
        onChange={(v) => v !== null && setWentFirst(v)}
        compact
      />

      <Label>Result</Label>
      <RowResult value={result} onChange={setResult} compact />

      {result === "loss" && (
        <>
          <Label>Loss reason</Label>
          <View style={styles.reasonsWrap}>
            {LOSS_REASONS.map((r) => (
              <Pressable
                key={r}
                style={[
                  styles.reasonPill,
                  lossReason === r && styles.reasonPillActive,
                ]}
                onPress={() => setLossReason(r)}
              >
                <Text
                  style={[
                    styles.reasonPillText,
                    lossReason === r && styles.reasonPillTextActive,
                  ]}
                >
                  {r}
                </Text>
              </Pressable>
            ))}
          </View>
          {lossReason && (
            <Text style={styles.hint}>{LOSS_REASON_LABEL[lossReason]}</Text>
          )}
        </>
      )}

      <Label>Notes</Label>
      <TextInput
        style={[styles.input, { minHeight: 50 }]}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Opening hand, key play..."
      />

      {dirty && (
        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnBusy]}
          onPress={doSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>
            {saving ? "Saving..." : "Save game"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ---------- Small presentational helpers ----------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

function RowTurn({
  value,
  onChange,
  compact,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.buttonRow}>
      <BigBtn
        compact={compact}
        active={value === true}
        color="#3a6bd9"
        onPress={() => onChange(true)}
        label="Went 1st"
      />
      <BigBtn
        compact={compact}
        active={value === false}
        color="#9657b5"
        onPress={() => onChange(false)}
        label="Went 2nd"
      />
    </View>
  );
}

function RowResult({
  value,
  onChange,
  compact,
}: {
  value: MatchResult;
  onChange: (v: MatchResult) => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.buttonRow}>
      <BigBtn
        compact={compact}
        active={value === "win"}
        color="#2a8a4d"
        onPress={() => onChange("win")}
        label="Win"
      />
      <BigBtn
        compact={compact}
        active={value === "loss"}
        color="#b73a3a"
        onPress={() => onChange("loss")}
        label="Loss"
      />
      <BigBtn
        compact={compact}
        active={value === "draw"}
        color="#888"
        onPress={() => onChange("draw")}
        label="Draw"
      />
    </View>
  );
}

function BigBtn({
  label,
  active,
  color,
  onPress,
  compact,
}: {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.bigBtn,
        compact && styles.bigBtnCompact,
        { borderColor: color },
        active && { backgroundColor: color },
      ]}
    >
      <Text style={[styles.bigBtnText, active && { color: "#fff" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fafafa" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  context: {
    fontSize: 12,
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#888",
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  buttonRow: { flexDirection: "row", gap: 8 },
  bigBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  bigBtnCompact: { paddingVertical: 8 },
  bigBtnText: { fontSize: 15, fontWeight: "600", color: "#333" },
  reasonsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reasonPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
  },
  reasonPillActive: { backgroundColor: "#b73a3a", borderColor: "#b73a3a" },
  reasonPillText: { fontSize: 13, color: "#666" },
  reasonPillTextActive: { color: "#fff", fontWeight: "600" },
  hint: { marginTop: 6, fontSize: 12, color: "#888", fontStyle: "italic" },
  warn: {
    marginTop: 6,
    fontSize: 12,
    color: "#b77a1a",
    fontStyle: "italic",
  },
  empty: { color: "#888", paddingVertical: 12 },
  gameCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e9f0",
    padding: 12,
    marginBottom: 10,
  },
  gameHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gameTitle: { fontSize: 16, fontWeight: "700" },
  gameDelete: { fontSize: 13, color: "#b73a3a", fontWeight: "600" },
  addBtn: {
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccd",
    borderStyle: "dashed",
    borderRadius: 8,
    marginTop: 4,
  },
  addBtnText: { color: "#3a6bd9", fontWeight: "600" },
  saveBtn: {
    marginTop: 12,
    backgroundColor: "#2a8a4d",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  saveBtnBusy: { backgroundColor: "#aaa" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  deleteMatch: {
    borderWidth: 1,
    borderColor: "#b73a3a",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  deleteMatchText: { color: "#b73a3a", fontWeight: "700" },
});


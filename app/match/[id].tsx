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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { palette } from "@/constants/theme";
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
import {
  listDeckCardsForPicker,
  setOpeningHand,
  type OpeningHandCard,
} from "@/db/opening_hand_ops";

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
        <Text style={{ color: palette.textMuted }}>Loading...</Text>
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
              placeholderTextColor={palette.textDim}
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
              placeholderTextColor={palette.textDim}
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
              placeholderTextColor={palette.textDim}
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
                deckVersionId={match.deckVersionId}
                onSave={(data) => onSaveGame(g.id, data)}
                onSaveHand={async (cards) => {
                  try {
                    await setOpeningHand(g.id, cards);
                    await refresh();
                  } catch (e: any) {
                    Alert.alert("Save hand failed", String(e?.message ?? e));
                  }
                }}
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
  deckVersionId,
  onSave,
  onSaveHand,
  onDelete,
}: {
  game: GameRow;
  deckVersionId: number;
  onSave: (data: {
    wentFirst: boolean;
    result: MatchResult;
    lossReason: LossReason | null;
    notes: string | null;
  }) => void | Promise<void>;
  onSaveHand: (cards: { cardId: number; copies: number }[]) => Promise<void>;
  onDelete: () => void;
}) {
  const [wentFirst, setWentFirst] = useState(game.wentFirst);
  const [result, setResult] = useState<MatchResult>(game.result);
  const [lossReason, setLossReason] = useState<LossReason | null>(
    game.lossReason,
  );
  const [notes, setNotes] = useState(game.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [handPickerOpen, setHandPickerOpen] = useState(false);

  const handSize = game.openingHand.reduce((s, c) => s + c.copies, 0);

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

      <Label>Opening hand ({handSize})</Label>
      <View style={styles.handChips}>
        {game.openingHand.length === 0 ? (
          <Text style={styles.handEmpty}>Not recorded</Text>
        ) : (
          game.openingHand.map((c) => (
            <View key={c.cardId} style={styles.handChip}>
              <Text style={styles.handChipName} numberOfLines={1}>
                {c.name}
              </Text>
              {c.copies > 1 && (
                <Text style={styles.handChipCount}>×{c.copies}</Text>
              )}
            </View>
          ))
        )}
      </View>
      <Pressable
        style={styles.handEditBtn}
        onPress={() => setHandPickerOpen(true)}
      >
        <Text style={styles.handEditText}>
          {game.openingHand.length === 0 ? "+ Record opening hand" : "Edit hand"}
        </Text>
      </Pressable>

      <Label>Notes</Label>
      <TextInput
        style={[styles.input, { minHeight: 50 }]}
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Key play, turn 1 summary..."
        placeholderTextColor={palette.textDim}
      />

      <OpeningHandPickerModal
        visible={handPickerOpen}
        deckVersionId={deckVersionId}
        current={game.openingHand}
        onClose={() => setHandPickerOpen(false)}
        onSave={async (cards) => {
          await onSaveHand(cards);
          setHandPickerOpen(false);
        }}
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

// ---------- Opening-hand picker ----------

function OpeningHandPickerModal({
  visible,
  deckVersionId,
  current,
  onClose,
  onSave,
}: {
  visible: boolean;
  deckVersionId: number;
  current: OpeningHandCard[];
  onClose: () => void;
  onSave: (cards: { cardId: number; copies: number }[]) => Promise<void>;
}) {
  const [cards, setCards] = useState<
    { cardId: number; name: string; type: string; section: "main" | "side"; maxCopies: number }[]
  >([]);
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-hydrate whenever the modal is (re)opened so edits during the session
  // don't stack across opens.
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setQ("");
    setCounts(new Map(current.map((c) => [c.cardId, c.copies])));
    listDeckCardsForPicker(deckVersionId)
      .then((rows) =>
        setCards(
          rows.map((r) => ({
            cardId: r.cardId,
            name: r.name,
            type: r.type,
            section: r.section,
            maxCopies: r.maxCopies,
          })),
        ),
      )
      .catch((e) => Alert.alert("Failed to load deck", String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [visible, deckVersionId, current]);

  const total = useMemo(() => {
    let s = 0;
    for (const v of counts.values()) s += v;
    return s;
  }, [counts]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return cards;
    return cards.filter((c) => c.name.toLowerCase().includes(n));
  }, [cards, q]);

  const bump = (cardId: number, delta: number, max: number) => {
    setCounts((prev) => {
      const next = new Map(prev);
      const cur = next.get(cardId) ?? 0;
      const updated = Math.max(0, Math.min(max, cur + delta));
      if (updated === 0) next.delete(cardId);
      else next.set(cardId, updated);
      return next;
    });
  };

  const onDone = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const out = Array.from(counts.entries()).map(([cardId, copies]) => ({
        cardId,
        copies,
      }));
      await onSave(out);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: palette.bg }}
      >
        <View style={styles.pickerHeader}>
          <Pressable onPress={onClose} disabled={saving}>
            <Text style={styles.pickerHeaderCancel}>Cancel</Text>
          </Pressable>
          <View style={{ alignItems: "center" }}>
            <Text style={styles.pickerHeaderTitle}>Opening hand</Text>
            <Text style={styles.pickerHeaderCount}>{total} cards</Text>
          </View>
          <Pressable onPress={onDone} disabled={saving}>
            <Text
              style={[
                styles.pickerHeaderDone,
                saving && { opacity: 0.5 },
              ]}
            >
              {saving ? "Saving..." : "Done"}
            </Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.pickerSearch}
          placeholder="Filter by name..."
          placeholderTextColor={palette.textDim}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          autoCapitalize="none"
        />

        {loading ? (
          <Text style={styles.pickerEmpty}>Loading deck...</Text>
        ) : cards.length === 0 ? (
          <Text style={styles.pickerEmpty}>
            This deck version has no main/side cards yet. Edit the deck to
            populate it, then come back.
          </Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => String(c.cardId)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => {
              const cur = counts.get(item.cardId) ?? 0;
              return (
                <View style={styles.pickerRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.pickerRowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.pickerRowMeta} numberOfLines={1}>
                      {item.type} · {item.section} · max {item.maxCopies}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable
                      style={[styles.stepBtn, cur === 0 && styles.stepBtnDisabled]}
                      onPress={() => bump(item.cardId, -1, item.maxCopies)}
                      disabled={cur === 0}
                      hitSlop={6}
                    >
                      <Text style={styles.stepBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.stepCount}>{cur}</Text>
                    <Pressable
                      style={[
                        styles.stepBtn,
                        cur >= item.maxCopies && styles.stepBtnDisabled,
                      ]}
                      onPress={() => bump(item.cardId, 1, item.maxCopies)}
                      disabled={cur >= item.maxCopies}
                      hitSlop={6}
                    >
                      <Text style={styles.stepBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.pickerEmpty}>No cards match "{q}".</Text>
            }
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
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
        color={palette.cyan}
        onPress={() => onChange(true)}
        label="Went 1st"
      />
      <BigBtn
        compact={compact}
        active={value === false}
        color={palette.purple}
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
        color={palette.win}
        onPress={() => onChange("win")}
        label="Win"
      />
      <BigBtn
        compact={compact}
        active={value === "loss"}
        color={palette.loss}
        onPress={() => onChange("loss")}
        label="Loss"
      />
      <BigBtn
        compact={compact}
        active={value === "draw"}
        color={palette.draw}
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
      <Text
        style={[
          styles.bigBtnText,
          active && { color: palette.textOnAccent },
        ]}
      >
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
  root: { flex: 1, backgroundColor: palette.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.bg },
  context: {
    fontSize: 11,
    color: palette.gold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 16,
    fontWeight: "700",
  },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
    color: palette.gold,
    letterSpacing: 0.5,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: palette.textMuted,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: palette.surface,
    color: palette.text,
  },
  buttonRow: { flexDirection: "row", gap: 8 },
  bigBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    backgroundColor: palette.surface,
  },
  bigBtnCompact: { paddingVertical: 8 },
  bigBtnText: { fontSize: 15, fontWeight: "700", color: palette.text },
  reasonsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reasonPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  reasonPillActive: { backgroundColor: palette.loss, borderColor: palette.loss },
  reasonPillText: { fontSize: 13, color: palette.textMuted },
  reasonPillTextActive: { color: palette.textOnAccent, fontWeight: "700" },
  hint: { marginTop: 6, fontSize: 12, color: palette.textMuted, fontStyle: "italic" },
  warn: {
    marginTop: 6,
    fontSize: 12,
    color: palette.warn,
    fontStyle: "italic",
  },
  empty: { color: palette.textMuted, paddingVertical: 12 },
  gameCard: {
    backgroundColor: palette.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 10,
  },
  gameHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: 0.3,
  },
  gameDelete: { fontSize: 13, color: palette.loss, fontWeight: "700" },
  addBtn: {
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
    borderStyle: "dashed",
    borderRadius: 8,
    marginTop: 4,
    backgroundColor: palette.surface,
  },
  addBtnText: { color: palette.gold, fontWeight: "700", letterSpacing: 0.3 },
  saveBtn: {
    marginTop: 12,
    backgroundColor: palette.gold,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    shadowColor: palette.gold,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  saveBtnBusy: { backgroundColor: palette.goldDim, opacity: 0.6, shadowOpacity: 0, elevation: 0 },
  saveBtnText: {
    color: palette.textOnAccent,
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  deleteMatch: {
    borderWidth: 1,
    borderColor: palette.loss,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    backgroundColor: palette.surface,
  },
  deleteMatchText: { color: palette.loss, fontWeight: "800", letterSpacing: 0.3 },

  // Opening-hand display inside a GameCard.
  handChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 4,
  },
  handChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surfaceElevated,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    maxWidth: "100%",
  },
  handChipName: { color: palette.text, fontSize: 12, fontWeight: "600" },
  handChipCount: {
    color: palette.gold,
    fontSize: 11,
    fontWeight: "800",
    marginLeft: 4,
  },
  handEmpty: {
    color: palette.textDim,
    fontSize: 12,
    fontStyle: "italic",
    paddingVertical: 4,
  },
  handEditBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceElevated,
    marginTop: 6,
  },
  handEditText: {
    color: palette.gold,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // Opening-hand picker modal.
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  pickerHeaderTitle: {
    color: palette.gold,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  pickerHeaderCount: { color: palette.textMuted, fontSize: 11, marginTop: 2 },
  pickerHeaderCancel: { color: palette.textMuted, fontSize: 15, fontWeight: "600" },
  pickerHeaderDone: { color: palette.gold, fontSize: 15, fontWeight: "800" },
  pickerSearch: {
    margin: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
    borderRadius: 8,
    fontSize: 15,
  },
  pickerEmpty: {
    padding: 24,
    textAlign: "center",
    color: palette.textMuted,
    fontSize: 13,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  pickerRowName: { color: palette.text, fontSize: 14, fontWeight: "600" },
  pickerRowMeta: { color: palette.textDim, fontSize: 11, marginTop: 2 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surfaceElevated,
    borderWidth: 1,
    borderColor: palette.border,
  },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText: {
    color: palette.gold,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 20,
  },
  stepCount: {
    minWidth: 22,
    textAlign: "center",
    color: palette.text,
    fontSize: 15,
    fontWeight: "800",
  },
});


/**
 * Match logger — the daily-use hook.
 *
 * Design goal: complete a typical match entry in ~10 seconds.
 * Minimum required fields: deckVersion, opponentArchetype, result, wentFirst
 * (match-level). Per-game detail (game number, loss_reason) optional on log,
 * prompted after save via "Add game detail".
 */
import { and, desc, eq } from "drizzle-orm";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { db, schema } from "@/db/client";
import {
  LOSS_REASONS,
  LOSS_REASON_LABEL,
  type LossReason,
} from "@/db/loss_reason";

type Result = "win" | "loss" | "draw";

export default function MatchLoggerScreen() {
  const router = useRouter();

  const [deckVersionId, setDeckVersionId] = useState<number | null>(null);
  const [deckName, setDeckName] = useState<string>("");
  const [archetypes, setArchetypes] = useState<{ id: number; name: string }[]>([]);
  const [opponent, setOpponent] = useState<string>("");
  const [wentFirst, setWentFirst] = useState<boolean | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [lossReason, setLossReason] = useState<LossReason | null>(null);
  const [event, setEvent] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Load current deck + archetype list on mount.
  useEffect(() => {
    (async () => {
      const curr = await db
        .select({
          versionId: schema.deckVersions.id,
          deckName: schema.decks.name,
        })
        .from(schema.deckVersions)
        .innerJoin(schema.decks, eq(schema.decks.id, schema.deckVersions.deckId))
        .where(eq(schema.deckVersions.isCurrent, true))
        .limit(1)
        .get();
      if (curr) {
        setDeckVersionId(curr.versionId);
        setDeckName(curr.deckName);
      }
      const arch = await db.select().from(schema.archetypes).all();
      setArchetypes(arch.sort((a, b) => a.name.localeCompare(b.name)));
    })();
  }, []);

  const filteredArch = useMemo(() => {
    if (!opponent.trim()) return archetypes.slice(0, 6);
    const q = opponent.toLowerCase();
    return archetypes
      .filter((a) => a.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [opponent, archetypes]);

  const canSave =
    !!deckVersionId && opponent.trim().length > 0 && !!result && wentFirst !== null;

  const onSave = async () => {
    if (!canSave || !deckVersionId || !result) return;
    setSaving(true);
    try {
      // Upsert opponent archetype if it's new text.
      const existing = archetypes.find(
        (a) => a.name.toLowerCase() === opponent.trim().toLowerCase(),
      );
      if (!existing) {
        await db
          .insert(schema.archetypes)
          .values({ name: opponent.trim() })
          .onConflictDoNothing();
      }

      const [match] = await db
        .insert(schema.matches)
        .values({
          deckVersionId,
          opponentArchetype: existing?.name ?? opponent.trim(),
          wentFirst,
          result,
          event: event.trim() || null,
          notes: notes.trim() || null,
        })
        .returning();

      // Create a single synthetic "match-level" game row so stats queries work
      // without requiring per-game detail on every log. User can expand later.
      await db.insert(schema.games).values({
        matchId: match.id,
        gameNumber: 1,
        wentFirst: wentFirst!,
        result,
        lossReason: result === "loss" ? lossReason : null,
      });

      // Reset form for next match.
      setOpponent("");
      setResult(null);
      setWentFirst(null);
      setLossReason(null);
      setEvent("");
      setNotes("");

      Alert.alert("Saved", `Match vs ${existing?.name ?? opponent.trim()} logged.`);
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Deck */}
        <View style={styles.section}>
          <Text style={styles.label}>Deck</Text>
          <Pressable
            style={styles.rowBtn}
            onPress={() => router.push("/decks")}
          >
            <Text style={styles.rowBtnText}>{deckName || "No deck — tap to set up"}</Text>
            <Text style={styles.rowBtnHint}>change</Text>
          </Pressable>
        </View>

        {/* Opponent */}
        <View style={styles.section}>
          <Text style={styles.label}>Opponent archetype</Text>
          <TextInput
            style={styles.input}
            placeholder="Snake-Eye, Tenpai..."
            value={opponent}
            onChangeText={setOpponent}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {filteredArch.length > 0 && opponent.trim().length > 0 &&
            !archetypes.some(
              (a) => a.name.toLowerCase() === opponent.trim().toLowerCase(),
            ) && (
              <FlatList
                horizontal
                keyboardShouldPersistTaps="handled"
                data={filteredArch}
                keyExtractor={(a) => String(a.id)}
                style={{ marginTop: 8 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.pill}
                    onPress={() => setOpponent(item.name)}
                  >
                    <Text style={styles.pillText}>{item.name}</Text>
                  </Pressable>
                )}
              />
            )}
        </View>

        {/* Went first */}
        <View style={styles.section}>
          <Text style={styles.label}>Turn</Text>
          <View style={styles.buttonRow}>
            <BigBtn
              active={wentFirst === true}
              color="#3a6bd9"
              onPress={() => setWentFirst(true)}
              label="Went 1st"
            />
            <BigBtn
              active={wentFirst === false}
              color="#9657b5"
              onPress={() => setWentFirst(false)}
              label="Went 2nd"
            />
          </View>
        </View>

        {/* Result */}
        <View style={styles.section}>
          <Text style={styles.label}>Result</Text>
          <View style={styles.buttonRow}>
            <BigBtn
              active={result === "win"}
              color="#2a8a4d"
              onPress={() => setResult("win")}
              label="Win"
            />
            <BigBtn
              active={result === "loss"}
              color="#b73a3a"
              onPress={() => setResult("loss")}
              label="Loss"
            />
            <BigBtn
              active={result === "draw"}
              color="#888"
              onPress={() => setResult("draw")}
              label="Draw"
            />
          </View>
        </View>

        {/* Loss reason (only visible on loss) */}
        {result === "loss" && (
          <View style={styles.section}>
            <Text style={styles.label}>What caused the loss?</Text>
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
          </View>
        )}

        {/* Optional metadata */}
        <View style={styles.section}>
          <Text style={styles.label}>Event (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Locals, online, regional..."
            value={event}
            onChangeText={setEvent}
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            placeholder="What happened?"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        {/* Save */}
        <Pressable
          style={[styles.save, !canSave && styles.saveDisabled]}
          onPress={onSave}
          disabled={!canSave || saving}
        >
          <Text style={styles.saveText}>
            {saving ? "Saving..." : "Save match"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BigBtn({
  label,
  active,
  color,
  onPress,
}: {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.bigBtn,
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

const styles = StyleSheet.create({
  root: { flex: 1, padding: 16 },
  section: { marginBottom: 18 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#888",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  rowBtn: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
  },
  rowBtnText: { fontSize: 16, fontWeight: "500" },
  rowBtnHint: { fontSize: 12, color: "#888" },
  buttonRow: { flexDirection: "row", gap: 8 },
  bigBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
  },
  bigBtnText: { fontSize: 16, fontWeight: "600", color: "#333" },
  pill: {
    backgroundColor: "#eef3fb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 6,
  },
  pillText: { fontSize: 14, color: "#3a6bd9", fontWeight: "500" },
  reasonsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  reasonPillActive: { backgroundColor: "#b73a3a", borderColor: "#b73a3a" },
  reasonPillText: { fontSize: 14, color: "#666" },
  reasonPillTextActive: { color: "#fff", fontWeight: "600" },
  hint: { marginTop: 8, fontSize: 12, color: "#888", fontStyle: "italic" },
  save: {
    backgroundColor: "#3a6bd9",
    padding: 16,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  saveDisabled: { backgroundColor: "#aaa" },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});

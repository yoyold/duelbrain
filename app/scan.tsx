/**
 * Card scanner. Capture a photo (or pick one), run ML Kit text recognition
 * on it, fuzzy-match the detected lines against the cards catalog, let the
 * user confirm the correct candidate.
 *
 * Requires a development build, not Expo Go: ML Kit text-recognition is a
 * native module. Runtime errors are surfaced as an alert so the screen
 * doesn't white-screen when running in Expo Go.
 *
 * Two usage modes, disambiguated by the `section` query param:
 *   - ?section=main|extra|side  → picker mode. On confirm, the picked card
 *                                  id is pushed through scan_bridge and
 *                                  the screen pops back to the caller.
 *   - (no section)              → browse mode. Shows the candidates but
 *                                  confirming just acknowledges; caller is
 *                                  expected to be a standalone entry.
 */
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { fuzzyMatchFromOcr, type MatchCandidate } from "@/db/card_match";
import { setPendingScan } from "@/db/scan_bridge";

type Section = "main" | "extra" | "side";
type Phase = "idle" | "capturing" | "ocr" | "matching" | "done" | "error";

export default function ScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const section: Section | null =
    params.section === "main" ||
    params.section === "extra" ||
    params.section === "side"
      ? params.section
      : null;

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const runPipeline = useCallback(
    async (uri: string) => {
      setImageUri(uri);
      setCandidates([]);
      setLines([]);
      setError(null);

      // ---- OCR ----
      setPhase("ocr");
      let detected: string[] = [];
      try {
        // Dynamic import so the bundle doesn't explode if the native module
        // is missing (e.g. running in Expo Go).
        const mod = await import("@react-native-ml-kit/text-recognition");
        const TextRecognition: any = mod.default ?? mod;
        const result = await TextRecognition.recognize(uri);
        // ML Kit returns { text, blocks: [{text, lines: [{text, ...}]}, ...] }
        if (result?.blocks && Array.isArray(result.blocks)) {
          for (const b of result.blocks) {
            if (b?.lines && Array.isArray(b.lines)) {
              for (const l of b.lines) {
                if (typeof l?.text === "string" && l.text.trim()) {
                  detected.push(l.text.trim());
                }
              }
            } else if (typeof b?.text === "string") {
              detected.push(...b.text.split("\n").map((s: string) => s.trim()).filter(Boolean));
            }
          }
        } else if (typeof result?.text === "string") {
          detected = result.text.split("\n").map((s: string) => s.trim()).filter(Boolean);
        }
      } catch (e: any) {
        setError(
          "OCR unavailable. This screen needs a development build — " +
            "ML Kit text-recognition isn't bundled in Expo Go.\n\n" +
            String(e?.message ?? e),
        );
        setPhase("error");
        return;
      }
      setLines(detected);

      if (detected.length === 0) {
        setPhase("done");
        return;
      }

      // ---- Fuzzy match ----
      setPhase("matching");
      try {
        const hits = await fuzzyMatchFromOcr(detected, 8);
        setCandidates(hits);
        setPhase("done");
      } catch (e: any) {
        setError(`Match failed: ${String(e?.message ?? e)}`);
        setPhase("error");
      }
    },
    [],
  );

  const onTakePhoto = async () => {
    setPhase("capturing");
    try {
      const mod = await import("expo-image-picker");
      const { status } = await mod.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Camera permission", "Camera access is required to scan cards.");
        setPhase("idle");
        return;
      }
      const result = await mod.launchCameraAsync({
        mediaTypes: mod.MediaTypeOptions?.Images ?? "Images",
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) {
        setPhase("idle");
        return;
      }
      await runPipeline(result.assets[0].uri);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPhase("error");
    }
  };

  const onPickLibrary = async () => {
    setPhase("capturing");
    try {
      const mod = await import("expo-image-picker");
      const { status } = await mod.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Photo permission", "Photo library access is required.");
        setPhase("idle");
        return;
      }
      const result = await mod.launchImageLibraryAsync({
        mediaTypes: mod.MediaTypeOptions?.Images ?? "Images",
        quality: 0.8,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) {
        setPhase("idle");
        return;
      }
      await runPipeline(result.assets[0].uri);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPhase("error");
    }
  };

  const onPickCandidate = (c: MatchCandidate) => {
    if (section) {
      setPendingScan({ cardId: c.id, cardName: c.name, section });
      router.back();
    } else {
      Alert.alert("Identified", `${c.name}\n\n${c.type}`);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: section ? `Scan → ${capitalize(section)}` : "Scan card",
          headerBackTitle: "Back",
        }}
      />

      <ScrollView
        style={styles.root}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      >
        {/* Capture actions */}
        <View style={styles.actions}>
          <Pressable
            style={[styles.action, styles.actionPrimary]}
            onPress={onTakePhoto}
            disabled={phase === "capturing" || phase === "ocr" || phase === "matching"}
          >
            <Text style={styles.actionPrimaryText}>📷 Take photo</Text>
          </Pressable>
          <Pressable
            style={styles.action}
            onPress={onPickLibrary}
            disabled={phase === "capturing" || phase === "ocr" || phase === "matching"}
          >
            <Text style={styles.actionText}>🖼 From library</Text>
          </Pressable>
        </View>

        {/* Status strip */}
        <Text style={styles.status}>{phaseLabel(phase)}</Text>

        {/* Preview */}
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={styles.preview}
            resizeMode="contain"
          />
        )}

        {/* Error */}
        {error && (
          <View style={styles.errBox}>
            <Text style={styles.errTitle}>Something went wrong</Text>
            <Text style={styles.errBody}>{error}</Text>
          </View>
        )}

        {/* Detected text */}
        {lines.length > 0 && (
          <View style={styles.linesBox}>
            <Text style={styles.linesTitle}>Detected text</Text>
            {lines.slice(0, 8).map((l, i) => (
              <Text key={i} style={styles.line}>
                {l}
              </Text>
            ))}
            {lines.length > 8 && (
              <Text style={styles.lineMore}>+{lines.length - 8} more</Text>
            )}
          </View>
        )}

        {/* Candidates */}
        {candidates.length > 0 && (
          <View style={styles.candidatesBox}>
            <Text style={styles.candidatesTitle}>Best matches</Text>
            {candidates.map((c) => (
              <Pressable
                key={c.id}
                style={styles.candidate}
                onPress={() => onPickCandidate(c)}
              >
                {c.imageUrlSmall ? (
                  <Image source={{ uri: c.imageUrlSmall }} style={styles.candidateThumb} />
                ) : (
                  <View style={[styles.candidateThumb, styles.candidateThumbFallback]}>
                    <Text style={{ color: "#888", fontSize: 10 }}>no img</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.candidateName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={styles.candidateMeta} numberOfLines={1}>
                    {c.type}
                    {c.archetype ? ` · ${c.archetype}` : ""}
                  </Text>
                </View>
                <View style={styles.scorePill}>
                  <Text style={styles.scoreText}>{Math.round(c.score * 100)}%</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Empty-after-scan */}
        {phase === "done" && candidates.length === 0 && imageUri && (
          <Text style={styles.empty}>
            No confident matches. Try a closer shot with more light — OCR
            works best on the card title.
          </Text>
        )}
      </ScrollView>
    </>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function phaseLabel(p: Phase): string {
  switch (p) {
    case "idle":
      return "Point the camera at a card or pick a photo.";
    case "capturing":
      return "Waiting for camera...";
    case "ocr":
      return "Reading text...";
    case "matching":
      return "Matching against catalog...";
    case "done":
      return "Tap a match to confirm.";
    case "error":
      return "Error — see below.";
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fafafa" },
  actions: { flexDirection: "row", gap: 8 },
  action: {
    flex: 1,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3a6bd9",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  actionPrimary: { backgroundColor: "#3a6bd9" },
  actionText: { color: "#3a6bd9", fontWeight: "700", fontSize: 15 },
  actionPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  status: {
    marginTop: 12,
    fontSize: 12,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  preview: {
    marginTop: 12,
    width: "100%",
    aspectRatio: 3 / 4,
    backgroundColor: "#eee",
    borderRadius: 10,
  },
  errBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff0ec",
    borderWidth: 1,
    borderColor: "#b73a3a",
  },
  errTitle: { color: "#b73a3a", fontWeight: "700", marginBottom: 4 },
  errBody: { color: "#333", fontSize: 13, lineHeight: 18 },
  linesBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e9f0",
  },
  linesTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  line: { fontSize: 13, color: "#333", marginTop: 2 },
  lineMore: { fontSize: 12, color: "#888", marginTop: 4, fontStyle: "italic" },
  candidatesBox: { marginTop: 16 },
  candidatesTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  candidate: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e9f0",
    padding: 10,
    marginBottom: 8,
  },
  candidateThumb: {
    width: 48,
    height: 48,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: "#f0f0f0",
  },
  candidateThumbFallback: { alignItems: "center", justifyContent: "center" },
  candidateName: { fontSize: 15, fontWeight: "600" },
  candidateMeta: { fontSize: 12, color: "#888", marginTop: 2 },
  scorePill: {
    backgroundColor: "#eef3fb",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  scoreText: { color: "#3a6bd9", fontWeight: "700", fontSize: 12 },
  empty: {
    marginTop: 20,
    padding: 12,
    color: "#888",
    textAlign: "center",
  },
});

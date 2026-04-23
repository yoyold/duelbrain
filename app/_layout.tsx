import { DarkTheme, ThemeProvider, type Theme } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";
import "react-native-reanimated";

import { palette } from "@/constants/theme";
import { useAppDatabase } from "@/db/migrate";

export const unstable_settings = {
  anchor: "(tabs)",
};

// Dark is the only mode. We override the React Navigation DarkTheme colors
// so every screen container (Stack header, tab bar default bg) inherits our
// palette instead of the default navy-on-black.
const duelistTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: palette.gold,
    background: palette.bg,
    card: palette.surface,
    text: palette.text,
    border: palette.border,
    notification: palette.gold,
  },
};

export default function RootLayout() {
  const { ready, error } = useAppDatabase();

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: palette.bg }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8, color: palette.text }}>
          Database initialization failed
        </Text>
        <Text style={{ color: palette.loss, textAlign: "center" }}>{String(error)}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.bg }}>
        <ActivityIndicator size="large" color={palette.gold} />
      </View>
    );
  }

  return (
    <ThemeProvider value={duelistTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.gold,
          headerTitleStyle: {
            color: palette.text,
            fontWeight: "700",
          },
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="deck/[id]" options={{ headerBackTitle: "Decks" }} />
        <Stack.Screen name="match/[id]" options={{ headerBackTitle: "History" }} />
        <Stack.Screen name="scan" options={{ headerBackTitle: "Back" }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}

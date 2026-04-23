import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { palette } from "@/constants/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: palette.gold,
        tabBarInactiveTintColor: palette.textDim,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.3,
        },
        headerStyle: { backgroundColor: palette.surface },
        headerTintColor: palette.gold,
        headerTitleStyle: {
          color: palette.text,
          fontWeight: "700",
        },
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Log",
          headerTitle: "Log a match",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="plus.circle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="clock.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="decks"
        options={{
          title: "Decks",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="rectangle.stack.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tech"
        options={{
          title: "Tech",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="lightbulb.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="chart.bar.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

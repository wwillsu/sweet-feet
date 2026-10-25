import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Tabs } from "expo-router/js-tabs";
import { StatusBar } from "expo-status-bar";
import { ColorValue, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Code, Empty, Muted } from "@/components/ui";
import { useTheme } from "@/lib/theme";

// Written to .env.local by scripts/configure.mjs (this Mac's Wi-Fi address, port 3210).
const url = process.env.EXPO_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url, { unsavedChangesWarning: false }) : null;

function FootIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M12 22c-3 0-4.5-2.5-4.2-6 .3-3-.8-5-.8-7.5C7 6 8.8 5 11.5 5c2.6 0 4 1.2 3.6 4-.4 2.6-1.6 4.2-1.2 7.2.4 3.2.6 5.8-1.9 5.8z"
        fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Circle cx="15.5" cy="2.8" r="1.6" fill={color} />
      <Circle cx="12" cy="2.4" r="1.1" fill={color} />
    </Svg>
  );
}

function PulseIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path d="M2 12h4l2.5-6 4.5 12 2.5-6H22" fill="none" stroke={color} strokeWidth={1.8}
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function RootLayout() {
  const t = useTheme();
  if (!convex || !url) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.page }} contentContainerStyle={{ paddingTop: 80 }}>
        <Empty title="Backend not configured">
          <Muted>{"Start the app with npm start (not npx expo start). It writes this Mac's address to .env.local:"}</Muted>
          <Code>npm start</Code>
        </Empty>
      </ScrollView>
    );
  }
  return (
    <ConvexProvider client={convex}>
      <StatusBar style="auto" />
      <View style={{ flex: 1, backgroundColor: t.page }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: t.accent,
            tabBarInactiveTintColor: t.textMuted,
            tabBarStyle: { backgroundColor: t.surface1, borderTopColor: t.border },
            headerStyle: { backgroundColor: t.surface1 },
            headerTitleStyle: { color: t.textPrimary },
            headerShadowVisible: false,
            sceneStyle: { backgroundColor: t.page },
          }}
        >
          <Tabs.Screen name="index" options={{
            title: "My feet",
            tabBarIcon: ({ color }) => <FootIcon color={color} />,
          }} />
          <Tabs.Screen name="live" options={{
            title: "Live demo",
            tabBarIcon: ({ color }) => <PulseIcon color={color} />,
          }} />
        </Tabs>
      </View>
    </ConvexProvider>
  );
}

import { useConvexConnectionState } from "convex/react";
import { ReactNode, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import type { Tier } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { kindColor } from "./StatusIcon";

export function Card({ title, subtitle, children, style }: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.surface1, borderColor: t.border }, style]}>
      {title && <Text style={[styles.cardTitle, { color: t.textPrimary }]}>{title}</Text>}
      {subtitle && <Muted style={styles.cardSub}>{subtitle}</Muted>}
      {children}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: TextStyle }) {
  const t = useTheme();
  return <Text style={[{ color: t.textSecondary, fontSize: 13, lineHeight: 18 }, style]}>{children}</Text>;
}

export function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: t.surface1, borderColor: t.border }]}>
      <Text style={[styles.tileLabel, { color: t.textSecondary }]}>{label}</Text>
      {typeof value === "string" || typeof value === "number"
        ? <Text style={[styles.tileValue, { color: t.textPrimary }]}>{value}</Text>
        : <View style={styles.tileValueBox}>{value}</View>}
      {sub && <Muted style={{ fontSize: 12 }}>{sub}</Muted>}
    </View>
  );
}

export function Tiles({ children }: { children: ReactNode }) {
  return <View style={styles.tiles}>{children}</View>;
}

/** Colored-edge box for warnings/alerts and the demo-mode banner. */
export function Callout({ tier, children }: { tier: Tier | "demo"; children: ReactNode }) {
  const t = useTheme();
  const edge = tier === "demo" ? t.accent : kindColor(tier, t);
  return (
    <View style={[styles.callout, { backgroundColor: t.surface1, borderColor: t.border, borderLeftColor: edge }]}>
      {children}
    </View>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: t.textPrimary }]}>{title}</Text>
      {children}
    </View>
  );
}

export function Code({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text selectable style={[styles.code, { backgroundColor: t.surface2, color: t.textPrimary }]}>
      {children}
    </Text>
  );
}

/** Scrolling page body with the connection banner on top. */
export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.page }}>
      <ConnectionBanner url={process.env.EXPO_PUBLIC_CONVEX_URL ?? ""} />
      <ScrollView contentContainerStyle={styles.screen} contentInsetAdjustmentBehavior="automatic">
        {children}
      </ScrollView>
    </View>
  );
}

/** Shown when the phone can't open a socket to the Convex backend on the Mac. */
export function ConnectionBanner({ url }: { url: string }) {
  const t = useTheme();
  const state = useConvexConnectionState();
  const [grace, setGrace] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setGrace(false), 5000);
    return () => clearTimeout(id);
  }, []);
  if (state.isWebSocketConnected || grace) return null;
  return (
    <View style={[styles.banner, { backgroundColor: t.critical }]}>
      <Text style={styles.bannerText}>
        {state.hasEverConnected ? "Reconnecting to " : "Can't reach "}
        {url}. Check that `npm run dev` is running on the Mac and the phone is on the same Wi-Fi.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 14, gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardSub: { marginTop: -4, fontSize: 12 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  tileLabel: { fontSize: 12, fontWeight: "500" },
  tileValue: { fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tileValueBox: { minHeight: 30, justifyContent: "center" },
  callout: {
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  empty: { padding: 24, gap: 10, alignItems: "flex-start" },
  emptyTitle: { fontSize: 20, fontWeight: "700" },
  code: { fontFamily: "Menlo", fontSize: 12, padding: 10, borderRadius: 8, overflow: "hidden", alignSelf: "stretch" },
  banner: { paddingHorizontal: 14, paddingVertical: 10 },
  bannerText: { color: "#fff", fontSize: 13, fontWeight: "500" },
});

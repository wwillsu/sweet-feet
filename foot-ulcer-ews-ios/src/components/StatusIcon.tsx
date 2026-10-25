import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { SensorState, Tier } from "@/lib/api";
import { SENSOR_LABEL, TIER_LABEL } from "@/lib/format";
import { Theme, useTheme } from "@/lib/theme";

/** Status is never color alone: each state has its own shape, and badges add a text label. */
export type Kind = Tier | SensorState;

export function kindColor(kind: Kind, t: Theme) {
  if (kind === "normal" || kind === "ok") return t.good;
  if (kind === "warning" || kind === "degraded") return t.warning;
  if (kind === "alert" || kind === "fault") return t.critical;
  return t.textMuted;
}

export function StatusIcon({ kind, size = 14 }: { kind: Kind; size?: number }) {
  const t = useTheme();
  const c = kindColor(kind, t);
  const ink = kind === "warning" || kind === "degraded" ? "#0b0b0b" : "#ffffff";
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      {(kind === "normal" || kind === "ok") && (
        <>
          <Circle cx="8" cy="8" r="7.5" fill={c} />
          <Path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {(kind === "warning" || kind === "degraded") && (
        <>
          <Path d="M8 1l7.3 13.2H.7z" fill={c} strokeLinejoin="round" />
          <Path d="M8 5.6v4.2" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <Circle cx="8" cy="12" r="1" fill={ink} />
        </>
      )}
      {(kind === "alert" || kind === "fault") && (
        <>
          <Path d="M5 .5h6L15.5 5v6L11 15.5H5L.5 11V5z" fill={c} />
          <Path d="M8 4.2v4.8" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <Circle cx="8" cy="11.6" r="1.05" fill={ink} />
        </>
      )}
      {kind === "no_data" && (
        <>
          <Circle cx="8" cy="8" r="6.6" fill="none" stroke={c} strokeWidth="1.6" />
          <Path d="M5 8h6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

export function StatusBadge({ kind, large }: { kind: Kind; large?: boolean }) {
  const t = useTheme();
  const label = kind in TIER_LABEL ? TIER_LABEL[kind as Tier] : SENSOR_LABEL[kind as SensorState];
  return (
    <View style={[styles.badge, { backgroundColor: t.surface2 }]}>
      <StatusIcon kind={kind} size={large ? 18 : 14} />
      <Text style={[styles.label, { color: t.textPrimary, fontSize: large ? 18 : 13 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  label: { fontWeight: "600" },
});

import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Text as SvgText } from "react-native-svg";
import type { SiteReading } from "@/lib/api";
import { fmtDelta, fmtTemp, fmtTime, SITE_LABELS, SITES, warmerFoot } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { kindColor, StatusIcon } from "./StatusIcon";
import { Muted } from "./ui";

/** Sensor positions on a LEFT sole (medial side on the right); the right foot is mirrored. */
const POS: Record<string, [number, number]> = {
  hallux: [88, 42],
  met1: [86, 104],
  met3: [60, 98],
  met5: [34, 110],
  heel: [60, 238],
};
const W = 120;
const GAP = 36;

const OUTLINE =
  "M60,274 C34,274 22,250 24,218 C26,186 32,162 24,134 C18,110 20,84 32,74 " +
  "C48,64 72,62 98,64 C112,68 110,96 104,124 C98,152 86,168 90,202 C94,238 90,274 60,274 Z";
const TOES: [number, number, number, number][] = [
  [90, 36, 13, 17],
  [68, 34, 8, 10],
  [52, 40, 7, 9],
  [39, 49, 6.5, 8],
  [28, 61, 6, 7],
];

/** Both soles with a marker per sensor. Tap a marker to see its readings. */
export function FootMap({ rows, live }: { rows: SiteReading[]; live?: boolean }) {
  const t = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const bySite = new Map(rows.map((r) => [r.site, r]));
  const info = picked ? bySite.get(picked) : undefined;

  const foot = (side: "left" | "right") => {
    const mx = (px: number) => (side === "left" ? px : W - px);
    return (
      <G key={side} transform={`translate(${side === "left" ? 0 : W + GAP}, 0)`}>
        <G transform={side === "right" ? `translate(${W},0) scale(-1,1)` : undefined}>
          <Path d={OUTLINE} fill={t.footFill} stroke={t.footStroke} strokeWidth={1.5} />
          {TOES.map(([cx, cy, rx, ry], i) => (
            <Ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} fill={t.footFill} stroke={t.footStroke} strokeWidth={1.5} />
          ))}
        </G>
        <SvgText x={W / 2} y={298} textAnchor="middle" fill={t.textSecondary} fontSize={13} fontWeight="600">
          {side === "left" ? "Left" : "Right"}
        </SvgText>
        {SITES.map((s) => {
          const r = bySite.get(s);
          const [px, py] = POS[s];
          const flagged = r && (r.tier === "warning" || r.tier === "alert");
          const isWarm = !!flagged && warmerFoot(r.deltaC) === side;
          const temp = side === "left" ? r?.leftC : r?.rightC;
          const missing = !r || temp === null || temp === undefined;
          const fill = missing ? "transparent" : isWarm ? kindColor(r.tier, t) : t.surface1;
          const stroke = missing ? t.textMuted : isWarm ? kindColor(r.tier, t) : t.axis;
          const sel = picked === s;
          return (
            <G key={s} onPress={() => setPicked(sel ? null : s)}>
              <Circle cx={mx(px)} cy={py} r={18} fill="transparent" />
              {isWarm && r.tier === "alert" && (
                <Circle cx={mx(px)} cy={py} r={15} fill="none" stroke={kindColor("alert", t)} strokeWidth={2} opacity={0.45} />
              )}
              <Circle
                cx={mx(px)} cy={py} r={10}
                fill={fill} stroke={sel ? t.textPrimary : stroke}
                strokeWidth={sel ? 2.5 : 1.5}
                strokeDasharray={missing ? "3 2" : undefined}
              />
            </G>
          );
        })}
      </G>
    );
  };

  return (
    <View style={{ gap: 10 }}>
      <Svg viewBox={`-6 0 ${2 * W + GAP + 12} 310`} style={styles.svg}>
        {foot("left")}
        {foot("right")}
      </Svg>
      <View style={[styles.info, { backgroundColor: t.surface2 }]}>
        {info ? (
          <>
            <View style={styles.infoTitle}>
              <StatusIcon kind={info.tier} />
              <Text style={{ color: t.textPrimary, fontWeight: "600", fontSize: 15 }}>{SITE_LABELS[info.site]}</Text>
            </View>
            <Text style={{ color: t.textPrimary, fontVariant: ["tabular-nums"] }}>
              L {fmtTemp(info.leftC)} · R {fmtTemp(info.rightC)} ·{" "}
              <Text style={{ fontWeight: "700" }}>ΔT {fmtDelta(info.deltaC)} °C</Text>
            </Text>
            <Muted style={{ fontSize: 12 }}>
              {live ? "Live reading (rest rule off)" : `Rest window ${fmtTime(info.restStart)}–${fmtTime(info.restEnd)}`}
              {" · "}{info.reason}
            </Muted>
          </>
        ) : (
          <Muted>Tap a sensor for its readings. A filled marker shows the warmer foot at a flagged spot.</Muted>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  svg: { width: "100%", aspectRatio: (2 * W + GAP + 12) / 310, maxHeight: 320 },
  info: { borderRadius: 10, padding: 10, gap: 4, minHeight: 64 },
  infoTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
});

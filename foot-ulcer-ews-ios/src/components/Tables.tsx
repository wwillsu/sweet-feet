import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { DailyRow, LiveSite, ProfileSummary, SensorRow } from "@/lib/api";
import { fmtDate, fmtDelta, fmtTemp, shortSite, SITES } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { kindColor, StatusBadge, StatusIcon } from "./StatusIcon";
import { Muted } from "./ui";

/** Site × night table: every value the chart shows. Tap a column to select that night. */
export function DayGrid({ rows, dates, selectedDate, onSelect }: {
  rows: DailyRow[];
  dates: string[];
  selectedDate: string;
  onSelect: (d: string) => void;
}) {
  const t = useTheme();
  const cell = new Map(rows.map((r) => [`${r.site}|${r.date}`, r]));
  return (
    <View style={styles.gridWrap}>
      <View>
        <View style={styles.gridHead} />
        {SITES.map((s) => (
          <View key={s} style={styles.gridRowHead}>
            <Text numberOfLines={1} style={{ color: t.textPrimary, fontSize: 12, fontWeight: "500" }}>{shortSite(s)}</Text>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentOffset={{ x: Math.max(0, dates.length * 58 - 240), y: 0 }}>
        {dates.map((d) => {
          const sel = d === selectedDate;
          return (
            <Pressable key={d} onPress={() => onSelect(d)}
              style={[styles.gridCol, sel && { backgroundColor: t.surface2, borderRadius: 8 }]}
              accessibilityRole="button" accessibilityState={{ selected: sel }}>
              <View style={styles.gridHead}>
                <Text style={{ color: sel ? t.textPrimary : t.textSecondary, fontSize: 11, fontWeight: sel ? "700" : "500" }}>
                  {fmtDate(d)}
                </Text>
              </View>
              {SITES.map((s) => {
                const r = cell.get(`${s}|${d}`);
                const tier = r?.tier ?? "no_data";
                const flagged = tier === "warning" || tier === "alert";
                return (
                  <View key={s} style={[styles.gridCell, flagged && { backgroundColor: kindColor(tier, t) + "33" }]}>
                    {tier !== "normal" && <StatusIcon kind={tier} size={10} />}
                    <Text style={{ color: t.textPrimary, fontSize: 12, fontVariant: ["tabular-nums"] }}>{fmtDelta(r?.deltaC)}</Text>
                  </View>
                );
              })}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function SensorPanel({ sensors }: { sensors: SensorRow[] }) {
  const t = useTheme();
  const by = new Map(sensors.map((s) => [`${s.foot}|${s.site}`, s]));
  const asOf = sensors[0]?.asOf;
  return (
    <View style={{ gap: 6 }}>
      {SITES.map((site) => (
        <View key={site} style={[styles.sensorRow, { borderColor: t.border }]}>
          <Text style={{ color: t.textPrimary, fontSize: 13, fontWeight: "500", width: 92 }}>{shortSite(site)}</Text>
          {(["L", "R"] as const).map((foot) => {
            const s = by.get(`${foot}|${site}`);
            const detail = s && [
              s.nRange && `${s.nRange} out-of-range`,
              s.nJump && `${s.nJump} spike`,
              s.nStuck && `${s.nStuck} stuck`,
            ].filter(Boolean).join(", ");
            return (
              <View key={foot} style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.textMuted, fontSize: 11 }}>{foot === "L" ? "Left" : "Right"}</Text>
                {s ? <StatusBadge kind={s.status} /> : <Muted>—</Muted>}
                {s && s.status !== "ok" && (
                  <Muted style={{ fontSize: 11 }}>
                    {s.faultFraction < 0.001 ? "<0.1" : (s.faultFraction * 100).toFixed(1)}% masked{detail ? ` · ${detail}` : ""}
                  </Muted>
                )}
              </View>
            );
          })}
        </View>
      ))}
      {asOf && (
        <Muted style={{ fontSize: 12 }}>
          Faulty samples are excluded before ΔT is computed. Status covers data through {fmtDate(asOf)}.
        </Muted>
      )}
    </View>
  );
}

export function LiveTable({ sites }: { sites: LiveSite[] }) {
  const t = useTheme();
  const by = new Map(sites.map((r) => [r.site, r]));
  const head = { color: t.textMuted, fontSize: 11, fontWeight: "600" as const };
  const num = { color: t.textPrimary, fontSize: 13, fontVariant: ["tabular-nums" as const] };
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.liveRow}>
        <Text style={[head, styles.liveSpot]}>Spot</Text>
        <Text style={[head, styles.liveNum]}>Left</Text>
        <Text style={[head, styles.liveNum]}>Right</Text>
        <Text style={[head, styles.liveNum]}>ΔT</Text>
        <View style={styles.liveIcon} />
      </View>
      {SITES.map((s) => {
        const r = by.get(s);
        return (
          <View key={s} style={[styles.liveRow, { borderTopColor: t.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[num, styles.liveSpot]} numberOfLines={1}>{shortSite(s)}</Text>
            <Text style={[num, styles.liveNum]}>{fmtTemp(r?.leftC)}</Text>
            <Text style={[num, styles.liveNum]}>{fmtTemp(r?.rightC)}</Text>
            <Text style={[num, styles.liveNum, { fontWeight: "700" }]}>{fmtDelta(r?.deltaC)}</Text>
            <View style={styles.liveIcon}>{r && <StatusIcon kind={r.tier} />}</View>
          </View>
        );
      })}
    </View>
  );
}

/** Horizontal chips to switch between data profiles (sample scenarios or "me"). */
export function ProfilePicker({ profiles, current, onPick }: {
  profiles: ProfileSummary[];
  current: string;
  onPick: (id: string) => void;
}) {
  const t = useTheme();
  if (profiles.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {profiles.map((p) => {
        const on = p.patientId === current;
        return (
          <Pressable key={p.patientId} onPress={() => onPick(p.patientId)}
            style={[styles.chip, { backgroundColor: on ? t.textPrimary : t.surface2 }]}
            accessibilityRole="button" accessibilityState={{ selected: on }}>
            <StatusIcon kind={p.worstTier} size={12} />
            <Text style={{ color: on ? t.page : t.textPrimary, fontSize: 13, fontWeight: "600" }}>{p.patientId}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  gridWrap: { flexDirection: "row" },
  gridHead: { height: 26, justifyContent: "center", alignItems: "center" },
  gridRowHead: { height: 30, justifyContent: "center", width: 92, paddingRight: 6 },
  gridCol: { width: 58 },
  gridCell: { height: 30, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 6, margin: 1 },
  sensorRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  liveRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },
  liveSpot: { flex: 1.4 },
  liveNum: { flex: 1, textAlign: "right" },
  liveIcon: { width: 28, alignItems: "flex-end" },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
});

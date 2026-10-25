import { useQuery } from "convex/react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DeltaChart } from "@/components/Charts";
import { FootMap } from "@/components/FootMap";
import { StatusBadge, StatusIcon } from "@/components/StatusIcon";
import { DayGrid, ProfilePicker, SensorPanel } from "@/components/Tables";
import { Callout, Card, Code, Empty, Muted, Screen, Tile, Tiles } from "@/components/ui";
import { api, PatientData } from "@/lib/api";
import {
  ago, alertStreak, CLINICAL, fmtDate, SITE_LABELS, SITES, TIER_LABEL, TIER_RANK, warmerFoot, worstTier,
} from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useTheme } from "@/lib/theme";

const ADVICE = {
  warning: "One warm night is often nothing (a knock, a long walk). Keep wearing the insoles and see if it settles tomorrow.",
  alert: "The same spot has stayed warmer for several nights. Look at that part of your foot today and contact your care team if you see redness, swelling or a wound.",
};

/** Personal tracker: one person's nightly left/right comparison. */
export default function TrackerScreen() {
  const t = useTheme();
  const profiles = useQuery(api.overview);
  const [picked, setPicked] = useState<string | null>(null);
  const list = profiles ? [...profiles].sort((a, b) => a.patientId.localeCompare(b.patientId)) : [];
  const current = list.find((p) => p.patientId === picked)?.patientId
    ?? list.find((p) => p.patientId === "me")?.patientId
    ?? list[0]?.patientId ?? null;

  const live = useQuery(api.patient, current ? { patientId: current } : "skip");
  // Hold the previous profile on screen while a new subscription loads - no flash.
  const [held, setHeld] = useState<PatientData | undefined>(undefined);
  if (live !== undefined && live !== held) setHeld(live);
  const data = live ?? held;

  // null = follow the newest night as data streams in; a date = pinned by the user.
  const [pinned, setPinned] = useState<string | null>(null);
  const now = useNow(1000);

  if (profiles === undefined) return <Screen><Empty title="Connecting…" /></Screen>;
  if (!current) {
    return (
      <Screen>
        <Empty title="No readings yet">
          <Muted>Push the pipeline results from the foot-ulcer-ews folder on the Mac:</Muted>
          <Code>{".venv/bin/python -m pipeline.push_convex --demo"}</Code>
          <Muted>Or open the Live demo tab.</Muted>
        </Empty>
      </Screen>
    );
  }
  if (!data) return <Screen><Empty title="Loading…" /></Screen>;

  const { info, daily, sensors } = data;
  const dates = [...new Set(daily.map((r) => r.date))].sort();
  const picker = (
    <ProfilePicker profiles={list} current={current} onPick={(id) => { setPicked(id); setPinned(null); }} />
  );
  if (!dates.length) return <Screen>{picker}<Empty title="No nights recorded yet." /></Screen>;

  const latest = dates[dates.length - 1];
  const sel = pinned && dates.includes(pinned) ? pinned : latest;
  const idx = dates.indexOf(sel);
  const select = (d: string) => setPinned(d === latest ? null : d);

  const today = daily.filter((r) => r.date === sel);
  const worst = worstTier(today);
  const top = [...today].filter((r) => r.deltaC !== null).sort((a, b) => Math.abs(b.deltaC!) - Math.abs(a.deltaC!))[0];
  const streak = Math.max(0, ...SITES.map((s) => alertStreak(daily.filter((r) => r.site === s), sel)));
  const flagged = today.filter((r) => r.tier === "alert" || r.tier === "warning")
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  const okSensors = sensors.filter((s) => s.status === "ok").length;
  const fresh = now - info.updatedAt < 15000;

  return (
    <Screen>
      {picker}

      <View style={{ gap: 4 }}>
        <Text style={[styles.h1, { color: t.textPrimary }]}>
          {sel === latest ? "Your feet today" : fmtDate(sel, { weekday: "long", month: "short", day: "numeric" })}
        </Text>
        <Muted>
          Measured overnight while your feet were resting.
          {info.patientId !== "me" && info.description ? ` Sample data: ${info.description}` : ""}
        </Muted>
        <View style={styles.freshRow}>
          <View style={[styles.dot, { backgroundColor: fresh ? t.good : t.textMuted }]} />
          <Muted style={{ fontSize: 12 }}>Updated {ago(now - info.updatedAt)}</Muted>
        </View>
      </View>

      <View style={[styles.stepper, { backgroundColor: t.surface1, borderColor: t.border }]}>
        <Pressable onPress={() => select(dates[Math.max(0, idx - 1)])} disabled={idx === 0}
          style={styles.stepBtn} accessibilityLabel="Previous night" hitSlop={8}>
          <Text style={[styles.stepArrow, { color: idx === 0 ? t.textMuted : t.accent }]}>‹</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: t.textPrimary, fontWeight: "600" }}>
            {fmtDate(sel, { weekday: "short", month: "short", day: "numeric" })}
          </Text>
          <Muted style={{ fontSize: 12 }}>night {idx + 1} of {dates.length}</Muted>
        </View>
        <Pressable onPress={() => select(dates[Math.min(dates.length - 1, idx + 1)])} disabled={sel === latest}
          style={styles.stepBtn} accessibilityLabel="Next night" hitSlop={8}>
          <Text style={[styles.stepArrow, { color: sel === latest ? t.textMuted : t.accent }]}>›</Text>
        </Pressable>
      </View>
      {pinned && (
        <Pressable onPress={() => setPinned(null)} style={{ alignSelf: "center", marginTop: -6 }}>
          <Text style={{ color: t.accent, fontWeight: "500" }}>Jump to latest</Text>
        </Pressable>
      )}

      <Tiles>
        <Tile label="How things look" value={<StatusBadge kind={worst} large />}
          sub={flagged.length ? `${flagged.length} spot${flagged.length > 1 ? "s" : ""} to watch` : "left and right feet match"} />
        <Tile label="Biggest difference" value={top ? `${Math.abs(top.deltaC!).toFixed(1)} °C` : "—"}
          sub={top ? `${SITE_LABELS[top.site]} · ${warmerFoot(top.deltaC) ?? "neither"} foot warmer` : "no reliable resting data"} />
        <Tile label={`Nights in a row ≥ ${CLINICAL.alert_c} °C`} value={streak}
          sub={`${CLINICAL.alert_consecutive_days} in a row, same spot and side, means check your feet`} />
        <Tile label="Insole sensors working" value={`${okSensors} / ${sensors.length || 10}`}
          sub={okSensors === sensors.length ? "all readings look reliable" : "see insole health below"} />
      </Tiles>

      {flagged.length > 0 && (
        <Callout tier={flagged[0].tier}>
          {flagged.map((r) => (
            <View key={r.site} style={styles.calloutRow}>
              <StatusIcon kind={r.tier} size={16} />
              <Text style={{ color: t.textPrimary, flex: 1, lineHeight: 20 }}>
                <Text style={{ fontWeight: "700" }}>{TIER_LABEL[r.tier]}</Text> · {r.message}
              </Text>
            </View>
          ))}
          <Muted style={{ fontSize: 12 }}>{ADVICE[flagged[0].tier as "warning" | "alert"]}</Muted>
        </Callout>
      )}

      <Card title={`Your soles · ${fmtDate(sel)}`}>
        <FootMap rows={today} />
      </Card>

      <Card title="Left − right difference, night by night"
        subtitle={`Watch at |ΔT| ≥ ${CLINICAL.warning_c} °C; alert at ≥ ${CLINICAL.alert_c} °C on ${CLINICAL.alert_consecutive_days} consecutive nights, same site and side. Tap the chart to pick a night.`}>
        <DeltaChart rows={daily} dates={dates} selectedDate={sel} onSelect={select} />
      </Card>

      <Card title="Every night" subtitle="ΔT °C (L − R). Tap a night to select it.">
        <DayGrid rows={daily} dates={dates} selectedDate={sel} onSelect={select} />
        <Muted style={{ fontSize: 12 }}>
          Rest window {today[0]?.restStart ? `${today[0].restStart.slice(11, 16)}–${today[0].restEnd?.slice(11, 16)}` : "not found"}
        </Muted>
      </Card>

      <Card title="Insole health">
        <SensorPanel sensors={sensors} />
      </Card>

      <Muted style={{ textAlign: "center", fontSize: 12 }}>A screening aid, not a diagnosis.</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: "700" },
  freshRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  stepper: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 6,
  },
  stepBtn: { width: 44, height: 40, alignItems: "center", justifyContent: "center" },
  stepArrow: { fontSize: 30, fontWeight: "300", marginTop: -4 },
  calloutRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
});

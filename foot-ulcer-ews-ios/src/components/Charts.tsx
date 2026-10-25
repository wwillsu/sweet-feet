import { ReactNode, useState } from "react";
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { DailyRow, LiveSample, Tier } from "@/lib/api";
import { CLINICAL, fmtDate, fmtDelta, shortSite, SITE_LABELS, SITES } from "@/lib/format";
import { Theme, useTheme } from "@/lib/theme";
import { StatusIcon } from "./StatusIcon";
import { Muted } from "./ui";

const H = 230;
const M = { top: 12, right: 12, bottom: 24, left: 34 };
const GAP_MS = 2500; // break the live line if a reading is missing

const siteColor = (t: Theme, site: string) => t.series[SITES.indexOf(site) % t.series.length];

function useWidth() {
  const [w, setW] = useState(320);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.max(240, e.nativeEvent.layout.width));
  return [w, onLayout] as const;
}

/** Symmetric ΔT axis with the warning/alert bands, shared by both charts. */
function useFrame(width: number, maxAbs: number) {
  const yMax = Math.max(3, Math.ceil(maxAbs + 0.3));
  const iw = width - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const y = (v: number) => M.top + ((yMax - v) / (2 * yMax)) * ih;
  const ticks: number[] = [];
  for (let v = -yMax; v <= yMax; v += yMax > 5 ? 2 : 1) ticks.push(v);
  return { yMax, iw, ih, y, ticks };
}

function Bands({ f, t }: { f: ReturnType<typeof useFrame>; t: Theme }) {
  const band = (lo: number, hi: number, fill: string) => (
    <Rect x={M.left} width={f.iw} y={f.y(hi)} height={Math.max(0, f.y(lo) - f.y(hi))} fill={fill} />
  );
  return (
    <G>
      {band(CLINICAL.alert_c, f.yMax, t.zoneAlert)}
      {band(-f.yMax, -CLINICAL.alert_c, t.zoneAlert)}
      {band(CLINICAL.warning_c, CLINICAL.alert_c, t.zoneWarning)}
      {band(-CLINICAL.alert_c, -CLINICAL.warning_c, t.zoneWarning)}
      {f.ticks.map((v) => (
        <G key={v}>
          <Line x1={M.left} x2={M.left + f.iw} y1={f.y(v)} y2={f.y(v)}
            stroke={v === 0 ? t.axis : t.grid} strokeWidth={v === 0 ? 1.5 : 1} />
          <SvgText x={M.left - 6} y={f.y(v) + 4} textAnchor="end" fontSize={10} fill={t.textMuted}>
            {fmtDelta(v, 0)}
          </SvgText>
        </G>
      ))}
      <SvgText x={M.left + 6} y={M.top + 12} fontSize={10} fill={t.textMuted}>▲ left warmer</SvgText>
      <SvgText x={M.left + 6} y={M.top + f.ih - 6} fontSize={10} fill={t.textMuted}>▼ right warmer</SvgText>
    </G>
  );
}

function Legend({ emph, setEmph }: { emph: string | null; setEmph: (s: string | null) => void }) {
  const t = useTheme();
  return (
    <View style={styles.legend}>
      {SITES.map((s) => (
        <Pressable key={s} onPress={() => setEmph(emph === s ? null : s)}
          style={[styles.legendItem, { opacity: emph && emph !== s ? 0.4 : 1 }]}
          accessibilityRole="button" accessibilityState={{ selected: emph === s }}>
          <View style={[styles.key, { backgroundColor: siteColor(t, s) }]} />
          <Text style={{ color: t.textSecondary, fontSize: 12 }}>{shortSite(s)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Per-site values at the selected point, sorted by |ΔT| - the phone's stand-in for a hover tooltip. */
function Readout({ title, rows }: {
  title: string;
  rows: { site: string; deltaC: number | null | undefined; tier?: Tier }[];
}) {
  const t = useTheme();
  const sorted = [...rows].sort((a, b) => Math.abs(b.deltaC ?? -1) - Math.abs(a.deltaC ?? -1));
  return (
    <View style={[styles.readout, { backgroundColor: t.surface2 }]}>
      <Text style={{ color: t.textPrimary, fontWeight: "600", marginBottom: 2 }}>{title}</Text>
      {sorted.map((r) => (
        <View key={r.site} style={styles.readoutRow}>
          <View style={[styles.key, { backgroundColor: siteColor(t, r.site) }]} />
          <Text style={[styles.readoutVal, { color: t.textPrimary }]}>
            {r.deltaC === null || r.deltaC === undefined ? "—" : `${fmtDelta(r.deltaC)} °C`}
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 13, flex: 1 }}>{SITE_LABELS[r.site]}</Text>
          {r.tier && r.tier !== "normal" && <StatusIcon kind={r.tier} size={13} />}
        </View>
      ))}
    </View>
  );
}

/** Touch surface: reports the x position while a finger is down. */
function Scrubber({ onX, onEnd, children }: { onX: (x: number) => void; onEnd?: () => void; children: ReactNode }) {
  const x = (e: GestureResponderEvent) => onX(e.nativeEvent.locationX);
  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={x}
      onResponderMove={x}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
    >
      {children}
    </View>
  );
}

/** ΔT = left − right per site per night. Tap or drag across the chart to pick a night. */
export function DeltaChart({ rows, dates, selectedDate, onSelect }: {
  rows: DailyRow[];
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const t = useTheme();
  const [width, onLayout] = useWidth();
  const [emph, setEmph] = useState<string | null>(null);
  const cell = new Map(rows.map((r) => [`${r.site}|${r.date}`, r]));
  const get = (site: string, date: string) => cell.get(`${site}|${date}`);

  const maxAbs = rows.reduce((m, r) => (r.deltaC === null ? m : Math.max(m, Math.abs(r.deltaC))), 0);
  const f = useFrame(width, maxAbs);
  const step = dates.length > 1 ? f.iw / (dates.length - 1) : 0;
  const x = (i: number) => M.left + (dates.length > 1 ? i * step : f.iw / 2);
  const idxAt = (px: number) => Math.min(dates.length - 1, Math.max(0, Math.round(step ? (px - M.left) / step : 0)));
  const sel = Math.max(0, dates.indexOf(selectedDate));
  const labelEvery = Math.max(1, Math.ceil(44 / Math.max(step, 1)));
  const last = dates.length - 1;

  return (
    <View style={{ gap: 8 }}>
      <Legend emph={emph} setEmph={setEmph} />
      <View onLayout={onLayout}>
        <Scrubber onX={(px) => { const i = idxAt(px); if (dates[i] !== selectedDate) onSelect(dates[i]); }}>
          <Svg width={width} height={H}>
            <Bands f={f} t={t} />
            <Rect x={Math.max(M.left, x(sel) - Math.max(5, step / 2))} y={M.top}
              width={Math.max(10, step)} height={f.ih} fill={t.textPrimary} opacity={0.06} />
            <Line x1={x(sel)} x2={x(sel)} y1={M.top} y2={M.top + f.ih} stroke={t.textMuted} strokeWidth={1} strokeDasharray="3 3" />
            {dates.map((d, i) =>
              (i % labelEvery === 0 && last - i >= labelEvery) || i === last ? (
                <SvgText key={d} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={t.textMuted}>{fmtDate(d)}</SvgText>
              ) : null,
            )}
            {SITES.map((site) => {
              let d = "";
              let pen = false;
              dates.forEach((date, i) => {
                const v = get(site, date)?.deltaC;
                if (v === null || v === undefined) { pen = false; return; }
                d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${f.y(v).toFixed(1)}`;
                pen = true;
              });
              return <Path key={site} d={d} fill="none" stroke={siteColor(t, site)} strokeWidth={2}
                strokeLinejoin="round" opacity={emph && emph !== site ? 0.15 : 1} />;
            })}
            {SITES.map((s) => {
              const v = get(s, selectedDate)?.deltaC;
              return v === null || v === undefined ? null : (
                <Circle key={s} cx={x(sel)} cy={f.y(v)} r={4} fill={siteColor(t, s)} stroke={t.surface1} strokeWidth={1.5}
                  opacity={emph && emph !== s ? 0.2 : 1} />
              );
            })}
          </Svg>
        </Scrubber>
      </View>
      <Readout
        title={fmtDate(selectedDate, { weekday: "short", month: "short", day: "numeric" })}
        rows={SITES.map((s) => ({ site: s, deltaC: get(s, selectedDate)?.deltaC, tier: get(s, selectedDate)?.tier }))}
      />
    </View>
  );
}

/** Live ΔT per site over the last `windowS` seconds. Drag to scrub back in time. */
export function LiveChart({ samples, windowS }: { samples: LiveSample[]; windowS: number }) {
  const t = useTheme();
  const [width, onLayout] = useWidth();
  const [emph, setEmph] = useState<string | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);

  const tEnd = samples.length ? samples[samples.length - 1].t : 0;
  // Grow with the data until the window is full, so a fresh demo isn't squeezed into the right edge.
  const spanS = Math.min(windowS, Math.max(30, samples.length ? (tEnd - samples[0].t) / 1000 : 0));
  const tStart = tEnd - spanS * 1000;
  const maxAbs = samples.reduce(
    (m, s) => s.sites.reduce((mm, r) => (r.deltaC === null ? mm : Math.max(mm, Math.abs(r.deltaC))), m), 0);
  const f = useFrame(width, maxAbs);
  const x = (tt: number) => M.left + ((tt - tStart) / (tEnd - tStart)) * f.iw;
  const xStep = spanS > 120 ? 60 : spanS > 60 ? 30 : 10;
  const xTicks: number[] = [];
  for (let s = 0; s <= spanS; s += xStep) xTicks.push(s);

  const nearest = (px: number) => {
    const tt = tStart + ((px - M.left) / f.iw) * (tEnd - tStart);
    let best = 0;
    samples.forEach((s, i) => { if (Math.abs(s.t - tt) < Math.abs(samples[best].t - tt)) best = i; });
    return best;
  };
  const active = samples[scrub !== null && scrub < samples.length ? scrub : samples.length - 1];

  return (
    <View style={{ gap: 8 }}>
      <Legend emph={emph} setEmph={setEmph} />
      <View onLayout={onLayout}>
        <Scrubber onX={(px) => samples.length && setScrub(nearest(px))} onEnd={() => setScrub(null)}>
          <Svg width={width} height={H}>
            <Bands f={f} t={t} />
            {xTicks.map((s) => (
              <SvgText key={s} x={x(tEnd - s * 1000)} y={H - 6} textAnchor="middle" fontSize={10} fill={t.textMuted}>
                {s === 0 ? "now" : `−${s}s`}
              </SvgText>
            ))}
            {SITES.map((site) => {
              let d = "";
              let prevT: number | null = null;
              for (const s of samples) {
                const v = s.sites.find((r) => r.site === site)?.deltaC;
                if (v === null || v === undefined) { prevT = null; continue; }
                const pen = prevT !== null && s.t - prevT < GAP_MS;
                d += `${pen ? "L" : "M"}${x(s.t).toFixed(1)},${f.y(v).toFixed(1)}`;
                prevT = s.t;
              }
              return <Path key={site} d={d} fill="none" stroke={siteColor(t, site)} strokeWidth={2}
                strokeLinejoin="round" opacity={emph && emph !== site ? 0.15 : 1} />;
            })}
            {active && (
              <G>
                {scrub !== null && (
                  <Line x1={x(active.t)} x2={x(active.t)} y1={M.top} y2={M.top + f.ih} stroke={t.textMuted} strokeDasharray="3 3" />
                )}
                {active.sites.map((r) => r.deltaC === null ? null : (
                  <Circle key={r.site} cx={x(active.t)} cy={f.y(r.deltaC)} r={4} fill={siteColor(t, r.site)}
                    stroke={t.surface1} strokeWidth={1.5} opacity={emph && emph !== r.site ? 0.2 : 1} />
                ))}
              </G>
            )}
          </Svg>
        </Scrubber>
      </View>
      {active ? (
        <Readout title={scrub === null ? "Now" : new Date(active.t).toLocaleTimeString()} rows={active.sites} />
      ) : (
        <Muted>Waiting for readings…</Muted>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 2 },
  key: { width: 12, height: 3, borderRadius: 2 },
  readout: { borderRadius: 10, padding: 10, gap: 3 },
  readoutRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  readoutVal: { width: 72, fontWeight: "700", fontVariant: ["tabular-nums"] },
});

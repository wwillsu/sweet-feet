import type { DailyRow, SensorState, Tier } from "./api";
import config from "./config.json";

/** Thresholds come from the same config.json the Python pipeline reads (synced by scripts/configure.mjs). */
export const CLINICAL = config.clinical;
export const SITES: string[] = config.sites;
export const SITE_LABELS: Record<string, string> = config.site_labels;
export const LIVE_DEMO = config.live_demo;

export const TIER_LABEL: Record<Tier, string> = {
  normal: "Normal",
  warning: "Warning",
  alert: "Alert",
  no_data: "No data",
};
export const TIER_RANK: Record<Tier, number> = { no_data: 0, normal: 1, warning: 2, alert: 3 };
export const SENSOR_LABEL: Record<SensorState, string> = { ok: "OK", degraded: "Degraded", fault: "Fault" };

export const shortSite = (s: string) => SITE_LABELS[s].replace(" metatarsal head", " met. head");

export function fmtDelta(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  const s = Math.abs(v).toFixed(digits);
  if (Number(s) === 0) return s; // no "−0.0"
  return v > 0 ? `+${s}` : `−${s}`;
}

export function fmtTemp(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${v.toFixed(1)} °C`;
}

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, opts);
}

export function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts.replace(" ", "T")).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

export function warmerFoot(dt: number | null): "left" | "right" | null {
  if (dt === null || dt === 0) return null;
  return dt > 0 ? "left" : "right";
}

export function worstTier(rows: { tier: Tier }[]): Tier {
  return rows.reduce<Tier>((w, r) => (TIER_RANK[r.tier] > TIER_RANK[w] ? r.tier : w), "no_data");
}

/** Consecutive days up to `date` with |ΔT| ≥ alert threshold and the same sign. */
export function alertStreak(rows: DailyRow[], date: string): number {
  const byDate = new Map(rows.map((r) => [r.date, r.deltaC]));
  let n = 0;
  let sign = 0;
  for (let d = date; ; d = prevDate(d)) {
    const v = byDate.get(d);
    if (v === null || v === undefined || Math.abs(v) < CLINICAL.alert_c) break;
    if (sign && Math.sign(v) !== sign) break;
    sign = Math.sign(v);
    n++;
  }
  return n;
}

function prevDate(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

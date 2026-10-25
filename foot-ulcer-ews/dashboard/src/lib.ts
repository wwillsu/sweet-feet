import { useQuery } from "convex/react";
import type { WithoutSystemFields } from "convex/server";
import type { Doc } from "../../convex/_generated/dataModel";
import config from "../../config.json";
import saved from "../../data/dashboard.json";

export type Tier = Doc<"daily">["tier"];
export type DailyRow = WithoutSystemFields<Doc<"daily">>;
export type SensorRow = WithoutSystemFields<Doc<"sensors">>;
export type SensorState = SensorRow["status"];
export type LiveSample = Doc<"live">;
/** What the foot map needs per site - a daily row or one live reading. */
export type SiteReading = Pick<DailyRow, "site" | "leftC" | "rightC" | "deltaC" | "tier" | "reason">
  & Partial<Pick<DailyRow, "restStart" | "restEnd">>;

/** Thresholds come from the same config.json the Python pipeline reads. */
export const CLINICAL = config.clinical;
export const SITES: string[] = config.sites;
export const SITE_LABELS: Record<string, string> = config.site_labels;
export const LIVE_DEMO = config.live_demo;

/** Display names for the sample profiles (the ids stay as they are in the data and Convex). */
const PROFILE_LABELS: Record<string, string> = {
  me: "My data",
  P0_control: "Healthy feet",
  S1_hotspot: "Developing hotspot",
  S4_sensor_fault: "Faulty sensor",
};
export const profileLabel = (id: string) => PROFILE_LABELS[id] ?? id;

/** Convex is optional: without VITE_CONVEX_URL there is no client, so queries just stay unloaded. */
export const HAS_CONVEX = Boolean(import.meta.env.VITE_CONVEX_URL);
export const useConvexQuery = (HAS_CONVEX ? useQuery : () => undefined) as typeof useQuery;

/** Daily tracker data bundled with the dashboard (`python -m pipeline.export_static`), so the
 *  tracker works without Convex. Convex data for the same profile takes precedence. */
type Saved = {
  patients: { patientId: string; description: string }[];
  daily: DailyRow[];
  sensors: SensorRow[];
};
export const SAVED = saved as unknown as Saved;

export function savedPatient(patientId: string) {
  const info = SAVED.patients.find((p) => p.patientId === patientId);
  if (!info) return null;
  return {
    info,
    daily: SAVED.daily.filter((r) => r.patientId === patientId),
    sensors: SAVED.sensors.filter((s) => s.patientId === patientId),
  };
}

/** Categorical slots 1-5 (validated: adjacent CVD ΔE ≥ 8.4, normal-vision ≥ 19.3, both modes).
 *  Fixed per site so a site keeps its color everywhere. */
export const SITE_VAR: Record<string, string> = Object.fromEntries(
  SITES.map((s, i) => [s, `var(--series-${i + 1})`]),
);

export const TIER_LABEL: Record<Tier, string> = {
  normal: "Normal",
  warning: "Warning",
  alert: "Alert",
  no_data: "No data",
};
export const TIER_RANK: Record<Tier, number> = { no_data: 0, normal: 1, warning: 2, alert: 3 };

export const SENSOR_LABEL: Record<SensorState, string> = { ok: "OK", degraded: "Degraded", fault: "Fault" };

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

export function fmtTime(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts.replace(" ", "T")).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function warmerFoot(dt: number | null): "left" | "right" | null {
  if (dt === null || dt === 0) return null;
  return dt > 0 ? "left" : "right";
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

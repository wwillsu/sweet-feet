/**
 * Typed references to the queries in ../foot-ulcer-ews/convex/dashboard.ts.
 * The app is read-only: it never calls the ingest mutations and never holds INGEST_KEY.
 */
import { makeFunctionReference } from "convex/server";

export type Tier = "normal" | "warning" | "alert" | "no_data";
export type SensorState = "ok" | "degraded" | "fault";

export type DailyRow = {
  _id: string;
  patientId: string;
  date: string; // YYYY-MM-DD; the day window is [date-1 12:00, date 12:00)
  site: string;
  leftC: number | null;
  rightC: number | null;
  deltaC: number | null; // left - right
  tier: Tier;
  reason: string;
  restStart: string | null;
  restEnd: string | null;
  message: string;
};

export type SensorRow = {
  _id: string;
  patientId: string;
  foot: "L" | "R";
  site: string;
  faultFraction: number;
  nRange: number;
  nJump: number;
  nStuck: number;
  status: SensorState;
  lastFault: string | null;
  asOf: string;
};

export type LiveSite = Pick<DailyRow, "site" | "leftC" | "rightC" | "deltaC" | "tier" | "reason">;
export type LiveSample = { _id: string; t: number; sites: LiveSite[] };

/** What the foot map needs per site: a daily row or one live reading. */
export type SiteReading = LiveSite & Partial<Pick<DailyRow, "restStart" | "restEnd">>;

export type ProfileSummary = {
  patientId: string;
  description: string;
  updatedAt: number;
  latestDate: string | null;
  nDays: number;
  worstTier: Tier;
  alertSites: string[];
  maxAbsDelta: number | null;
  maxSite: string | null;
  sensorIssues: number;
  sensorFaults: number;
};

export type PatientData = {
  info: { patientId: string; description: string; updatedAt: number };
  daily: DailyRow[];
  sensors: SensorRow[];
} | null;

export const api = {
  overview: makeFunctionReference<"query", Record<string, never>, ProfileSummary[]>("dashboard:overview"),
  patient: makeFunctionReference<"query", { patientId: string }, PatientData>("dashboard:patient"),
  live: makeFunctionReference<"query", { seconds: number }, LiveSample[]>("dashboard:live"),
};

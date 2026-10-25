import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const tier = v.union(v.literal("normal"), v.literal("warning"), v.literal("alert"), v.literal("no_data"));
export const sensorState = v.union(v.literal("ok"), v.literal("degraded"), v.literal("fault"));
const num = v.union(v.number(), v.null());
const str = v.union(v.string(), v.null());

/** One row per (patient, date, site) - mirrors data/daily.csv, written by pipeline/push_convex.py. */
export const dailyFields = {
  patientId: v.string(),
  date: v.string(), // YYYY-MM-DD; the day window is [date-1 12:00, date 12:00)
  site: v.string(),
  leftC: num,
  rightC: num,
  deltaC: num, // left - right
  tier,
  reason: v.string(),
  restStart: str,
  restEnd: str,
  message: v.string(),
};

/** One row per (patient, foot, site) - fault summary up to `asOf`. */
export const sensorFields = {
  patientId: v.string(),
  foot: v.union(v.literal("L"), v.literal("R")),
  site: v.string(),
  faultFraction: v.number(),
  nRange: v.number(),
  nJump: v.number(),
  nStuck: v.number(),
  status: sensorState,
  lastFault: str,
  asOf: v.string(),
};

/** Live demo mode: one reading per site, taken every second, rest-window rule OFF. */
export const liveSiteFields = {
  site: v.string(),
  leftC: num,
  rightC: num,
  deltaC: num,
  tier,
  reason: v.string(),
};

export default defineSchema({
  patients: defineTable({
    patientId: v.string(),
    description: v.string(),
    updatedAt: v.number(),
  }).index("by_patientId", ["patientId"]),
  daily: defineTable(dailyFields).index("by_patient_date_site", ["patientId", "date", "site"]),
  sensors: defineTable(sensorFields).index("by_patient_sensor", ["patientId", "foot", "site"]),
  live: defineTable({ t: v.number(), sites: v.array(v.object(liveSiteFields)) }).index("by_t", ["t"]),
});

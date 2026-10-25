/** Read path for the dashboard. Both queries are reactive: pushes show up live. */
import { v } from "convex/values";
import { query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

const TIER_RANK = { no_data: 0, normal: 1, warning: 2, alert: 3 } as const;
const MAX_LIVE_SECONDS = 3600;

/** Profiles available to the personal tracker, each judged on its most recent day. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const patients = await ctx.db.query("patients").collect();
    const out = [];
    for (const p of patients) {
      const days = await ctx.db
        .query("daily")
        .withIndex("by_patient_date_site", (q) => q.eq("patientId", p.patientId))
        .collect();
      const sensors = await ctx.db
        .query("sensors")
        .withIndex("by_patient_sensor", (q) => q.eq("patientId", p.patientId))
        .collect();
      const latestDate = days.length ? days[days.length - 1].date : null; // index is date-ordered
      const latest = days.filter((d) => d.date === latestDate);
      let worst: Doc<"daily">["tier"] = "no_data";
      let maxAbs: number | null = null;
      let maxSite: string | null = null;
      for (const d of latest) {
        if (TIER_RANK[d.tier] > TIER_RANK[worst]) worst = d.tier;
        if (d.deltaC !== null && (maxAbs === null || Math.abs(d.deltaC) > maxAbs)) {
          maxAbs = Math.abs(d.deltaC);
          maxSite = d.site;
        }
      }
      out.push({
        patientId: p.patientId,
        description: p.description,
        updatedAt: p.updatedAt,
        latestDate,
        nDays: new Set(days.map((d) => d.date)).size,
        worstTier: worst,
        alertSites: latest.filter((d) => d.tier === "alert").map((d) => d.site),
        maxAbsDelta: maxAbs,
        maxSite,
        sensorIssues: sensors.filter((s) => s.status !== "ok").length,
        sensorFaults: sensors.filter((s) => s.status === "fault").length,
      });
    }
    return out;
  },
});

export const patient = query({
  args: { patientId: v.string() },
  handler: async (ctx, { patientId }) => {
    const info = await ctx.db
      .query("patients")
      .withIndex("by_patientId", (q) => q.eq("patientId", patientId))
      .unique();
    if (!info) return null;
    const daily = await ctx.db
      .query("daily")
      .withIndex("by_patient_date_site", (q) => q.eq("patientId", patientId))
      .collect();
    const sensors = await ctx.db
      .query("sensors")
      .withIndex("by_patient_sensor", (q) => q.eq("patientId", patientId))
      .collect();
    return { info, daily, sensors };
  },
});

/** Live demo stream, oldest first: the last `seconds` of per-second readings. */
export const live = query({
  args: { seconds: v.number() },
  handler: async (ctx, args) => {
    const seconds = Math.min(MAX_LIVE_SECONDS, Math.max(1, Number.isFinite(args.seconds) ? args.seconds : 1));
    const rows = await ctx.db.query("live").withIndex("by_t").order("desc").take(Math.ceil(seconds * 1.5) + 5);
    const newest = rows[0]?.t ?? 0;
    return rows.filter((r) => r.t >= newest - seconds * 1000).reverse();
  },
});

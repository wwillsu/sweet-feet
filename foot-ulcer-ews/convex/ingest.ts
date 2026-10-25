/**
 * Write path, called over Convex's HTTP API by pipeline/push_convex.py and pipeline/live.py.
 *
 * These are public mutations so the Python side needs no Convex SDK, so they
 * are guarded by a shared secret: set INGEST_KEY on the deployment
 * (`npx convex env set INGEST_KEY <secret>`) and every call must pass the same key.
 * Without INGEST_KEY every write is refused. That includes the local backend,
 * which listens on all interfaces, so anyone on the same Wi-Fi can reach it.
 * `npm run setup-key` generates a key, sets it here and saves it to .env.local.
 */
import { v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import { dailyFields, liveSiteFields, sensorFields } from "./schema";

const key = v.optional(v.string());

const MAX_ROWS = 2000; // one push is at most a few patients x days x sites
const MAX_LIVE_SITES = 20;
const MAX_STR = 500;
const MAX_KEEP_MS = 60 * 60 * 1000;

/** Constant-time string compare, so the key can't be guessed byte by byte from response timing. */
function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function checkKey(k: string | undefined) {
  const expected = process.env.INGEST_KEY;
  if (!expected) throw new Error("INGEST_KEY is not set on this deployment; run `npm run setup-key`");
  if (k === undefined || !safeEqual(k, expected)) throw new Error("invalid ingest key");
}

function checkStrings(obj: Record<string, unknown>) {
  for (const [field, value] of Object.entries(obj)) {
    if (typeof value === "string" && value.length > MAX_STR) throw new Error(`${field} too long`);
  }
}

function checkRows(rows: Record<string, unknown>[], max = MAX_ROWS) {
  if (rows.length > max) throw new Error(`too many rows (${rows.length} > ${max})`);
  for (const row of rows) checkStrings(row);
}

async function touchPatient(ctx: MutationCtx, patientId: string, description?: string) {
  const existing = await ctx.db
    .query("patients")
    .withIndex("by_patientId", (q) => q.eq("patientId", patientId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { updatedAt: Date.now(), ...(description ? { description } : {}) });
  } else {
    await ctx.db.insert("patients", { patientId, description: description ?? "", updatedAt: Date.now() });
  }
}

export const reset = mutation({
  args: { key },
  handler: async (ctx, args) => {
    checkKey(args.key);
    for (const table of ["daily", "sensors", "patients", "live"] as const) {
      for (const doc of await ctx.db.query(table).collect()) await ctx.db.delete(doc._id);
    }
  },
});

export const upsertPatient = mutation({
  args: { key, patientId: v.string(), description: v.string() },
  handler: async (ctx, args) => {
    checkKey(args.key);
    checkStrings({ patientId: args.patientId, description: args.description });
    await touchPatient(ctx, args.patientId, args.description);
  },
});

export const upsertDaily = mutation({
  args: { key, rows: v.array(v.object(dailyFields)) },
  handler: async (ctx, args) => {
    checkKey(args.key);
    checkRows(args.rows);
    const patients = new Set<string>();
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("daily")
        .withIndex("by_patient_date_site", (q) =>
          q.eq("patientId", row.patientId).eq("date", row.date).eq("site", row.site))
        .unique();
      if (existing) await ctx.db.replace(existing._id, row);
      else await ctx.db.insert("daily", row);
      patients.add(row.patientId);
    }
    for (const p of patients) await touchPatient(ctx, p);
    return args.rows.length;
  },
});

export const upsertSensors = mutation({
  args: { key, rows: v.array(v.object(sensorFields)) },
  handler: async (ctx, args) => {
    checkKey(args.key);
    checkRows(args.rows);
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("sensors")
        .withIndex("by_patient_sensor", (q) =>
          q.eq("patientId", row.patientId).eq("foot", row.foot).eq("site", row.site))
        .unique();
      if (existing) await ctx.db.replace(existing._id, row);
      else await ctx.db.insert("sensors", row);
    }
    return args.rows.length;
  },
});

/** Live demo mode (pipeline/live.py): append one reading, drop anything older than keepMs. */
export const pushLive = mutation({
  args: { key, t: v.number(), sites: v.array(v.object(liveSiteFields)), keepMs: v.number() },
  handler: async (ctx, args) => {
    checkKey(args.key);
    checkRows(args.sites, MAX_LIVE_SITES);
    if (!Number.isFinite(args.t)) throw new Error("invalid timestamp");
    const keepMs = Math.min(MAX_KEEP_MS, Math.max(1000, Number.isFinite(args.keepMs) ? args.keepMs : MAX_KEEP_MS));
    await ctx.db.insert("live", { t: args.t, sites: args.sites });
    const old = await ctx.db
      .query("live")
      .withIndex("by_t", (q) => q.lt("t", args.t - keepMs))
      .take(100);
    for (const doc of old) await ctx.db.delete(doc._id);
  },
});

export const clearLive = mutation({
  args: { key },
  handler: async (ctx, args) => {
    checkKey(args.key);
    for (const doc of await ctx.db.query("live").collect()) await ctx.db.delete(doc._id);
  },
});

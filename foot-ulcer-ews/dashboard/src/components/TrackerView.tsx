import { ReactNode, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  alertStreak, CLINICAL, fmtDate, fmtDelta, savedPatient, SITE_LABELS, SITES, Tier, TIER_LABEL, TIER_RANK,
  useConvexQuery, warmerFoot,
} from "../lib";
import { DayGrid } from "./DayGrid";
import { DeltaChart } from "./DeltaChart";
import { FootMap } from "./FootMap";
import { SensorPanel } from "./SensorPanel";
import { StatusBadge, StatusIcon } from "./StatusIcon";

const ADVICE = {
  warning: "One warm day is often nothing (a knock, a long walk). Keep wearing the insoles and see if it settles tomorrow.",
  alert: "The same spot has stayed warmer for several days in a row. Look at that part of your foot today and contact your care team if you see redness, swelling or a wound.",
};

/** Personal tracker: one person's daily resting left/right comparison. */
export function TrackerView({ patientId, picker }: { patientId: string; picker?: ReactNode }) {
  const remote = useConvexQuery(api.dashboard.patient, { patientId });
  // Hold the previous render while a subscription reconnects - no flash, no layout jump.
  const last = useRef(remote);
  if (remote !== undefined) last.current = remote;
  // Convex wins when it has this profile; otherwise (offline, or never pushed) use the bundled data.
  const data = (remote ?? last.current) ?? savedPatient(patientId) ?? (remote === undefined ? undefined : null);
  // null = follow the newest day as data streams in; a date = pinned by the user.
  const [pinned, setPinned] = useState<string | null>(null);

  if (data === undefined) return <div className="empty">Loading…</div>;
  if (data === null) return <div className="empty">No data for {patientId}.</div>;

  const { info, daily, sensors } = data;
  const dates = [...new Set(daily.map((r) => r.date))].sort();
  if (!dates.length) return <div className="empty">No days recorded yet.</div>;
  const latest = dates[dates.length - 1];
  const sel = pinned && dates.includes(pinned) ? pinned : latest;
  const select = (d: string) => setPinned(d === latest ? null : d);

  const today = daily.filter((r) => r.date === sel);
  const worst = today.reduce<Tier>((w, r) => (TIER_RANK[r.tier] > TIER_RANK[w] ? r.tier : w), "no_data");
  const top = [...today]
    .filter((r) => r.deltaC !== null)
    .sort((a, b) => Math.abs(b.deltaC!) - Math.abs(a.deltaC!))[0];
  const streak = Math.max(0, ...SITES.map((s) => alertStreak(daily.filter((r) => r.site === s), sel)));
  const flagged = today.filter((r) => r.tier === "alert" || r.tier === "warning")
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  const okSensors = sensors.filter((s) => s.status === "ok").length;

  return (
    <div className={`patient-view ${remote === undefined && last.current ? "refetching" : ""}`}>
      <header className="pv-header">
        <div>
          <h2>{sel === latest ? "Your feet today" : `Your feet on ${fmtDate(sel, { weekday: "short", month: "short", day: "numeric" })}`}</h2>
          <p className="muted">
            Measured while your feet were resting.
            {info.patientId !== "me" && info.description ? ` Sample data: ${info.description}` : ""}
          </p>
        </div>
        <div className="pv-controls">
          {picker}
          <div className="day-picker">
            <button onClick={() => select(dates[Math.max(0, dates.indexOf(sel) - 1)])} disabled={sel === dates[0]} aria-label="Previous day">‹</button>
            <span className="day-label">
              {fmtDate(sel, { weekday: "short", month: "short", day: "numeric" })}
              <span className="muted"> · day {dates.indexOf(sel) + 1} of {dates.length}</span>
            </span>
            <button onClick={() => select(dates[Math.min(dates.length - 1, dates.indexOf(sel) + 1)])} disabled={sel === latest} aria-label="Next day">›</button>
          </div>
        </div>
      </header>

      <section className="tiles">
        <div className="tile">
          <div className="tile-label">How things look</div>
          <div className="tile-value"><StatusBadge kind={worst} /></div>
          <div className="tile-sub muted">{flagged.length ? `${flagged.length} spot${flagged.length > 1 ? "s" : ""} to watch` : "left and right feet match"}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Biggest left–right difference</div>
          <div className="tile-value">{top ? `${Math.abs(top.deltaC!).toFixed(1)} °C` : "—"}</div>
          <div className="tile-sub muted">{top ? `${SITE_LABELS[top.site]} · ${warmerFoot(top.deltaC) ?? "neither"} foot warmer` : "no reliable resting data"}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Days in a row ≥ {CLINICAL.alert_c} °C</div>
          <div className="tile-value">{streak}</div>
          <div className="tile-sub muted">{CLINICAL.alert_consecutive_days} in a row, same spot and side, means check your feet</div>
        </div>
        <div className="tile">
          <div className="tile-label">Insole sensors working</div>
          <div className="tile-value">{okSensors} / {sensors.length || 10}</div>
          <div className="tile-sub muted">{okSensors === sensors.length ? "all readings look reliable" : "see sensor health below"}</div>
        </div>
      </section>

      {flagged.length > 0 && (
        <section className={`callout callout-${flagged[0].tier}`} aria-live="polite">
          {flagged.map((r) => (
            <div key={r.site} className="callout-row">
              <StatusIcon kind={r.tier} size={16} />
              <div>
                <strong>{TIER_LABEL[r.tier]}</strong> · {r.message}
              </div>
            </div>
          ))}
          <p className="small muted">{ADVICE[flagged[0].tier as "warning" | "alert"]}</p>
        </section>
      )}

      <section className="row">
        <div className="card card-map">
          <h3>Your soles · {fmtDate(sel)}</h3>
          <FootMap rows={today} />
        </div>
        <div className="card card-chart">
          <h3>Left − right difference, day by day</h3>
          <p className="muted small">
            Typical temperature while resting each day. Watch at |ΔT| ≥ {CLINICAL.warning_c} °C; alert at ≥ {CLINICAL.alert_c} °C on{" "}
            {CLINICAL.alert_consecutive_days} consecutive days, same site and side.
          </p>
          <DeltaChart rows={daily} dates={dates} selectedDate={sel} onSelect={select} />
        </div>
      </section>

      <section className="card">
        <h3>Every day</h3>
        <DayGrid rows={daily} dates={dates} selectedDate={sel} onSelect={select} />
        <p className="muted small">
          Selected: {fmtDate(sel)} · rest window{" "}
          {today[0]?.restStart ? `${today[0].restStart.slice(11, 16)}–${today[0].restEnd?.slice(11, 16)}` : "not found"}
          {top ? ` · largest ΔT ${fmtDelta(top.deltaC)} °C` : ""}
        </p>
      </section>

      <section className="card">
        <h3>Sensor health</h3>
        <SensorPanel sensors={sensors} />
      </section>
    </div>
  );
}

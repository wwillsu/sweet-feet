import {
  CLINICAL, fmtDelta, fmtTemp, LIVE_DEMO, LiveSample, SITE_LABELS, SITES, Tier, TIER_LABEL, TIER_RANK, warmerFoot,
} from "../lib";
import { FootMap } from "./FootMap";
import { LiveChart } from "./LiveChart";
import { StatusBadge, StatusIcon } from "./StatusIcon";

/** Demo mode: a reading every second, compared immediately - the resting rule is switched off. */
export function LiveView({ samples, streaming }: { samples: LiveSample[]; streaming: boolean }) {
  const banner = (
    <section className="callout callout-demo">
      <div>
        <strong>Demo mode · resting rule off.</strong> Temperature is taken every {LIVE_DEMO.interval_s} s and compared
        left vs right straight away. Normally only readings taken while your feet are resting are compared, so walking or
        touching a sensor here will move the numbers. Alert after {LIVE_DEMO.alert_consecutive_samples} readings in a
        row at ≥ {CLINICAL.alert_c} °C (instead of {CLINICAL.alert_consecutive_days} days).
      </div>
    </section>
  );

  if (!samples.length) {
    return (
      <div className="patient-view">
        {banner}
        <div className="empty">
          <h2>No live readings yet</h2>
          <p>Start the live demo from the project root. It connects to the Arduino over Bluetooth and starts tracking:</p>
          <pre>python -m pipeline.live              # FootMonitor Arduino{"\n"}python -m pipeline.live --simulate   # no board: simulated insoles, 60 s hotspot story</pre>
        </div>
      </div>
    );
  }

  const now = samples[samples.length - 1];
  const worst = now.sites.reduce<Tier>((w, r) => (TIER_RANK[r.tier] > TIER_RANK[w] ? r.tier : w), "no_data");
  const top = now.sites.filter((r) => r.deltaC !== null).sort((a, b) => Math.abs(b.deltaC!) - Math.abs(a.deltaC!))[0];
  const flagged = now.sites.filter((r) => r.tier === "alert" || r.tier === "warning").sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  const lastMin = samples.filter((s) => s.t > now.t - 60000).length;
  const bySite = new Map(now.sites.map((r) => [r.site, r]));
  const sensorCount = now.sites.reduce((n, r) => n + (r.leftC === null ? 0 : 1) + (r.rightC === null ? 0 : 1), 0);

  return (
    <div className="patient-view">
      {banner}

      <section className="tiles">
        <div className="tile">
          <div className="tile-label">Right now</div>
          <div className="tile-value"><StatusBadge kind={worst} /></div>
          <div className="tile-sub muted">{flagged.length ? `${flagged.length} spot${flagged.length > 1 ? "s" : ""} flagged` : "left and right feet match"}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Biggest left–right difference</div>
          <div className="tile-value">{top ? `${Math.abs(top.deltaC!).toFixed(1)} °C` : "—"}</div>
          <div className="tile-sub muted">{top ? `${SITE_LABELS[top.site]} · ${warmerFoot(top.deltaC) ?? "neither"} foot warmer` : "no valid readings"}</div>
        </div>
        <div className="tile">
          <div className="tile-label">Readings in the last minute</div>
          <div className="tile-value">{lastMin}</div>
          <div className="tile-sub muted">one every {LIVE_DEMO.interval_s} s · {sensorCount} sensor{sensorCount === 1 ? "" : "s"} reporting</div>
        </div>
        <div className="tile">
          <div className="tile-label">Last reading</div>
          <div className="tile-value">{new Date(now.t).toLocaleTimeString()}</div>
          <div className="tile-sub muted">{streaming ? "streaming" : "paused · start python -m pipeline.live"}</div>
        </div>
      </section>

      {flagged.length > 0 && (
        <section className={`callout callout-${flagged[0].tier}`} aria-live="polite">
          {flagged.map((r) => (
            <div key={r.site} className="callout-row">
              <StatusIcon kind={r.tier} size={16} />
              <div>
                <strong>{TIER_LABEL[r.tier]}</strong> · {SITE_LABELS[r.site]}: {warmerFoot(r.deltaC)} foot {Math.abs(r.deltaC!).toFixed(1)} °C warmer
                <span className="muted"> ({r.reason})</span>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="row">
        <div className="card card-map">
          <h3>Your soles · live</h3>
          <FootMap rows={now.sites} />
        </div>
        <div className="card card-chart">
          <h3>Left − right difference, second by second</h3>
          <p className="muted small">Last {LIVE_DEMO.history_s} s. Warning at |ΔT| ≥ {CLINICAL.warning_c} °C; alert at ≥ {CLINICAL.alert_c} °C held for {LIVE_DEMO.alert_consecutive_samples} readings, same side.</p>
          <LiveChart samples={samples} windowS={LIVE_DEMO.history_s} />
        </div>
      </section>

      <section className="card">
        <h3>Current readings</h3>
        <div className="grid-scroll">
          <table className="sensors">
            <thead>
              <tr>
                <th scope="col">Spot</th><th scope="col">Left</th><th scope="col">Right</th><th scope="col">ΔT (L − R)</th><th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {SITES.map((s) => {
                const r = bySite.get(s);
                return (
                  <tr key={s}>
                    <th scope="row">{SITE_LABELS[s]}</th>
                    <td>{fmtTemp(r?.leftC)}</td>
                    <td>{fmtTemp(r?.rightC)}</td>
                    <td className="num">{r?.deltaC === null || r?.deltaC === undefined ? "—" : `${fmtDelta(r.deltaC)} °C`}</td>
                    <td>{r ? <StatusBadge kind={r.tier} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

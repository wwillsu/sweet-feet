import { PointerEvent, useLayoutEffect, useRef, useState } from "react";
import { CLINICAL, fmtDelta, LiveSample, SITE_LABELS, SITE_VAR, SITES } from "../lib";
import { StatusIcon } from "./StatusIcon";

const H = 260;
const M = { top: 14, right: 104, bottom: 28, left: 44 };
const GAP_MS = 2500; // break the line if a reading is missing

function useWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(640);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Live ΔT = left − right per site over the last `windowS` seconds, one reading per second. */
export function LiveChart({ samples, windowS }: { samples: LiveSample[]; windowS: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const [hover, setHover] = useState<number | null>(null);
  const [emph, setEmph] = useState<string | null>(null);

  const tEnd = samples.length ? samples[samples.length - 1].t : Date.now();
  // Grow with the data until the window is full, so a fresh demo isn't squeezed into the right edge.
  const spanS = Math.min(windowS, Math.max(30, samples.length ? (tEnd - samples[0].t) / 1000 : 0));
  const tStart = tEnd - spanS * 1000;
  const get = (s: LiveSample, site: string) => s.sites.find((r) => r.site === site);

  const maxAbs = samples.reduce(
    (m, s) => s.sites.reduce((mm, r) => (r.deltaC === null ? mm : Math.max(mm, Math.abs(r.deltaC))), m), 0);
  const yMax = Math.max(3, Math.ceil(maxAbs + 0.3));
  const iw = width - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (t: number) => M.left + ((t - tStart) / (tEnd - tStart)) * iw;
  const y = (v: number) => M.top + ((yMax - v) / (2 * yMax)) * ih;

  const yTicks: number[] = [];
  for (let t = -yMax; t <= yMax; t += yMax > 5 ? 2 : 1) yTicks.push(t);
  const xTicks: number[] = [];
  const xStep = spanS > 120 ? 60 : spanS > 60 ? 30 : 10;
  for (let s = 0; s <= spanS; s += xStep) xTicks.push(s);

  const paths = SITES.map((site) => {
    let d = "";
    let prevT: number | null = null;
    for (const s of samples) {
      const v = get(s, site)?.deltaC;
      if (v === null || v === undefined) {
        prevT = null;
        continue;
      }
      const pen = prevT !== null && s.t - prevT < GAP_MS;
      d += `${pen ? "L" : "M"}${x(s.t).toFixed(1)},${y(v).toFixed(1)}`;
      prevT = s.t;
    }
    return { site, d };
  });

  const last = samples[samples.length - 1];
  const lead = last && last.sites
    .filter((r) => r.deltaC !== null && Math.abs(r.deltaC) >= CLINICAL.warning_c)
    .sort((a, b) => Math.abs(b.deltaC!) - Math.abs(a.deltaC!))[0];

  const onMove = (e: PointerEvent) => {
    if (!samples.length) return;
    const px = e.clientX - wrap.current!.getBoundingClientRect().left;
    const t = tStart + ((px - M.left) / iw) * (tEnd - tStart);
    let best = 0;
    samples.forEach((s, i) => { if (Math.abs(s.t - t) < Math.abs(samples[best].t - t)) best = i; });
    setHover(best);
  };
  const active = hover !== null && hover < samples.length ? samples[hover] : null;
  const tipLeft = active !== null && x(active.t) > width - 230;

  const band = (lo: number, hi: number, cls: string) => (
    <rect x={M.left} width={iw} y={y(hi)} height={Math.max(0, y(lo) - y(hi))} className={cls} />
  );

  return (
    <div className="chart">
      <div className="legend" role="group" aria-label="Sites (click to highlight)">
        {SITES.map((s) => (
          <button key={s} className={`legend-item ${emph && emph !== s ? "dim" : ""}`} aria-pressed={emph === s} onClick={() => setEmph(emph === s ? null : s)}>
            <span className="line-key" style={{ background: SITE_VAR[s] }} />
            {SITE_LABELS[s]}
          </button>
        ))}
      </div>
      <div
        ref={wrap}
        className="chart-plot"
        role="img"
        aria-label={`Live left minus right temperature difference per site, last ${windowS} seconds`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg width={width} height={H}>
          {band(CLINICAL.alert_c, yMax, "zone-alert")}
          {band(-yMax, -CLINICAL.alert_c, "zone-alert")}
          {band(CLINICAL.warning_c, CLINICAL.alert_c, "zone-warning")}
          {band(-CLINICAL.alert_c, -CLINICAL.warning_c, "zone-warning")}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} className={t === 0 ? "baseline" : "grid"} />
              <text x={M.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{fmtDelta(t, 0)}</text>
            </g>
          ))}
          {[CLINICAL.warning_c, CLINICAL.alert_c].map((t) =>
            [t, -t].map((v) => (
              <text key={v} x={M.left + iw - 4} y={y(v) + (v > 0 ? -4 : 11)} className="zone-label" textAnchor="end">
                {t === CLINICAL.alert_c ? "alert" : "warning"} {fmtDelta(v)}
              </text>
            )),
          )}
          <text x={M.left + 6} y={M.top + 12} className="axis-note">▲ left foot warmer</text>
          <text x={M.left + 6} y={M.top + ih - 6} className="axis-note">▼ right foot warmer</text>
          {xTicks.map((s) => (
            <text key={s} x={x(tEnd - s * 1000)} y={H - 8} className="tick" textAnchor="middle">
              {s === 0 ? "now" : `−${s}s`}
            </text>
          ))}

          {paths.map(({ site, d }) => (
            <path key={site} d={d} className="series-line" style={{ stroke: SITE_VAR[site], opacity: emph && emph !== site ? 0.18 : 1 }} />
          ))}

          {lead && (
            <>
              <text x={x(last.t) + 10} y={y(lead.deltaC!)} className="end-label" dominantBaseline="middle">
                <tspan className="end-value">{fmtDelta(lead.deltaC)} °C</tspan>
                <tspan x={x(last.t) + 10} dy="1.25em">{SITE_LABELS[lead.site].replace(" metatarsal head", " met. head")}</tspan>
              </text>
              <circle cx={x(last.t)} cy={y(lead.deltaC!)} r={4} className="dot" style={{ fill: SITE_VAR[lead.site] }} />
            </>
          )}

          {active && (
            <g>
              <line x1={x(active.t)} x2={x(active.t)} y1={M.top} y2={M.top + ih} className="crosshair" />
              {active.sites.map((r) =>
                r.deltaC === null ? null : (
                  <circle key={r.site} cx={x(active.t)} cy={y(r.deltaC)} r={4} className="dot" style={{ fill: SITE_VAR[r.site] }} />
                ),
              )}
            </g>
          )}
        </svg>

        {active && (
          <div className="tooltip" style={{ left: tipLeft ? undefined : x(active.t) + 14, right: tipLeft ? width - x(active.t) + 14 : undefined }}>
            <div className="tooltip-title">{new Date(active.t).toLocaleTimeString()}</div>
            {[...active.sites]
              .sort((a, b) => Math.abs(b.deltaC ?? -1) - Math.abs(a.deltaC ?? -1))
              .map((r) => (
                <div key={r.site} className="tooltip-row">
                  <span className="line-key" style={{ background: SITE_VAR[r.site] }} />
                  <strong>{r.deltaC === null ? "—" : `${fmtDelta(r.deltaC)} °C`}</strong>
                  <span className="muted">{SITE_LABELS[r.site]}</span>
                  {r.tier !== "normal" && <StatusIcon kind={r.tier} size={12} />}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

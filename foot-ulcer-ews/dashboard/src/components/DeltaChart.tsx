import { KeyboardEvent, PointerEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CLINICAL, DailyRow, fmtDate, fmtDelta, SITE_LABELS, SITE_VAR, SITES } from "../lib";
import { StatusIcon } from "./StatusIcon";

type Props = {
  rows: DailyRow[];
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
};

const H = 280;
const M = { top: 14, right: 104, bottom: 28, left: 44 };

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

/** ΔT = left − right per site per day, one line per site, on one symmetric axis. */
export function DeltaChart({ rows, dates, selectedDate, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const width = useWidth(wrap);
  const [hover, setHover] = useState<number | null>(null);
  const [emph, setEmph] = useState<string | null>(null);

  const cell = useMemo(() => {
    const m = new Map<string, DailyRow>();
    for (const r of rows) m.set(`${r.site}|${r.date}`, r);
    return m;
  }, [rows]);
  const get = (site: string, date: string) => cell.get(`${site}|${date}`);

  const maxAbs = rows.reduce((m, r) => (r.deltaC === null ? m : Math.max(m, Math.abs(r.deltaC))), 0);
  const yMax = Math.max(3, Math.ceil(maxAbs + 0.3));
  const iw = width - M.left - M.right;
  const ih = H - M.top - M.bottom;
  // Every date gets a label; when the day slots are too narrow for flat labels, tilt them
  // 45° and grow the SVG downward so the plot area keeps its height.
  const step = iw / Math.max(1, dates.length);
  const tilt = step < 48;
  const svgH = H + (tilt ? 22 : 0);
  // Every day gets an equal slot with its point in the middle, so the first and last day
  // are as wide as the rest (no half-width columns at the edges).
  const x = (i: number) => M.left + (i + 0.5) * step;
  const y = (v: number) => M.top + ((yMax - v) / (2 * yMax)) * ih;

  const tickStep = yMax > 5 ? 2 : 1;
  const yTicks: number[] = [];
  for (let t = -yMax; t <= yMax; t += tickStep) yTicks.push(t);

  const paths = SITES.map((site) => {
    let d = "";
    let pen = false;
    dates.forEach((date, i) => {
      const v = get(site, date)?.deltaC;
      if (v === null || v === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return { site, d };
  });

  // Direct-label only the site the story is about: largest |ΔT| on the latest day, if flagged.
  const last = dates.length - 1;
  const lead = SITES.map((s) => ({ s, v: get(s, dates[last])?.deltaC ?? null }))
    .filter((p) => p.v !== null && Math.abs(p.v) >= CLINICAL.warning_c)
    .sort((a, b) => Math.abs(b.v!) - Math.abs(a.v!))[0];

  const selIdx = dates.indexOf(selectedDate);
  const active = hover ?? null;

  const idxAt = (clientX: number) => {
    const box = wrap.current!.getBoundingClientRect();
    const px = clientX - box.left - M.left;
    return Math.min(dates.length - 1, Math.max(0, Math.floor(px / step)));
  };
  const onMove = (e: PointerEvent) => setHover(idxAt(e.clientX));
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = Math.min(dates.length - 1, Math.max(0, selIdx + d));
    onSelect(dates[i]);
    setHover(i);
  };

  const band = (lo: number, hi: number, cls: string) => (
    <rect x={M.left} width={iw} y={y(hi)} height={Math.max(0, y(lo) - y(hi))} className={cls} />
  );

  const tipRows = active === null ? [] : SITES
    .map((s) => ({ s, r: get(s, dates[active]) }))
    .sort((a, b) => Math.abs(b.r?.deltaC ?? -1) - Math.abs(a.r?.deltaC ?? -1));
  const tipLeft = active !== null && x(active) > width - 230;

  return (
    <div className="chart">
      <div className="legend" role="group" aria-label="Sites (click to highlight)">
        {SITES.map((s) => (
          <button
            key={s}
            className={`legend-item ${emph && emph !== s ? "dim" : ""}`}
            aria-pressed={emph === s}
            onClick={() => setEmph(emph === s ? null : s)}
          >
            <span className="line-key" style={{ background: SITE_VAR[s] }} />
            {SITE_LABELS[s]}
          </button>
        ))}
      </div>
      <div
        ref={wrap}
        className="chart-plot"
        tabIndex={0}
        role="img"
        aria-label={`Left minus right temperature difference per site, ${dates.length} days. Use arrow keys to change the selected day.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(selIdx)}
        onBlur={() => setHover(null)}
        onClick={(e) => onSelect(dates[idxAt(e.clientX)])}
        onKeyDown={onKey}
      >
        <svg width={width} height={svgH}>
          {band(CLINICAL.alert_c, yMax, "zone-alert")}
          {band(-yMax, -CLINICAL.alert_c, "zone-alert")}
          {band(CLINICAL.warning_c, CLINICAL.alert_c, "zone-warning")}
          {band(-CLINICAL.alert_c, -CLINICAL.warning_c, "zone-warning")}

          {yTicks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + iw} y1={y(t)} y2={y(t)} className={t === 0 ? "baseline" : "grid"} />
              <text x={M.left - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">
                {fmtDelta(t, 0)}
              </text>
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

          {dates.map((d, i) =>
            tilt ? (
              <text key={d} x={x(i)} y={M.top + ih + 14} className="tick" textAnchor="end"
                transform={`rotate(-45 ${x(i)} ${M.top + ih + 14})`}>
                {fmtDate(d)}
              </text>
            ) : (
              <text key={d} x={x(i)} y={H - 8} className="tick" textAnchor="middle">
                {fmtDate(d)}
              </text>
            ),
          )}

          {selIdx >= 0 && <rect x={M.left + selIdx * step} width={step} y={M.top} height={ih} className="selected-col" />}

          {paths.map(({ site, d }) => (
            <path
              key={site}
              d={d}
              className="series-line"
              style={{ stroke: SITE_VAR[site], opacity: emph && emph !== site ? 0.18 : 1 }}
            />
          ))}

          {lead && (
            <text x={x(last) + 10} y={y(lead.v!)} className="end-label" dominantBaseline="middle">
              <tspan className="end-value">{fmtDelta(lead.v)} °C</tspan>
              <tspan x={x(last) + 10} dy="1.25em">{SITE_LABELS[lead.s].replace(" metatarsal head", " met. head")}</tspan>
            </text>
          )}
          {lead && <circle cx={x(last)} cy={y(lead.v!)} r={4} className="dot" style={{ fill: SITE_VAR[lead.s] }} />}

          {active !== null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + ih} className="crosshair" />
              {SITES.map((s) => {
                const v = get(s, dates[active])?.deltaC;
                return v === null || v === undefined ? null : (
                  <circle key={s} cx={x(active)} cy={y(v)} r={4} className="dot" style={{ fill: SITE_VAR[s] }} />
                );
              })}
            </g>
          )}
        </svg>

        {active !== null && (
          <div
            className="tooltip"
            style={{ left: tipLeft ? undefined : x(active) + 14, right: tipLeft ? width - x(active) + 14 : undefined }}
          >
            <div className="tooltip-title">{fmtDate(dates[active], { weekday: "short", month: "short", day: "numeric" })}</div>
            {tipRows.map(({ s, r }) => (
              <div key={s} className="tooltip-row">
                <span className="line-key" style={{ background: SITE_VAR[s] }} />
                <strong>{r?.deltaC === null || r?.deltaC === undefined ? "—" : `${fmtDelta(r.deltaC)} °C`}</strong>
                <span className="muted">{SITE_LABELS[s]}</span>
                {r && r.tier !== "normal" && <StatusIcon kind={r.tier} size={12} />}
              </div>
            ))}
            <div className="tooltip-hint">Click to inspect this day</div>
          </div>
        )}
      </div>
    </div>
  );
}

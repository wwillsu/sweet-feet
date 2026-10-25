import { useState } from "react";
import { fmtDelta, fmtTemp, fmtTime, SITE_LABELS, SiteReading, SITES, TIER_LABEL, warmerFoot } from "../lib";
import { StatusIcon } from "./StatusIcon";

/** Sensor positions on a LEFT sole (medial side on the right); the right foot is mirrored. */
const POS: Record<string, [number, number]> = {
  hallux: [88, 42],
  met1: [86, 104],
  met3: [60, 98],
  met5: [34, 110],
  heel: [60, 238],
};
const W = 120;

const OUTLINE =
  "M60,274 C34,274 22,250 24,218 C26,186 32,162 24,134 C18,110 20,84 32,74 " +
  "C48,64 72,62 98,64 C112,68 110,96 104,124 C98,152 86,168 90,202 C94,238 90,274 60,274 Z";
const TOES: [number, number, number, number][] = [
  [90, 36, 13, 17],
  [68, 34, 8, 10],
  [52, 40, 7, 9],
  [39, 49, 6.5, 8],
  [28, 61, 6, 7],
];

export function FootMap({ rows }: { rows: SiteReading[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const bySite = new Map(rows.map((r) => [r.site, r]));
  const info = hover ? bySite.get(hover) : null;

  const foot = (side: "left" | "right") => {
    const mx = (px: number) => (side === "left" ? px : W - px);
    return (
      <g transform={`translate(${side === "left" ? 0 : W + 36}, 0)`}>
        <g transform={side === "right" ? `translate(${W},0) scale(-1,1)` : undefined}>
          <path d={OUTLINE} className="foot" />
          {TOES.map(([cx, cy, rx, ry], i) => (
            <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} className="foot" />
          ))}
        </g>
        <text x={W / 2} y={298} textAnchor="middle" className="foot-label">
          {side === "left" ? "Left" : "Right"}
        </text>
        {SITES.map((s) => {
          const r = bySite.get(s);
          const [px, py] = POS[s];
          const flagged = r && (r.tier === "warning" || r.tier === "alert");
          const isWarm = flagged && warmerFoot(r.deltaC) === side;
          const temp = side === "left" ? r?.leftC : r?.rightC;
          const cls = !r || temp === null || temp === undefined ? "site site-nodata" : isWarm ? `site site-${r.tier}` : "site";
          return (
            <g
              key={s}
              className="site-hit"
              tabIndex={0}
              role="button"
              aria-label={`${side} ${SITE_LABELS[s]}: ${fmtTemp(temp)}${isWarm ? `, warmer side, ${TIER_LABEL[r!.tier]}` : ""}`}
              onPointerEnter={() => setHover(s)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(s)}
              onBlur={() => setHover(null)}
            >
              <circle cx={mx(px)} cy={py} r={16} fill="transparent" />
              {r?.tier === "alert" && isWarm && <circle cx={mx(px)} cy={py} r={15} className="site-pulse" />}
              <circle cx={mx(px)} cy={py} r={10} className={`${cls} ${hover === s ? "site-hover" : ""}`} />
              {isWarm && (
                <g transform={`translate(${mx(px) - 6}, ${py - 6})`}>
                  <StatusIcon kind={r!.tier} size={12} />
                </g>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="footmap">
      <svg viewBox={`-6 0 ${2 * W + 48} 310`} className="footmap-svg" aria-label="Plantar sensor map">
        {foot("left")}
        {foot("right")}
      </svg>
      <div className="footmap-info" aria-live="polite">
        {info ? (
          <>
            <div className="footmap-info-title">
              <StatusIcon kind={info.tier} /> {SITE_LABELS[info.site]}
            </div>
            <div>
              L {fmtTemp(info.leftC)} · R {fmtTemp(info.rightC)} · <strong>ΔT {fmtDelta(info.deltaC)} °C</strong>
            </div>
            <div className="muted">
              {info.restStart === undefined
                ? "Live reading (rest rule off)"
                : `Rest window ${fmtTime(info.restStart)}–${fmtTime(info.restEnd ?? null)}`} · {info.reason}
            </div>
          </>
        ) : (
          <span className="muted">
            Hover a sensor for readings. A filled marker shows the warmer foot at a flagged site.
          </span>
        )}
      </div>
    </div>
  );
}

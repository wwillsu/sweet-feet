import { fmtDate, SensorRow, SITE_LABELS, SITES } from "../lib";
import { StatusBadge } from "./StatusIcon";

export function SensorPanel({ sensors }: { sensors: SensorRow[] }) {
  const by = new Map(sensors.map((s) => [`${s.foot}|${s.site}`, s]));
  const asOf = sensors[0]?.asOf;
  return (
    <div className="grid-scroll">
      <table className="sensors">
        <thead>
          <tr>
            <th scope="col">Foot</th>
            {SITES.map((s) => (
              <th key={s} scope="col">{SITE_LABELS[s]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["L", "R"] as const).map((foot) => (
            <tr key={foot}>
              <th scope="row">{foot === "L" ? "Left" : "Right"}</th>
              {SITES.map((site) => {
                const s = by.get(`${foot}|${site}`);
                if (!s) return <td key={site} className="muted">—</td>;
                const detail = [
                  s.nRange && `${s.nRange} out-of-range`,
                  s.nJump && `${s.nJump} spike`,
                  s.nStuck && `${s.nStuck} stuck`,
                ].filter(Boolean).join(", ");
                return (
                  <td key={site} title={s.lastFault ? `Last fault ${s.lastFault}` : undefined}>
                    <StatusBadge kind={s.status} />
                    <div className="muted small">
                      {s.status === "ok"
                        ? "no faults"
                        : `${s.faultFraction < 0.001 ? "<0.1" : (s.faultFraction * 100).toFixed(1)}% samples masked`}
                    </div>
                    {detail && <div className="muted small">{detail}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {asOf && <p className="muted small">Faulty samples are excluded before ΔT is computed. Status covers data through {fmtDate(asOf)}.</p>}
    </div>
  );
}

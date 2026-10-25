import { DailyRow, fmtDate, fmtDelta, SITE_LABELS, SITE_VAR, SITES, TIER_LABEL } from "../lib";
import { StatusIcon } from "./StatusIcon";

/** Site × day table: every value the chart shows, readable without hovering. */
export function DayGrid({ rows, dates, selectedDate, onSelect }: {
  rows: DailyRow[];
  dates: string[];
  selectedDate: string;
  onSelect: (d: string) => void;
}) {
  const cell = new Map(rows.map((r) => [`${r.site}|${r.date}`, r]));
  return (
    <div className="grid-scroll">
      <table className="daygrid">
        <thead>
          <tr>
            <th scope="col" className="sticky">Site · ΔT °C (L − R)</th>
            {dates.map((d) => (
              <th key={d} scope="col" className={d === selectedDate ? "sel" : ""}>
                <button onClick={() => onSelect(d)} aria-pressed={d === selectedDate}>{fmtDate(d)}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SITES.map((s) => (
            <tr key={s}>
              <th scope="row" className="sticky">
                <span className="line-key" style={{ background: SITE_VAR[s] }} />
                {SITE_LABELS[s]}
              </th>
              {dates.map((d) => {
                const r = cell.get(`${s}|${d}`);
                const tier = r?.tier ?? "no_data";
                return (
                  <td
                    key={d}
                    className={`cell cell-${tier} ${d === selectedDate ? "sel" : ""}`}
                    title={r ? `${TIER_LABEL[tier]} — ${r.reason}` : "No data"}
                    onClick={() => onSelect(d)}
                  >
                    {tier !== "normal" && <StatusIcon kind={tier} size={11} />}
                    <span>{fmtDelta(r?.deltaC)}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

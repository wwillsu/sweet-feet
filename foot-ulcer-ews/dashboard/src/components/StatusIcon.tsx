import { SENSOR_LABEL, SensorState, Tier, TIER_LABEL } from "../lib";

/** Status is never color alone: each state has its own shape, and badges add a text label. */
type Kind = Tier | SensorState;

const COLOR: Record<Kind, string> = {
  normal: "var(--status-good)",
  ok: "var(--status-good)",
  warning: "var(--status-warning)",
  degraded: "var(--status-warning)",
  alert: "var(--status-critical)",
  fault: "var(--status-critical)",
  no_data: "var(--text-muted)",
};

export function StatusIcon({ kind, size = 14 }: { kind: Kind; size?: number }) {
  const c = COLOR[kind];
  const ink = kind === "warning" || kind === "degraded" ? "#0b0b0b" : "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="status-icon">
      {(kind === "normal" || kind === "ok") && (
        <>
          <circle cx="8" cy="8" r="7.5" fill={c} />
          <path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {(kind === "warning" || kind === "degraded") && (
        <>
          <path d="M8 1l7.3 13.2H.7z" fill={c} strokeLinejoin="round" />
          <path d="M8 5.6v4.2" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="12" r="1" fill={ink} />
        </>
      )}
      {(kind === "alert" || kind === "fault") && (
        <>
          <path d="M5 .5h6L15.5 5v6L11 15.5H5L.5 11V5z" fill={c} />
          <path d="M8 4.2v4.8" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r="1.05" fill={ink} />
        </>
      )}
      {kind === "no_data" && (
        <>
          <circle cx="8" cy="8" r="6.6" fill="none" stroke={c} strokeWidth="1.6" />
          <path d="M5 8h6" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function StatusBadge({ kind }: { kind: Kind }) {
  const label = kind in TIER_LABEL ? TIER_LABEL[kind as Tier] : SENSOR_LABEL[kind as SensorState];
  return (
    <span className={`badge badge-${kind}`}>
      <StatusIcon kind={kind} />
      {label}
    </span>
  );
}

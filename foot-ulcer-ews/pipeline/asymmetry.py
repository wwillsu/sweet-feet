"""Pure asymmetry / tiering functions (no I/O, no pandas) - the clinical rule lives here.

Rule (thresholds from config.json):
  dT = Left - Right, per site per day (rest-window value)
  normal   |dT| <  warning_c (1.5)
  warning  |dT| >= warning_c, including a single day >= alert_c (2.2)
  alert    |dT| >= alert_c on alert_consecutive_days (2) consecutive calendar days,
           same site, same sign
This is a screening aid, not a diagnosis. Messages must stay non-diagnostic.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Optional, Sequence

from pipeline.config import CONFIG

NORMAL, WARNING, ALERT, NO_DATA = "normal", "warning", "alert", "no_data"


def delta_t(left: Optional[float], right: Optional[float]) -> Optional[float]:
    if left is None or right is None or _isnan(left) or _isnan(right):
        return None
    return left - right


def tier_single_day(dt: Optional[float], cfg: dict = CONFIG) -> str:
    """Tier from one day's value alone (never 'alert' - that needs history)."""
    if dt is None or _isnan(dt):
        return NO_DATA
    return WARNING if abs(dt) >= cfg["clinical"]["warning_c"] else NORMAL


def classify_site_series(days: Sequence[tuple[date, Optional[float]]], cfg: dict = CONFIG) -> list[dict]:
    """days: (date, dT) for ONE site, any order. Returns per-day dicts with tier + reason.
    A missing day (no data) breaks the consecutive chain."""
    c = cfg["clinical"]
    alert_c, n_req = c["alert_c"], c["alert_consecutive_days"]
    by_date = {d: (None if v is None or _isnan(v) else float(v)) for d, v in days}
    out = []
    for d in sorted(by_date):
        dt = by_date[d]
        tier = tier_single_day(dt, cfg)
        reason = _reason(dt, tier, cfg)
        if tier == WARNING and abs(dt) >= alert_c and _chain_met(by_date, d, n_req, cfg):
            tier = ALERT
            reason = f"|dT| >= {alert_c} C on {n_req} consecutive days, same sign"
        out.append({"date": d, "delta_c": dt, "tier": tier, "reason": reason})
    return out


def tier_live(history: Sequence[Optional[float]], cfg: dict = CONFIG) -> tuple[str, str]:
    """Live demo mode: tier the LAST reading of one site's per-second dT stream.
    No rest-window rule. Same thresholds, but 'consecutive days' becomes
    live_demo.alert_consecutive_samples consecutive readings. Returns (tier, reason)."""
    c, n_req = cfg["clinical"], cfg["live_demo"]["alert_consecutive_samples"]
    dt = history[-1] if history else None
    if dt is not None and _isnan(dt):
        dt = None
    tier = tier_single_day(dt, cfg)
    if tier == NO_DATA:
        return tier, "sensor reading missing or out of range"
    if tier == NORMAL:
        return tier, _reason(dt, tier, cfg)
    tail = list(history[-n_req:])
    sign = math.copysign(1, dt)
    sustained = len(tail) == n_req and all(
        v is not None and not _isnan(v) and abs(v) >= c["alert_c"]
        and (not c["require_same_sign"] or math.copysign(1, v) == sign) for v in tail)
    if sustained:
        return ALERT, f"|dT| >= {c['alert_c']} C on {n_req} consecutive readings, same sign"
    return tier, _reason(dt, tier, cfg)


def _chain_met(by_date: dict, d: date, n_req: int, cfg: dict) -> bool:
    c = cfg["clinical"]
    sign = math.copysign(1, by_date[d])
    for k in range(1, n_req):
        prev = d - timedelta(days=k)
        v = by_date.get(prev)
        if v is None or abs(v) < c["alert_c"]:
            return False
        if c["require_same_sign"] and math.copysign(1, v) != sign:
            return False
    return True


def _reason(dt, tier, cfg) -> str:
    c = cfg["clinical"]
    if tier == NO_DATA:
        return "insufficient valid rest-window data"
    if tier == NORMAL:
        return f"|dT| < {c['warning_c']} C"
    if abs(dt) >= c["alert_c"]:
        return f"|dT| >= {c['alert_c']} C (single day)"
    return f"|dT| >= {c['warning_c']} C"


def warmer_foot(dt: Optional[float]) -> Optional[str]:
    if dt is None or dt == 0:
        return None
    return "left" if dt > 0 else "right"


def screening_message(site_label: str, dt: Optional[float], tier: str) -> str:
    """Patient/clinician-facing text. Deliberately non-diagnostic."""
    if tier == NO_DATA:
        return f"{site_label}: not enough reliable resting data today."
    side = warmer_foot(dt)
    mag = f"{abs(dt):.1f} °C" if dt is not None else ""
    if tier == NORMAL:
        return f"{site_label}: left/right temperatures similar ({mag} difference)."
    if tier == WARNING:
        return (f"{site_label}: {side} foot {mag} warmer than the other. "
                f"Worth keeping an eye on; re-check tomorrow.")
    return (f"{site_label}: {side} foot {mag} warmer for consecutive days. "
            f"This pattern is worth a foot check by a clinician soon. "
            f"(Screening aid only — not a diagnosis.)")


def _isnan(v) -> bool:
    return isinstance(v, float) and math.isnan(v)

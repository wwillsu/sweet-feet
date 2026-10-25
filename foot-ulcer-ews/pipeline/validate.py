"""Scores pipeline output against the injected-scenario ground truth."""
from __future__ import annotations

import pandas as pd

from pipeline.asymmetry import ALERT, NO_DATA, NORMAL, WARNING
from pipeline.config import CONFIG
from pipeline.generate import SCENARIOS, generate_all
from pipeline.run import run_all


def _date(day0: pd.Timestamp, k: int) -> str:
    return str((day0 + pd.Timedelta(days=k)).date())


def validate(daily: pd.DataFrame, status: pd.DataFrame, cfg: dict = CONFIG) -> dict:
    day0 = pd.Timestamp(cfg["synthetic"]["start_date"])
    results, total_false = [], 0
    for pid, spec in SCENARIOS.items():
        exp = spec["expect"]
        d = daily[daily.patient_id == pid]
        st = status[status.patient_id == pid]
        checks, notes = [], []
        alerts = d[d.tier == ALERT]

        # expected alerts: first alert on the expected day, same sign; later days at that site allowed
        allowed = set()
        for a in exp["alerts"]:
            sa = alerts[alerts.site == a["site"]].sort_values("date")
            first = sa.date.iloc[0] if len(sa) else None
            ok = first == _date(day0, a["first_day"]) and all((sa.delta_c > 0) == (a["sign"] > 0))
            checks.append(ok)
            notes.append(f"{a['site']} alert first on {first} (expected {_date(day0, a['first_day'])})")
            allowed |= {(a["site"], x) for x in sa.date if x >= _date(day0, a["first_day"])}

        false = [(r.site, r.date) for r in alerts.itertuples() if (r.site, r.date) not in allowed]
        total_false += len(false)
        checks.append(not false)
        if false:
            notes.append(f"FALSE ALERTS: {false}")

        for site, days in exp.get("warning_days", {}).items():
            got = [d[(d.site == site) & (d.date == _date(day0, k))].tier.iloc[0] for k in days]
            checks.append(all(t == WARNING for t in got))
            notes.append(f"{site} warnings on days {days}: {got}")

        if exp.get("no_warnings"):
            n_flag = int(d.tier.isin([WARNING, ALERT]).sum())
            checks.append(n_flag == 0)
            notes.append(f"{n_flag} warning/alert days (max |dT| {d.delta_c.abs().max():.2f} C)")

        for foot, site in exp.get("flagged_sensors", []):
            s = st[(st.foot == foot) & (st.site == site)].status.iloc[0]
            checks.append(s != "ok")
            notes.append(f"sensor {foot}-{site}: {s}")

        for site, days in exp.get("insufficient", {}).items():
            got = [d[(d.site == site) & (d.date == _date(day0, k))].tier.iloc[0] for k in days]
            checks.append(all(t == NO_DATA for t in got))
            notes.append(f"{site} days {days} -> {got}")

        unexpected_warn = d[d.tier == WARNING]
        expected_warn = {(s, _date(day0, k)) for s, ks in exp.get("warning_days", {}).items() for k in ks}
        stray = [(r.site, r.date) for r in unexpected_warn.itertuples() if (r.site, r.date) not in expected_warn]
        checks.append(not stray)
        if stray:
            notes.append(f"unexpected warnings: {stray}")

        results.append({"patient_id": pid, "description": spec["description"],
                        "passed": all(checks), "notes": notes, "false_alerts": len(false),
                        "is_control": not exp["alerts"] and pid.startswith("P")})

    scen = [r for r in results if not r["is_control"]]
    return {"results": results, "scenarios_passed": sum(r["passed"] for r in scen),
            "scenarios_total": len(scen), "controls_passed": all(r["passed"] for r in results if r["is_control"]),
            "false_alerts": total_false}


def format_summary(v: dict) -> str:
    lines = ["", "=" * 78, "VALIDATION SUMMARY (synthetic data, seed "
             f"{CONFIG['synthetic']['seed']})", "=" * 78]
    for r in v["results"]:
        lines.append(f"[{'PASS' if r['passed'] else 'FAIL'}] {r['patient_id']:<16} {r['description']}")
        for n in r["notes"]:
            lines.append(f"         - {n}")
    lines += ["-" * 78,
              f"Scenarios: {v['scenarios_passed']}/{v['scenarios_total']} passed   "
              f"Control: {'PASS' if v['controls_passed'] else 'FAIL'}   False alerts: {v['false_alerts']}",
              "=" * 78]
    return "\n".join(lines)


def run_validation(cfg: dict = CONFIG, seed: int | None = None) -> dict:
    daily, _, status = run_all(generate_all(cfg, seed=seed), cfg)
    return validate(daily, status, cfg)


if __name__ == "__main__":
    print(format_summary(run_validation()))

from datetime import date, timedelta

import pytest

from pipeline.asymmetry import (ALERT, NO_DATA, NORMAL, WARNING, classify_site_series, delta_t,
                                screening_message, tier_single_day)

D0 = date(2026, 10, 1)


def tiers(values):
    """values: list of dT (None = missing) on consecutive days starting D0."""
    series = [(D0 + timedelta(days=i), v) for i, v in enumerate(values)]
    return [r["tier"] for r in classify_site_series(series)]


def test_delta_is_left_minus_right():
    assert delta_t(31.0, 29.0) == pytest.approx(2.0)
    assert delta_t(29.0, 31.0) == pytest.approx(-2.0)
    assert delta_t(None, 30.0) is None
    assert delta_t(float("nan"), 30.0) is None


@pytest.mark.parametrize("dt,expected", [
    (0.0, NORMAL), (1.49, NORMAL), (-1.49, NORMAL),
    (1.5, WARNING), (-1.5, WARNING), (2.19, WARNING), (2.2, WARNING), (5.0, WARNING),
    (None, NO_DATA), (float("nan"), NO_DATA),
])
def test_single_day_tier_boundaries(dt, expected):
    assert tier_single_day(dt) == expected


def test_single_day_above_alert_threshold_is_only_warning():
    assert tiers([0.2, 2.6, 0.3]) == [NORMAL, WARNING, NORMAL]


def test_two_consecutive_same_sign_is_alert_on_second_day():
    assert tiers([2.2, 2.2]) == [WARNING, ALERT]
    assert tiers([-2.5, -2.3]) == [WARNING, ALERT]


def test_alert_continues_while_condition_holds():
    assert tiers([2.3, 2.4, 2.5, 1.0]) == [WARNING, ALERT, ALERT, NORMAL]


def test_opposite_sign_never_alerts():
    assert tiers([2.5, -2.5, 2.5, -2.5]) == [WARNING] * 4


def test_warning_level_days_do_not_count_toward_alert():
    assert tiers([2.1, 2.5]) == [WARNING, WARNING]
    assert tiers([1.9, 1.9, 1.9]) == [WARNING] * 3


def test_missing_day_breaks_chain():
    assert tiers([2.5, None, 2.5]) == [WARNING, NO_DATA, WARNING]


def test_calendar_gap_breaks_chain():
    series = [(D0, 2.5), (D0 + timedelta(days=2), 2.5)]
    assert [r["tier"] for r in classify_site_series(series)] == [WARNING, WARNING]


def test_input_order_does_not_matter():
    series = [(D0 + timedelta(days=1), 2.5), (D0, 2.5)]
    out = classify_site_series(series)
    assert [r["date"] for r in out] == [D0, D0 + timedelta(days=1)]
    assert [r["tier"] for r in out] == [WARNING, ALERT]


@pytest.mark.parametrize("tier,dt", [(NORMAL, 0.3), (WARNING, 1.8), (ALERT, -2.6), (NO_DATA, None)])
def test_messages_are_non_diagnostic(tier, dt):
    msg = screening_message("Heel", dt, tier).lower()
    for banned in ("ulcer", "infection", "charcot", "you have", "diagnosed"):
        assert banned not in msg
    if tier == ALERT:
        assert "not a diagnosis" in msg
        assert "right foot" in msg

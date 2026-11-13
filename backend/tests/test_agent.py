"""Agent pieces that don't need the model: the number checker and tool plumbing."""

from ground_truth.agent import TOOLS, TurnState, _run_tool, unverified_numbers


def test_numbers_from_tools_pass():
    known = {0.655, 0.21, 1762345.0, 0.0056, 22.0, 24.0}
    text = "Arctic +0.655 °C per decade vs +0.210 globally, about 3.1 times faster, over 1.76 million km²; 0.56% changed."
    assert unverified_numbers(text, known) == []


def test_invented_numbers_are_flagged():
    assert unverified_numbers("It warmed 0.41 °C per decade", {0.655, 0.21}) == ["0.41"]
    assert unverified_numbers("Loss of 37.5 mm per decade", {760.0, 267.0}) == ["37.5"]


def test_years_and_small_counts_are_ignored():
    assert unverified_numbers("From 1980 to 2025, 3 regions", set()) == []


def test_tool_schemas_are_strict():
    for t in TOOLS:
        assert t["strict"] is True
        params = t["parameters"]
        assert params["additionalProperties"] is False
        assert set(params["required"]) == set(params["properties"])


def test_trend_tool_returns_compact_result_and_ui_command():
    st = TurnState()
    r = _run_tool("trend_at_point", {"lat": 6.5, "lon": 3.4, "variable": "temperature"}, st)
    assert r["significant"] is True and "values" not in r and "first_value" in r
    assert st.ui and st.ui[0]["action"] == "point"


def test_tool_errors_are_reported_not_raised():
    st = TurnState()
    r = _run_tool("trend_at_point", {"lat": 95, "lon": 0, "variable": "temperature"}, st)
    assert "error" in r
    r = _run_tool("detect_change", {"lat": 6.5, "lon": 3.4, "year_a": 2024, "year_b": 2018}, st)
    assert "error" in r and "earlier" in r["error"]

"""Tests for get_fee_distribution."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.metrics import get_fee_distribution


def _make_db(rows: list[dict]):
    """Return a mock async context-manager db whose execute_fetchall returns rows."""
    db = MagicMock()
    db.execute_fetchall = AsyncMock(return_value=rows)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=db)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


@pytest.mark.asyncio
async def test_empty_when_no_rows():
    with patch("backend.metrics.get_db", return_value=_make_db([])):
        result = await get_fee_distribution("proj1")
    assert result == []


@pytest.mark.asyncio
async def test_single_fee_in_correct_band():
    rows = [{"fee": "£150"}]
    with patch("backend.metrics.get_db", return_value=_make_db(rows)):
        result = await get_fee_distribution("proj1")
    bands = {r["band"]: r["count"] for r in result}
    assert bands.get("£101–150") == 1


@pytest.mark.asyncio
async def test_fee_with_expenses_suffix_parsed():
    rows = [{"fee": "£200 + expenses"}]
    with patch("backend.metrics.get_db", return_value=_make_db(rows)):
        result = await get_fee_distribution("proj1")
    bands = {r["band"]: r["count"] for r in result}
    assert bands.get("£151–200") == 1


@pytest.mark.asyncio
async def test_unparseable_fee_skipped():
    rows = [{"fee": "TBC"}, {"fee": "£100"}]
    with patch("backend.metrics.get_db", return_value=_make_db(rows)):
        result = await get_fee_distribution("proj1")
    total = sum(r["count"] for r in result)
    assert total == 1


@pytest.mark.asyncio
async def test_null_fee_skipped():
    rows = [{"fee": None}, {"fee": "£75"}]
    with patch("backend.metrics.get_db", return_value=_make_db(rows)):
        result = await get_fee_distribution("proj1")
    total = sum(r["count"] for r in result)
    assert total == 1


@pytest.mark.asyncio
async def test_bands_ordered_low_to_high():
    rows = [{"fee": "£350"}, {"fee": "£50"}, {"fee": "£150"}]
    with patch("backend.metrics.get_db", return_value=_make_db(rows)):
        result = await get_fee_distribution("proj1")
    assert len(result) >= 3
    low_idx = next(i for i, r in enumerate(result) if r["band"].startswith("£0"))
    high_idx = next(i for i, r in enumerate(result) if "301" in r["band"])
    assert low_idx < high_idx


@pytest.mark.asyncio
async def test_over_301_goes_to_top_band():
    rows = [{"fee": "£500"}]
    with patch("backend.metrics.get_db", return_value=_make_db(rows)):
        result = await get_fee_distribution("proj1")
    bands = {r["band"]: r["count"] for r in result}
    assert bands.get("£301+") == 1

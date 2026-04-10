from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.models.system_parameters import SystemParameter

CASH_DENOMINATIONS_PARAM_KEY = "cash_denominations"
DEFAULT_CASH_DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1]


def _normalize_denomination_value(value) -> int | float:
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError("Invalid denomination value")

    if amount <= 0:
        raise ValueError("Denomination must be greater than zero")

    amount = amount.quantize(Decimal("0.01"))
    if amount == amount.to_integral():
        return int(amount)
    return float(amount)


def normalize_cash_denominations(values) -> list[int | float]:
    if values in (None, "", []):
        return list(DEFAULT_CASH_DENOMINATIONS)

    if isinstance(values, str):
        raw = values.strip()
        if not raw:
            return list(DEFAULT_CASH_DENOMINATIONS)
        try:
            values = json.loads(raw)
        except Exception:
            values = [part.strip() for part in raw.split(",") if str(part).strip()]

    if not isinstance(values, (list, tuple, set)):
        raise ValueError("Cash denominations must be a list")

    normalized: list[int | float] = []
    seen: set[str] = set()
    for value in values:
        item = _normalize_denomination_value(value)
        marker = str(item)
        if marker in seen:
            continue
        seen.add(marker)
        normalized.append(item)

    if not normalized:
        return list(DEFAULT_CASH_DENOMINATIONS)
    if len(normalized) > 25:
        raise ValueError("Too many denominations configured")

    normalized.sort(key=lambda item: float(item), reverse=True)
    return normalized


def serialize_cash_denominations(values) -> str:
    return json.dumps(normalize_cash_denominations(values))


def parse_cash_denominations(value) -> list[int | float]:
    return normalize_cash_denominations(value)


def get_shop_cash_denominations(db: Session, shop_id: int) -> list[int | float]:
    row = (
        db.query(SystemParameter)
        .filter(
            SystemParameter.shop_id == shop_id,
            SystemParameter.param_key == CASH_DENOMINATIONS_PARAM_KEY,
        )
        .first()
    )
    return parse_cash_denominations(row.param_value if row else None)

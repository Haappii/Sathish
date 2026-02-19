from __future__ import annotations

import os
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.db import Base, engine


def _env_truthy(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return bool(default)
    return str(raw).strip().lower() in {"1", "true", "yes", "y", "on"}


def _import_all_models() -> None:
    # Ensure Base.metadata contains every table defined in app/models.
    import importlib
    import pkgutil
    import app.models  # noqa: F401

    for m in pkgutil.iter_modules(app.models.__path__):
        if m.ispkg:
            continue
        importlib.import_module(f"app.models.{m.name}")


def _pg_quote_ident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _pg_table_ref(table) -> str:
    if getattr(table, "schema", None):
        return f"{_pg_quote_ident(table.schema)}.{_pg_quote_ident(table.name)}"
    return _pg_quote_ident(table.name)


def _truncate_postgres(conn: Connection, tables: Iterable) -> None:
    refs = [_pg_table_ref(t) for t in tables]
    if not refs:
        return
    sql = f"TRUNCATE TABLE {', '.join(refs)} RESTART IDENTITY CASCADE;"
    conn.execute(text(sql))


def _delete_generic(conn: Connection, tables: Iterable) -> None:
    # Fallback for other DBs: delete rows in reverse dependency order.
    for t in reversed(list(tables)):
        conn.execute(t.delete())


def reset_all_app_data(*, destructive_ok: bool = False) -> None:
    """
    Deletes ALL rows from ALL application tables and resets identities.

    Safety:
    - You must pass destructive_ok=True.
    - Recommended: also gate via env vars in startup wrapper.
    """
    if not destructive_ok:
        raise RuntimeError("Refusing to reset DB without destructive_ok=True")

    _import_all_models()
    tables = list(Base.metadata.sorted_tables)

    with engine.begin() as conn:
        dialect = engine.dialect.name
        if dialect == "postgresql":
            _truncate_postgres(conn, tables)
        else:
            _delete_generic(conn, tables)


def should_reset_on_startup() -> bool:
    """
    Startup guard.

    To enable: set both
    - HB_RESET_DB_ON_STARTUP=true
    - HB_RESET_DB_CONFIRM=DELETE_ALL_DATA
    """
    if not _env_truthy("HB_RESET_DB_ON_STARTUP", default=False):
        return False
    return (os.getenv("HB_RESET_DB_CONFIRM") or "").strip() == "DELETE_ALL_DATA"


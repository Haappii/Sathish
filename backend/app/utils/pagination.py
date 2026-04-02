"""
Pagination utility.

Usage in a route:
    from app.utils.pagination import PageParams, paginate

    @router.get("/", response_model=list[SomeSchema])
    def list_items(page: PageParams = Depends(), db: Session = Depends(get_db)):
        q = db.query(SomeModel).filter(...)
        return paginate(q, page)
"""
from __future__ import annotations

from fastapi import Query
from dataclasses import dataclass
from sqlalchemy.orm import Query as SAQuery


@dataclass
class PageParams:
    skip: int = Query(default=0, ge=0, description="Number of records to skip")
    limit: int = Query(default=100, ge=1, le=1000, description="Max records to return (1-1000)")


def paginate(query: SAQuery, page: PageParams) -> list:
    return query.offset(page.skip).limit(page.limit).all()

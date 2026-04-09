from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from app.db import get_db
from app.models.feedback import Feedback
from app.models.shop_details import ShopDetails
from app.utils.permissions import require_permission

router = APIRouter(prefix="/feedback", tags=["Feedback"])


class FeedbackSubmit(BaseModel):
    shop_id: int
    invoice_no: Optional[str] = None
    customer_name: Optional[str] = None
    mobile: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


# ── Public: submit feedback (no auth) ─────────────────────────────────────────

@router.post("/submit")
def submit_feedback(payload: FeedbackSubmit, db: Session = Depends(get_db)):
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == payload.shop_id).first()
    if not shop:
        raise HTTPException(404, "Shop not found")

    fb = Feedback(
        shop_id=payload.shop_id,
        invoice_no=(payload.invoice_no or "").strip() or None,
        customer_name=(payload.customer_name or "").strip() or None,
        mobile=(payload.mobile or "").strip() or None,
        rating=payload.rating,
        comment=(payload.comment or "").strip() or None,
    )
    db.add(fb)
    db.commit()
    db.refresh(fb)
    return {"success": True, "feedback_id": fb.feedback_id}


# ── Public: get shop info for feedback page ────────────────────────────────────

@router.get("/shop-info/{shop_id}")
def feedback_shop_info(shop_id: int, db: Session = Depends(get_db)):
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    if not shop:
        raise HTTPException(404, "Shop not found")
    return {
        "shop_id": shop.shop_id,
        "shop_name": shop.shop_name,
        "mobile": getattr(shop, "mobile", None),
    }


# ── Auth: list feedback (admin/staff) ─────────────────────────────────────────

@router.get("/list")
def list_feedback(
    rating: Optional[int] = Query(None, ge=1, le=5),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(require_permission("feedback", "read")),
):
    q = db.query(Feedback).filter(Feedback.shop_id == user.shop_id)
    if rating:
        q = q.filter(Feedback.rating == rating)
    total = q.count()
    rows = q.order_by(Feedback.feedback_id.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [
            {
                "feedback_id": f.feedback_id,
                "invoice_no": f.invoice_no,
                "customer_name": f.customer_name,
                "mobile": f.mobile,
                "rating": f.rating,
                "comment": f.comment,
                "created_at": f.created_at.strftime("%Y-%m-%d %H:%M") if f.created_at else None,
            }
            for f in rows
        ],
    }


# ── Auth: summary stats ────────────────────────────────────────────────────────

@router.get("/summary")
def feedback_summary(
    db: Session = Depends(get_db),
    user=Depends(require_permission("feedback", "read")),
):
    from sqlalchemy import func
    rows = (
        db.query(Feedback.rating, func.count(Feedback.feedback_id).label("cnt"))
        .filter(Feedback.shop_id == user.shop_id)
        .group_by(Feedback.rating)
        .all()
    )
    counts = {r.rating: r.cnt for r in rows}
    total = sum(counts.values())
    avg = round(sum(r * c for r, c in counts.items()) / total, 2) if total else 0
    return {
        "total": total,
        "average": avg,
        "by_rating": {str(i): counts.get(i, 0) for i in range(1, 6)},
    }

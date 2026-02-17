from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime
from pathlib import Path
import uuid
import shutil

from app.db import get_db
from app.models.purchase_order import PurchaseOrder, PurchaseOrderItem
from app.models.supplier import Supplier
from app.models.items import Item
from app.models.item_lot import ItemLot
from app.models.purchase_order_attachment import PurchaseOrderAttachment
from app.models.supplier_ledger import SupplierLedgerEntry
from app.models.shop_details import ShopDetails
from app.models.stock import Inventory
from app.models.system_parameters import SystemParameter
from app.schemas.purchase_order import (
    PurchaseOrderCreate,
    PurchaseOrderResponse,
    PurchaseOrderReceive,
    PurchaseOrderPayment
)
from app.services.day_close_service import is_branch_day_closed
from app.services.inventory_service import adjust_stock
from app.services.audit_service import log_action
from app.utils.permissions import require_permission
from sqlalchemy import func

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])
UPLOAD_ROOT = Path("uploads")
PO_ATTACH_ROOT = UPLOAD_ROOT / "purchase_orders"


def resolve_branch(branch_id_param, user):
    role = str(getattr(user, "role_name", "") or "").strip().lower()
    if role == "admin":
        branch_raw = branch_id_param if branch_id_param not in (None, "") else getattr(user, "branch_id", None)
    else:
        branch_raw = getattr(user, "branch_id", None)

    try:
        return int(branch_raw)
    except (TypeError, ValueError):
        raise HTTPException(400, "Branch required")


def get_business_date(db: Session, shop_id: int):
    shop = db.query(ShopDetails).filter(ShopDetails.shop_id == shop_id).first()
    return shop.app_date if shop and shop.app_date else datetime.utcnow().date()


def generate_po_number():
    return f"PO-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"


@router.get("/", response_model=list[PurchaseOrderResponse])
def list_pos(
    branch_id: int | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_permission("purchase_orders", "read")),
):
    bid = resolve_branch(branch_id, user)
    rows = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.branch_id == bid, PurchaseOrder.shop_id == user.shop_id)
        .order_by(PurchaseOrder.po_id.desc())
        .all()
    )
    return rows


@router.get("/{po_id}", response_model=PurchaseOrderResponse)
def get_po(
    po_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("purchase_orders", "read")),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_id == po_id,
        PurchaseOrder.shop_id == user.shop_id
    ).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if str(user.role_name).lower() != "admin" and po.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")
    return po


@router.post("/", response_model=PurchaseOrderResponse)
def create_po(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user=Depends(require_permission("purchase_orders", "write")),
):
    bid = resolve_branch(payload.branch_id, user)
    business_date = get_business_date(db, user.shop_id)
    if is_branch_day_closed(db, user.shop_id, bid, business_date):
        raise HTTPException(403, "Day closed for this branch")

    supplier = db.query(Supplier).filter(
        Supplier.supplier_id == payload.supplier_id,
        Supplier.branch_id == bid,
        Supplier.status == "ACTIVE",
        Supplier.shop_id == user.shop_id
    ).first()
    if not supplier:
        raise HTTPException(400, "Supplier not found")

    if not payload.items:
        raise HTTPException(400, "Add items to PO")

    po = PurchaseOrder(
        po_number=generate_po_number(),
        shop_id=user.shop_id,
        supplier_id=payload.supplier_id,
        branch_id=bid,
        order_date=business_date,
        expected_date=datetime.strptime(payload.expected_date, "%Y-%m-%d").date()
        if payload.expected_date else None,
        status=(payload.status or "DRAFT"),
        payment_status=(payload.payment_status or "UNPAID"),
        notes=payload.notes,
        created_by=user.user_id
    )

    total = 0
    for it in payload.items:
        item = db.query(Item).filter(
            Item.item_id == it.item_id,
            Item.shop_id == user.shop_id
        ).first()
        if not item:
            raise HTTPException(400, f"Item not found: {it.item_id}")
        qty = int(it.qty or 0)
        if qty <= 0:
            raise HTTPException(400, "Qty must be > 0")

        unit_cost = float(it.unit_cost) if it.unit_cost is not None else float(item.buy_price or 0)
        sell_price = float(it.sell_price) if it.sell_price is not None else float(item.price or 0)
        mrp_price = float(it.mrp_price) if it.mrp_price is not None else float(item.mrp_price or 0)
        line_total = qty * unit_cost
        total += line_total

        po.items.append(PurchaseOrderItem(
            shop_id=user.shop_id,
            item_id=item.item_id,
            item_name=item.item_name,
            qty_ordered=qty,
            qty_received=0,
            unit_cost=unit_cost,
            sell_price=sell_price,
            mrp_price=mrp_price,
            line_total=line_total
        ))

    po.total_amount = total
    db.add(po)
    db.commit()
    db.refresh(po)

    log_action(
        db,
        shop_id=user.shop_id,
        module="PurchaseOrders",
        action="CREATE",
        record_id=po.po_number,
        new={
            "po_id": po.po_id,
            "branch_id": po.branch_id,
            "supplier_id": po.supplier_id,
            "status": po.status,
            "payment_status": po.payment_status,
            "total_amount": po.total_amount,
        },
        user_id=user.user_id,
    )
    return po


@router.post("/{po_id}/receive", response_model=PurchaseOrderResponse)
def receive_po(
    po_id: int,
    payload: PurchaseOrderReceive,
    db: Session = Depends(get_db),
    user=Depends(require_permission("purchase_orders", "write")),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_id == po_id,
        PurchaseOrder.shop_id == user.shop_id
    ).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if str(user.role_name).lower() != "admin" and po.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    business_date = get_business_date(db, user.shop_id)
    business_dt = datetime.combine(business_date, datetime.now().time())
    if is_branch_day_closed(db, user.shop_id, po.branch_id, business_date):
        raise HTTPException(403, "Day closed for this branch")

    if not payload.items:
        raise HTTPException(400, "No receive items")

    receive_map = {x.item_id: x for x in payload.items}
    any_received = False
    cost_method_row = (
        db.query(SystemParameter)
        .filter(
            SystemParameter.shop_id == user.shop_id,
            SystemParameter.param_key == "inventory_cost_method",
        )
        .first()
    )
    cost_method = str(getattr(cost_method_row, "param_value", "") or "LAST").strip().upper()
    if cost_method not in {"LAST", "WAVG", "FIFO"}:
        cost_method = "LAST"

    for item in po.items:
        req = receive_map.get(item.item_id)
        if not req:
            continue
        qty_in = int(req.qty_received or 0)
        if qty_in <= 0:
            continue

        unit_cost = float(item.unit_cost or 0)
        # Update item buy price from received cost (affects future COGS on invoices)
        try:
            master_item = (
                db.query(Item)
                .filter(Item.shop_id == user.shop_id, Item.item_id == item.item_id)
                .first()
            )
            if master_item and unit_cost >= 0:
                if cost_method in {"LAST", "FIFO"}:
                    master_item.buy_price = unit_cost
                else:
                    old_qty = float(
                        (
                            db.query(func.coalesce(func.sum(Inventory.quantity), 0))
                            .filter(
                                Inventory.shop_id == user.shop_id,
                                Inventory.item_id == item.item_id,
                            )
                            .scalar()
                        )
                        or 0
                    )
                    old_qty = max(0.0, old_qty)
                    old_cost = float(master_item.buy_price or 0)
                    new_qty = old_qty + float(qty_in)
                    if new_qty > 0:
                        master_item.buy_price = (old_qty * old_cost + float(qty_in) * unit_cost) / new_qty
        except Exception:
            # Don't block receiving stock if cost update fails
            pass

        remaining = item.qty_ordered - item.qty_received
        if qty_in > remaining:
            raise HTTPException(400, f"Qty exceeds remaining for {item.item_name}")
        item.qty_received += qty_in
        adjust_stock(db, user.shop_id, item.item_id, po.branch_id, qty_in, "ADD", ref_no=po.po_number)
        any_received = True

        # Lot / batch / expiry / serial capture (auto-fill Item Lots on every receive)
        batch_no = (req.batch_no or "").strip() or None
        exp_date = None
        if req.expiry_date:
            try:
                exp_date = datetime.strptime(req.expiry_date, "%Y-%m-%d").date()
            except ValueError:
                raise HTTPException(400, "Invalid expiry_date format YYYY-MM-DD")
        serials = req.serial_numbers or None
        if serials and len(serials) == qty_in:
            for sn in serials:
                db.add(ItemLot(
                    shop_id=user.shop_id,
                    branch_id=po.branch_id,
                    item_id=item.item_id,
                    source_type="PO",
                    source_ref=po.po_number,
                    batch_no=batch_no,
                    expiry_date=exp_date,
                    serial_no=str(sn).strip() or None,
                    quantity=1,
                    unit_cost=unit_cost,
                    created_by=user.user_id,
                ))
        else:
            db.add(ItemLot(
                shop_id=user.shop_id,
                branch_id=po.branch_id,
                item_id=item.item_id,
                source_type="PO",
                source_ref=po.po_number,
                batch_no=batch_no,
                expiry_date=exp_date,
                serial_no=None,
                quantity=qty_in,
                unit_cost=unit_cost,
                created_by=user.user_id,
            ))

    # update status
    all_received = all(i.qty_received >= i.qty_ordered for i in po.items)
    if all_received:
        po.status = "CLOSED"
    else:
        po.status = "PARTIALLY_RECEIVED" if any(i.qty_received > 0 for i in po.items) else po.status

    # Supplier ledger: create PO debit entry once, on first receipt
    if any_received:
        has_po_entry = (
            db.query(SupplierLedgerEntry.entry_id)
            .filter(
                SupplierLedgerEntry.shop_id == user.shop_id,
                SupplierLedgerEntry.po_id == po.po_id,
                SupplierLedgerEntry.entry_type == "PO",
            )
            .first()
            is not None
        )
        if not has_po_entry:
            db.add(SupplierLedgerEntry(
                shop_id=user.shop_id,
                branch_id=po.branch_id,
                supplier_id=po.supplier_id,
                entry_type="PO",
                reference_no=po.po_number,
                po_id=po.po_id,
                debit=float(po.total_amount or 0),
                credit=0,
                notes="Purchase received",
                entry_time=business_dt,
                created_by=user.user_id,
            ))

    db.commit()
    db.refresh(po)

    log_action(
        db,
        shop_id=user.shop_id,
        module="PurchaseOrders",
        action="RECEIVE",
        record_id=po.po_number,
        new={
            "po_id": po.po_id,
            "branch_id": po.branch_id,
            "status": po.status,
            "received_items": len(payload.items or []),
        },
        user_id=user.user_id,
    )
    return po


@router.post("/{po_id}/payment", response_model=PurchaseOrderResponse)
def update_payment(
    po_id: int,
    payload: PurchaseOrderPayment,
    db: Session = Depends(get_db),
    user=Depends(require_permission("purchase_orders", "write")),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_id == po_id,
        PurchaseOrder.shop_id == user.shop_id
    ).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if str(user.role_name).lower() != "admin" and po.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    business_date = get_business_date(db, user.shop_id)
    business_dt = datetime.combine(business_date, datetime.now().time())
    if is_branch_day_closed(db, user.shop_id, po.branch_id, business_date):
        raise HTTPException(403, "Day closed for this branch")

    old_paid = float(po.paid_amount or 0)
    new_paid = float(payload.paid_amount or 0)

    if new_paid < 0:
        raise HTTPException(400, "paid_amount must be >= 0")

    po.paid_amount = new_paid

    # Normalize status by amount (ignore payload payment_status for consistency)
    if po.paid_amount >= float(po.total_amount or 0) - 0.01:
        po.paid_amount = float(po.total_amount or 0)
        po.payment_status = "PAID"
    elif po.paid_amount > 0:
        po.payment_status = "PARTIAL"
    else:
        po.payment_status = "UNPAID"

    # Ensure PO debit entry exists
    has_po_entry = (
        db.query(SupplierLedgerEntry.entry_id)
        .filter(
            SupplierLedgerEntry.shop_id == user.shop_id,
            SupplierLedgerEntry.po_id == po.po_id,
            SupplierLedgerEntry.entry_type == "PO",
        )
        .first()
        is not None
    )
    if not has_po_entry:
        db.add(SupplierLedgerEntry(
            shop_id=user.shop_id,
            branch_id=po.branch_id,
            supplier_id=po.supplier_id,
            entry_type="PO",
            reference_no=po.po_number,
            po_id=po.po_id,
            debit=float(po.total_amount or 0),
            credit=0,
            notes="Purchase order",
            entry_time=po.created_at,
            created_by=user.user_id,
        ))

    # Record delta as a ledger entry
    delta = new_paid - old_paid
    if abs(delta) > 0.009:
        if delta > 0:
            db.add(SupplierLedgerEntry(
                shop_id=user.shop_id,
                branch_id=po.branch_id,
                supplier_id=po.supplier_id,
                entry_type="PAYMENT",
                reference_no=f"{po.po_number}-PAY",
                po_id=po.po_id,
                debit=0,
                credit=float(delta),
                notes="PO payment update",
                entry_time=business_dt,
                created_by=user.user_id,
            ))
        else:
            db.add(SupplierLedgerEntry(
                shop_id=user.shop_id,
                branch_id=po.branch_id,
                supplier_id=po.supplier_id,
                entry_type="ADJUSTMENT",
                reference_no=f"{po.po_number}-ADJ",
                po_id=po.po_id,
                debit=float(abs(delta)),
                credit=0,
                notes="PO payment reversal",
                entry_time=business_dt,
                created_by=user.user_id,
            ))
    db.commit()
    db.refresh(po)

    log_action(
        db,
        shop_id=user.shop_id,
        module="PurchaseOrders",
        action="PAYMENT",
        record_id=po.po_number,
        new={
            "po_id": po.po_id,
            "payment_status": po.payment_status,
            "paid_amount": po.paid_amount,
        },
        user_id=user.user_id,
    )
    return po


@router.get("/{po_id}/attachments")
def list_attachments(
    po_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("purchase_orders", "read")),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_id == po_id,
        PurchaseOrder.shop_id == user.shop_id
    ).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if str(user.role_name).lower() != "admin" and po.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    rows = (
        db.query(PurchaseOrderAttachment)
        .filter(
            PurchaseOrderAttachment.shop_id == user.shop_id,
            PurchaseOrderAttachment.po_id == po_id,
        )
        .order_by(PurchaseOrderAttachment.attachment_id.desc())
        .all()
    )

    return [
        {
            "attachment_id": a.attachment_id,
            "original_filename": a.original_filename,
            "stored_path": a.stored_path,
            "mime_type": a.mime_type,
            "size_bytes": a.size_bytes,
            "uploaded_at": a.uploaded_at.strftime("%Y-%m-%d %H:%M") if a.uploaded_at else None,
            "url": f"/api/uploads/{a.stored_path}",
        }
        for a in rows
    ]


@router.post("/{po_id}/attachments")
def upload_attachment(
    po_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user=Depends(require_permission("purchase_orders", "write")),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_id == po_id,
        PurchaseOrder.shop_id == user.shop_id
    ).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if str(user.role_name).lower() != "admin" and po.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    if not file or not file.filename:
        raise HTTPException(400, "No file uploaded")

    ext = Path(file.filename).suffix.lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"

    dir_path = PO_ATTACH_ROOT / str(user.shop_id) / str(po_id)
    dir_path.mkdir(parents=True, exist_ok=True)

    dest = dir_path / safe_name
    try:
        with dest.open("wb") as f:
            shutil.copyfileobj(file.file, f)
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    stored_rel = f"purchase_orders/{user.shop_id}/{po_id}/{safe_name}"

    row = PurchaseOrderAttachment(
        shop_id=user.shop_id,
        po_id=po_id,
        original_filename=file.filename,
        stored_path=stored_rel,
        mime_type=file.content_type,
        size_bytes=dest.stat().st_size if dest.exists() else None,
        uploaded_by=user.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    log_action(
        db,
        shop_id=user.shop_id,
        module="PurchaseOrders",
        action="ATTACHMENT_UPLOAD",
        record_id=f"{po.po_number}:{row.attachment_id}",
        new={
            "po_id": po_id,
            "original_filename": row.original_filename,
            "stored_path": row.stored_path,
        },
        user_id=user.user_id,
    )

    return {
        "attachment_id": row.attachment_id,
        "original_filename": row.original_filename,
        "stored_path": row.stored_path,
        "mime_type": row.mime_type,
        "size_bytes": row.size_bytes,
        "url": f"/api/uploads/{row.stored_path}",
    }


@router.delete("/{po_id}/attachments/{attachment_id}")
def delete_attachment(
    po_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_permission("purchase_orders", "write")),
):
    po = db.query(PurchaseOrder).filter(
        PurchaseOrder.po_id == po_id,
        PurchaseOrder.shop_id == user.shop_id
    ).first()
    if not po:
        raise HTTPException(404, "PO not found")
    if str(user.role_name).lower() != "admin" and po.branch_id != user.branch_id:
        raise HTTPException(403, "Not allowed")

    row = (
        db.query(PurchaseOrderAttachment)
        .filter(
            PurchaseOrderAttachment.attachment_id == attachment_id,
            PurchaseOrderAttachment.shop_id == user.shop_id,
            PurchaseOrderAttachment.po_id == po_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(404, "Attachment not found")

    # Best-effort delete file
    try:
        abs_path = UPLOAD_ROOT / Path(row.stored_path)
        if abs_path.exists():
            abs_path.unlink()
    except Exception:
        pass

    db.delete(row)
    db.commit()

    log_action(
        db,
        shop_id=user.shop_id,
        module="PurchaseOrders",
        action="ATTACHMENT_DELETE",
        record_id=f"{po.po_number}:{attachment_id}",
        new={"po_id": po_id, "attachment_id": attachment_id},
        user_id=user.user_id,
    )

    return {"success": True}

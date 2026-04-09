from pydantic import BaseModel
from typing import Optional


class BranchBase(BaseModel):
    # Some legacy rows may have NULL branch_name; default to empty string to avoid 422 validation errors.
    branch_name: Optional[str] = ""
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    type: Optional[str] = "Branch"
    status: Optional[str] = "ACTIVE"

    # Optional: default discount settings (stored in system_parameters)
    discount_enabled: Optional[bool] = False
    discount_type: Optional[str] = "flat"  # flat | percent
    discount_value: Optional[float] = 0

    # Optional: print settings (stored in system_parameters)
    kot_required: Optional[bool] = True
    receipt_required: Optional[bool] = True
    feedback_qr_enabled: Optional[bool] = True
    order_live_tracking_enabled: Optional[bool] = True
    paper_size: Optional[str] = "58mm"  # 58mm | 80mm
    fssai_number: Optional[str] = ""   # branch-level FSSAI (overrides shop-level)

    # Optional: service charge (stored directly on branch row)
    service_charge_required: Optional[bool] = False
    service_charge_amount: Optional[float] = 0
    service_charge_gst_required: Optional[bool] = False
    service_charge_gst_percent: Optional[float] = 0

    # Optional: loyalty points percentage for this branch (stored in system_parameters)
    loyalty_points_percentage: Optional[float] = 0

    # Optional: online order settings (stored in system_parameters)
    swiggy_enabled: Optional[bool] = False
    zomato_enabled: Optional[bool] = False
    swiggy_partner_id: Optional[str] = ""
    zomato_partner_id: Optional[str] = ""
    online_orders_auto_accept: Optional[bool] = False
    online_orders_webhook_token: Optional[str] = ""
    online_orders_signature_required: Optional[bool] = False
    swiggy_webhook_secret: Optional[str] = ""
    zomato_webhook_secret: Optional[str] = ""
    online_orders_status_sync_enabled: Optional[bool] = True
    online_orders_status_sync_strict: Optional[bool] = False
    online_orders_status_sync_timeout_sec: Optional[int] = 8
    swiggy_status_sync_url: Optional[str] = ""
    zomato_status_sync_url: Optional[str] = ""
    swiggy_status_sync_token: Optional[str] = ""
    zomato_status_sync_token: Optional[str] = ""
    swiggy_status_sync_secret: Optional[str] = ""
    zomato_status_sync_secret: Optional[str] = ""

class BranchCreate(BranchBase):
    pass

class BranchUpdate(BranchBase):
    pass

class BranchOut(BranchBase):
    branch_id: int

    class Config:
        from_attributes = True

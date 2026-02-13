from pydantic import BaseModel
from datetime import date
from typing import Optional

class ShopDetailsBase(BaseModel):
    shop_name: Optional[str] = None
    owner_name: Optional[str] = None
    mobile: Optional[str] = None
    mailid: Optional[str] = None

    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    address_line3: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    gst_number: Optional[str] = None
    logo_url: Optional[str] = None

    # Billing settings
    billing_type: Optional[str] = "store"
    gst_enabled: Optional[bool] = False
    gst_percent: Optional[float] = 0
    gst_mode: Optional[str] = "inclusive"

    app_date: Optional[date] = None

    # Stored in system_parameters (not in shop_details table)
    inventory_enabled: Optional[bool] = None
    swiggy_partner_id: Optional[str] = None
    zomato_partner_id: Optional[str] = None
    swiggy_enabled: Optional[bool] = None
    zomato_enabled: Optional[bool] = None
    online_orders_auto_accept: Optional[bool] = None
    online_orders_webhook_token: Optional[str] = None


class ShopDetailsResponse(ShopDetailsBase):
    shop_id: int

    class Config:
        from_attributes = True

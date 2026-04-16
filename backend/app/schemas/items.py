from pydantic import AliasChoices, BaseModel, Field
from typing import Optional


class ItemBase(BaseModel):
    item_name: Optional[str] = None
    category_id: Optional[int] = None
    supplier_id: Optional[int] = None
    price: Optional[float] = None
    buy_price: Optional[float] = None
    mrp_price: Optional[float] = None
    item_status: Optional[bool] = None
    is_raw_material: Optional[bool] = None
    sold_by_weight: Optional[bool] = Field(
        default=None,
        validation_alias=AliasChoices("sold_by_weight", "soldByWeight"),
        serialization_alias="sold_by_weight",
    )
    min_stock: Optional[int] = None
    unit: Optional[str] = None   # kg, g, ml, L, pcs — raw material stock unit


class ItemCreate(ItemBase):
    item_name: str
    category_id: Optional[int] = None   # required for normal items; null for raw materials
    supplier_id: Optional[int] = None   # required for raw materials; null for normal items
    price: float = 0
    buy_price: float = 0
    mrp_price: float = 0
    item_status: bool = True
    min_stock: int = 0
    is_raw_material: bool = False
    sold_by_weight: bool = False
    unit: Optional[str] = None


class ItemUpdate(ItemBase):
    pass


class ItemResponse(BaseModel):
    item_id: int
    item_name: str
    category_id: Optional[int] = None
    supplier_id: Optional[int] = None
    price: float
    buy_price: float
    mrp_price: float
    image_filename: Optional[str] = None
    min_stock: int
    unit: Optional[str] = None
    is_raw_material: bool = False
    sold_by_weight: bool = False
    item_status: bool

    class Config:
        from_attributes = True

from pydantic import BaseModel
from typing import Optional


class ItemBase(BaseModel):
    item_name: Optional[str] = None
    category_id: Optional[int] = None
    price: Optional[float] = 0
    buy_price: Optional[float] = 0
    mrp_price: Optional[float] = 0
    item_status: Optional[bool] = True
    min_stock: Optional[int] = 0   # 👈 now belongs to Item


class ItemCreate(ItemBase):
    item_name: str
    category_id: int
    price: float = 0
    buy_price: float = 0
    mrp_price: float = 0
    item_status: bool = True
    min_stock: int = 0


class ItemUpdate(ItemBase):
    pass


class ItemResponse(BaseModel):
    item_id: int
    item_name: str
    category_id: int
    price: float
    buy_price: float
    mrp_price: float
    image_filename: Optional[str] = None
    min_stock: int
    item_status: bool

    class Config:
        from_attributes = True

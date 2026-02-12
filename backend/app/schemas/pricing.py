from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ItemPriceUpsert(BaseModel):
    item_id: int
    level: str
    price: float


class ItemPriceOut(BaseModel):
    price_id: int
    item_id: int
    level: str
    price: float
    created_at: datetime

    class Config:
        from_attributes = True


class PriceLevelOut(BaseModel):
    level: str
    count: int


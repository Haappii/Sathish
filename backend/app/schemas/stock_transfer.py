from pydantic import BaseModel
from typing import List, Optional


class StockTransferItemIn(BaseModel):
    item_id: int
    quantity: int


class StockTransferCreate(BaseModel):
    to_branch_id: int
    from_branch_id: Optional[int] = None
    notes: Optional[str] = None
    items: List[StockTransferItemIn]


class StockTransferAction(BaseModel):
    notes: Optional[str] = None


class StockTransferItemOut(BaseModel):
    item_id: int
    quantity: int

    class Config:
        from_attributes = True


class StockTransferOut(BaseModel):
    transfer_id: int
    transfer_number: str
    from_branch_id: int
    to_branch_id: int
    status: str
    notes: Optional[str] = None

    items: List[StockTransferItemOut] = []

    class Config:
        from_attributes = True

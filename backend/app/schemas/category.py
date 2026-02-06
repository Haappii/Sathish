from pydantic import BaseModel

class CategoryBase(BaseModel):
    category_name: str
    category_status: bool = True

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    category_name: str | None = None
    category_status: bool | None = None

class CategoryResponse(BaseModel):
    category_id: int
    category_name: str
    category_status: bool

    class Config:
        from_attributes = True

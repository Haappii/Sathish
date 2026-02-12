from pydantic import BaseModel


class PermissionModule(BaseModel):
    key: str
    label: str


class RolePermissionUpsert(BaseModel):
    role_id: int
    module: str
    can_read: bool = False
    can_write: bool = False


class RolePermissionResponse(BaseModel):
    id: int
    shop_id: int
    role_id: int
    role_name: str | None = None
    module: str
    can_read: bool
    can_write: bool

    class Config:
        from_attributes = True


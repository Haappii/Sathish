from pydantic import BaseModel

class RoleBase(BaseModel):
    role_name: str
    status: bool = True


class RoleCreate(RoleBase):
    pass


class RoleUpdate(BaseModel):
    role_name: str | None = None
    status: bool | None = None


class RoleResponse(BaseModel):
    role_id: int
    role_name: str
    status: bool

    class Config:
        from_attributes = True

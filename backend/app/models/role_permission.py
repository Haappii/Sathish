from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, UniqueConstraint, TIMESTAMP
from sqlalchemy.sql import func

from app.db import Base


class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(Integer, primary_key=True, index=True)

    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False, index=True)
    role_id = Column(Integer, ForeignKey("roles.role_id"), nullable=False, index=True)

    # e.g. billing, inventory, reports
    module = Column(String(80), nullable=False, index=True)

    can_read = Column(Boolean, nullable=False, default=False)
    can_write = Column(Boolean, nullable=False, default=False)

    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("shop_id", "role_id", "module", name="uq_role_permissions_shop_role_module"),
    )


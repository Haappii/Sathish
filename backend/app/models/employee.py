from sqlalchemy import (
    Boolean,
    Column,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    TIMESTAMP,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db import Base


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        Index("ix_employees_shop_branch_active", "shop_id", "branch_id", "active"),
        Index("ix_employees_shop_name", "shop_id", "employee_name"),
    )

    employee_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    employee_code = Column(String(40), nullable=True)
    employee_name = Column(String(150), nullable=False)
    mobile = Column(String(20), nullable=True)
    designation = Column(String(100), nullable=True)

    wage_type = Column(String(20), nullable=False, default="DAILY")  # DAILY | MONTHLY | ON_DEMAND
    daily_wage = Column(Float, nullable=False, default=0)
    monthly_wage = Column(Float, nullable=False, default=0)

    join_date = Column(Date, nullable=True)
    notes = Column(String(300), nullable=True)
    active = Column(Boolean, nullable=False, default=True)

    created_by = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    attendance_rows = relationship(
        "EmployeeAttendance", back_populates="employee", cascade="all, delete-orphan"
    )
    wage_payments = relationship(
        "EmployeeWagePayment", back_populates="employee", cascade="all, delete-orphan"
    )


class EmployeeAttendance(Base):
    __tablename__ = "employee_attendance"
    __table_args__ = (
        UniqueConstraint(
            "shop_id",
            "employee_id",
            "attendance_date",
            name="uq_employee_attendance_shop_emp_date",
        ),
        Index("ix_employee_attendance_shop_date", "shop_id", "attendance_date"),
    )

    attendance_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.employee_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    attendance_date = Column(Date, nullable=False)
    status = Column(String(20), nullable=False, default="PRESENT")  # PRESENT | ABSENT | HALF_DAY | LEAVE
    worked_units = Column(Float, nullable=False, default=1)  # Optional factor
    wage_amount = Column(Float, nullable=False, default=0)  # Calculated / manual value
    notes = Column(String(300), nullable=True)

    created_by = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    employee = relationship("Employee", back_populates="attendance_rows")


class EmployeeWagePayment(Base):
    __tablename__ = "employee_wage_payments"
    __table_args__ = (
        Index("ix_employee_wage_payments_shop_date", "shop_id", "payment_date"),
        Index("ix_employee_wage_payments_shop_emp", "shop_id", "employee_id"),
    )

    payment_id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shop_details.shop_id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.employee_id"), nullable=False)
    branch_id = Column(Integer, ForeignKey("branch.branch_id"), nullable=False)

    payment_date = Column(Date, nullable=False)
    amount = Column(Float, nullable=False, default=0)
    payment_mode = Column(String(30), nullable=False, default="CASH")
    notes = Column(String(300), nullable=True)

    created_by = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)

    employee = relationship("Employee", back_populates="wage_payments")

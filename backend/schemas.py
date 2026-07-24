"""Esquemas Pydantic: validan y dan forma a los datos de la API."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------- Transacciones ----------
class TransactionCreate(BaseModel):
    type: str = Field(default="expense", pattern="^(expense|income|saving)$")
    amount: float = Field(gt=0)
    currency: str = "EUR"
    category: str = "Otros"
    merchant: str | None = None
    note: str | None = None
    occurred_on: date | None = None


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    amount: float
    currency: str
    category: str
    merchant: str | None
    note: str | None
    occurred_on: date
    source: str
    receipt_id: int | None


# ---------- Recibos ----------
class ReceiptItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    quantity: float
    unit_price: float | None
    total_price: float


class ReceiptOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    merchant: str | None
    address: str | None
    purchase_date: date | None
    total: float
    currency: str
    category: str
    has_image: bool
    created_at: datetime
    items: list[ReceiptItemOut] = []


# ---------- Objetivos de ahorro ----------
class SavingsGoalCreate(BaseModel):
    name: str
    target_amount: float = Field(gt=0)
    currency: str = "EUR"


class SavingsGoalContribution(BaseModel):
    amount: float = Field(gt=0)


class SavingsGoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    target_amount: float
    current_amount: float
    currency: str


# ---------- Resumen ----------
class CategoryTotal(BaseModel):
    category: str
    total: float


class MerchantTotal(BaseModel):
    merchant: str
    total: float


class MonthTotal(BaseModel):
    month: str
    expenses: float
    income: float


class Summary(BaseModel):
    currency: str
    total_expenses: float
    total_income: float
    total_savings: float
    balance: float
    by_category: list[CategoryTotal]
    by_merchant: list[MerchantTotal]
    by_month: list[MonthTotal]
    transactions_count: int

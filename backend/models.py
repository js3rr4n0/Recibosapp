"""Modelos ORM: cómo se guardan los datos en la base de datos."""
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from .database import Base


class Transaction(Base):
    """Un movimiento de dinero: gasto, ingreso o ahorro."""

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Tipo de movimiento: "expense" (gasto), "income" (ingreso) o "saving" (ahorro).
    type: Mapped[str] = mapped_column(String(20), index=True)
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(8), default="EUR")
    category: Mapped[str] = mapped_column(String(64), default="Otros", index=True)
    # Comercio o lugar donde ocurrió el movimiento.
    merchant: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_on: Mapped[date] = mapped_column(Date, default=date.today, index=True)
    # Origen del dato: "manual" o "receipt" (escaneado de un recibo).
    source: Mapped[str] = mapped_column(String(20), default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    receipt_id: Mapped[int | None] = mapped_column(
        ForeignKey("receipts.id"), nullable=True
    )
    receipt: Mapped["Receipt"] = relationship(back_populates="transaction")


class Receipt(Base):
    """Un recibo escaneado con la cámara."""

    __tablename__ = "receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    merchant: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    total: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="EUR")
    category: Mapped[str] = mapped_column(String(64), default="Otros")
    # La imagen se guarda dentro de la base de datos (el sistema de archivos
    # de Vercel es de solo lectura). Puede ser null si no se conserva.
    image_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    image_mime: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    items: Mapped[list["ReceiptItem"]] = relationship(
        back_populates="receipt", cascade="all, delete-orphan"
    )
    transaction: Mapped["Transaction"] = relationship(back_populates="receipt")

    @property
    def has_image(self) -> bool:
        """Indica si el recibo tiene una imagen guardada."""
        return self.image_data is not None


class ReceiptItem(Base):
    """Un artículo individual dentro de un recibo."""

    __tablename__ = "receipt_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    receipt_id: Mapped[int] = mapped_column(ForeignKey("receipts.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_price: Mapped[float] = mapped_column(Float, default=0.0)

    receipt: Mapped["Receipt"] = relationship(back_populates="items")


class SavingsGoal(Base):
    """Un objetivo de ahorro (por ejemplo: 'Vacaciones', 1000 €)."""

    __tablename__ = "savings_goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    target_amount: Mapped[float] = mapped_column(Float, default=0.0)
    current_amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="EUR")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

"""Operaciones sobre la base de datos (crear, leer, resumir)."""
from collections import defaultdict
from datetime import date, datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models, schemas


# ---------- Transacciones ----------
def create_transaction(db: Session, data: schemas.TransactionCreate) -> models.Transaction:
    tx = models.Transaction(
        type=data.type,
        amount=round(data.amount, 2),
        currency=data.currency,
        category=data.category,
        merchant=data.merchant,
        note=data.note,
        occurred_on=data.occurred_on or date.today(),
        source="manual",
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


def list_transactions(db: Session, limit: int = 100) -> list[models.Transaction]:
    return (
        db.query(models.Transaction)
        .order_by(models.Transaction.occurred_on.desc(), models.Transaction.id.desc())
        .limit(limit)
        .all()
    )


def delete_transaction(db: Session, tx_id: int) -> bool:
    tx = db.get(models.Transaction, tx_id)
    if not tx:
        return False
    db.delete(tx)
    db.commit()
    return True


# ---------- Recibos ----------
def create_receipt_from_scan(
    db: Session,
    scan: dict,
    image_data: bytes | None = None,
    image_mime: str | None = None,
) -> models.Receipt:
    """Crea un recibo (con sus artículos) y su gasto asociado a partir del escaneo."""
    purchase_date = None
    if scan.get("purchase_date"):
        try:
            purchase_date = datetime.strptime(scan["purchase_date"], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            purchase_date = None

    receipt = models.Receipt(
        merchant=scan.get("merchant"),
        address=scan.get("address"),
        purchase_date=purchase_date,
        total=scan.get("total", 0.0),
        currency=scan.get("currency", "EUR"),
        category=scan.get("category", "Otros"),
        image_data=image_data,
        image_mime=image_mime,
    )
    for item in scan.get("items", []):
        receipt.items.append(
            models.ReceiptItem(
                name=item["name"],
                quantity=item.get("quantity", 1.0),
                unit_price=item.get("unit_price"),
                total_price=item.get("total_price", 0.0),
            )
        )
    db.add(receipt)
    db.flush()  # Para disponer del id del recibo.

    # Creamos automáticamente el gasto asociado al recibo.
    tx = models.Transaction(
        type="expense",
        amount=round(receipt.total, 2),
        currency=receipt.currency,
        category=receipt.category,
        merchant=receipt.merchant,
        note="Generado automáticamente desde un recibo escaneado",
        occurred_on=purchase_date or date.today(),
        source="receipt",
        receipt_id=receipt.id,
    )
    db.add(tx)
    db.commit()
    db.refresh(receipt)
    return receipt


def list_receipts(db: Session, limit: int = 50) -> list[models.Receipt]:
    return (
        db.query(models.Receipt)
        .order_by(models.Receipt.created_at.desc())
        .limit(limit)
        .all()
    )


def get_receipt(db: Session, receipt_id: int) -> models.Receipt | None:
    return db.get(models.Receipt, receipt_id)


# ---------- Objetivos de ahorro ----------
def create_goal(db: Session, data: schemas.SavingsGoalCreate) -> models.SavingsGoal:
    goal = models.SavingsGoal(
        name=data.name,
        target_amount=round(data.target_amount, 2),
        currency=data.currency,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


def list_goals(db: Session) -> list[models.SavingsGoal]:
    return db.query(models.SavingsGoal).order_by(models.SavingsGoal.id.desc()).all()


def contribute_to_goal(
    db: Session, goal_id: int, amount: float
) -> models.SavingsGoal | None:
    """Añade dinero a un objetivo y registra el ahorro como transacción."""
    goal = db.get(models.SavingsGoal, goal_id)
    if not goal:
        return None
    goal.current_amount = round(goal.current_amount + amount, 2)
    db.add(
        models.Transaction(
            type="saving",
            amount=round(amount, 2),
            currency=goal.currency,
            category="Ahorro",
            merchant=goal.name,
            note=f"Aportación al objetivo '{goal.name}'",
            occurred_on=date.today(),
            source="manual",
        )
    )
    db.commit()
    db.refresh(goal)
    return goal


# ---------- Resumen / analítica ----------
def build_summary(db: Session, currency: str) -> schemas.Summary:
    txs = db.query(models.Transaction).all()

    total_expenses = sum(t.amount for t in txs if t.type == "expense")
    total_income = sum(t.amount for t in txs if t.type == "income")
    total_savings = sum(t.amount for t in txs if t.type == "saving")

    # Gasto por categoría.
    by_cat: dict[str, float] = defaultdict(float)
    for t in txs:
        if t.type == "expense":
            by_cat[t.category] += t.amount
    by_category = [
        schemas.CategoryTotal(category=c, total=round(v, 2))
        for c, v in sorted(by_cat.items(), key=lambda x: x[1], reverse=True)
    ]

    # Gasto por comercio.
    by_merch: dict[str, float] = defaultdict(float)
    for t in txs:
        if t.type == "expense" and t.merchant:
            by_merch[t.merchant] += t.amount
    by_merchant = [
        schemas.MerchantTotal(merchant=m, total=round(v, 2))
        for m, v in sorted(by_merch.items(), key=lambda x: x[1], reverse=True)[:10]
    ]

    # Gasto e ingreso por mes (YYYY-MM).
    by_month_map: dict[str, dict[str, float]] = defaultdict(
        lambda: {"expenses": 0.0, "income": 0.0}
    )
    for t in txs:
        key = t.occurred_on.strftime("%Y-%m")
        if t.type == "expense":
            by_month_map[key]["expenses"] += t.amount
        elif t.type == "income":
            by_month_map[key]["income"] += t.amount
    by_month = [
        schemas.MonthTotal(
            month=k,
            expenses=round(v["expenses"], 2),
            income=round(v["income"], 2),
        )
        for k, v in sorted(by_month_map.items())
    ]

    return schemas.Summary(
        currency=currency,
        total_expenses=round(total_expenses, 2),
        total_income=round(total_income, 2),
        total_savings=round(total_savings, 2),
        balance=round(total_income - total_expenses, 2),
        by_category=by_category,
        by_merchant=by_merchant,
        by_month=by_month,
        transactions_count=len(txs),
    )

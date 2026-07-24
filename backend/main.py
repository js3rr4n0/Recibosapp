"""Aplicación FastAPI: define la API y sirve la interfaz web."""
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import crud, models, schemas
from .config import ANTHROPIC_API_KEY, CATEGORIES, DEFAULT_CURRENCY, UPLOADS_DIR
from .database import Base, engine, get_db
from .receipt_scanner import ScannerError, scan_receipt

# Crea las tablas en la base de datos si aún no existen.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Recibosapp — Asistente económico", version="1.0.0")

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


# ---------- Configuración / estado ----------
@app.get("/api/config")
def get_config():
    """Datos de configuración que necesita el frontend."""
    return {
        "default_currency": DEFAULT_CURRENCY,
        "categories": CATEGORIES,
        "scanner_enabled": bool(ANTHROPIC_API_KEY),
    }


# ---------- Transacciones ----------
@app.get("/api/transactions", response_model=list[schemas.TransactionOut])
def list_transactions(limit: int = 100, db: Session = Depends(get_db)):
    return crud.list_transactions(db, limit=limit)


@app.post("/api/transactions", response_model=schemas.TransactionOut)
def create_transaction(data: schemas.TransactionCreate, db: Session = Depends(get_db)):
    return crud.create_transaction(db, data)


@app.delete("/api/transactions/{tx_id}")
def delete_transaction(tx_id: int, db: Session = Depends(get_db)):
    if not crud.delete_transaction(db, tx_id):
        raise HTTPException(status_code=404, detail="Transacción no encontrada")
    return {"ok": True}


# ---------- Recibos ----------
@app.post("/api/receipts/scan", response_model=schemas.ReceiptOut)
async def scan_and_store_receipt(
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    """Recibe la foto de un recibo, la escanea y guarda todo automáticamente."""
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="El archivo está vacío.")

    # Guardamos la imagen original en disco.
    suffix = Path(file.filename or "receipt.jpg").suffix or ".jpg"
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    stored_path = UPLOADS_DIR / stored_name
    stored_path.write_bytes(image_bytes)

    try:
        scan = scan_receipt(image_bytes, file.filename or stored_name, file.content_type)
    except ScannerError as exc:
        # Si falla el escaneo, borramos la imagen para no dejar basura.
        stored_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    receipt = crud.create_receipt_from_scan(db, scan, image_path=stored_name)
    return receipt


@app.get("/api/receipts", response_model=list[schemas.ReceiptOut])
def list_receipts(limit: int = 50, db: Session = Depends(get_db)):
    return crud.list_receipts(db, limit=limit)


@app.get("/api/receipts/{receipt_id}", response_model=schemas.ReceiptOut)
def get_receipt(receipt_id: int, db: Session = Depends(get_db)):
    receipt = crud.get_receipt(db, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Recibo no encontrado")
    return receipt


@app.get("/api/receipts/{receipt_id}/image")
def get_receipt_image(receipt_id: int, db: Session = Depends(get_db)):
    receipt = crud.get_receipt(db, receipt_id)
    if not receipt or not receipt.image_path:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    path = UPLOADS_DIR / receipt.image_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    return FileResponse(path)


# ---------- Objetivos de ahorro ----------
@app.get("/api/goals", response_model=list[schemas.SavingsGoalOut])
def list_goals(db: Session = Depends(get_db)):
    return crud.list_goals(db)


@app.post("/api/goals", response_model=schemas.SavingsGoalOut)
def create_goal(data: schemas.SavingsGoalCreate, db: Session = Depends(get_db)):
    return crud.create_goal(db, data)


@app.post("/api/goals/{goal_id}/contribute", response_model=schemas.SavingsGoalOut)
def contribute(
    goal_id: int, data: schemas.SavingsGoalContribution, db: Session = Depends(get_db)
):
    goal = crud.contribute_to_goal(db, goal_id, data.amount)
    if not goal:
        raise HTTPException(status_code=404, detail="Objetivo no encontrado")
    return goal


# ---------- Resumen ----------
@app.get("/api/summary", response_model=schemas.Summary)
def summary(db: Session = Depends(get_db)):
    return crud.build_summary(db, currency=DEFAULT_CURRENCY)


# ---------- Interfaz web (frontend estático) ----------
# Debe montarse al final para no eclipsar las rutas /api.
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------- Tipos ----------
interface Config { default_currency: string; categories: string[]; scanner_enabled: boolean; }
interface Tx { id: number; type: string; amount: number; currency: string; category: string; merchant: string | null; note: string | null; occurred_on: string; source: string; receipt_id: number | null; }
interface CatTotal { category: string; total: number; }
interface Summary { currency: string; total_expenses: number; total_income: number; total_savings: number; balance: number; by_category: CatTotal[]; transactions_count: number; }
interface Goal { id: number; name: string; target_amount: number; current_amount: number; currency: string; }
interface RItem { id?: number; name: string; quantity: number; unit_price: number | null; total_price: number; }
interface Receipt { id: number; merchant: string | null; address: string | null; purchase_date: string | null; total: number; currency: string; category: string; has_image: boolean; items: RItem[]; }

type TxType = "expense" | "income" | "saving";

// ---------- Utilidades ----------
function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

// Comprime la foto en el navegador antes de subirla (límite de Vercel + ahorro).
function compressImage(file: File, maxSize = 1600, quality = 0.8): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) return resolve(file);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const scale = maxSize / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob && blob.size < file.size ? blob : file),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export default function Home() {
  const [config, setConfig] = useState<Config>({ default_currency: "EUR", categories: [], scanner_enabled: false });
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [txType, setTxType] = useState<TxType>("expense");
  const [scanStatus, setScanStatus] = useState<{ kind: string; node: React.ReactNode } | null>(null);
  const [modalReceipt, setModalReceipt] = useState<Receipt | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const merchantRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const api = useCallback(async (path: string, options?: RequestInit) => {
    const res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      let detail = "Error en la solicitud";
      try { detail = (await res.json()).detail || detail; } catch {}
      throw new Error(detail);
    }
    return res.status === 204 ? null : res.json();
  }, []);

  const refreshAll = useCallback(async () => {
    const [s, t, g] = await Promise.all([
      api("/summary"),
      api("/transactions?limit=50"),
      api("/goals"),
    ]);
    setSummary(s);
    setTxs(t);
    setGoals(g);
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const c = await api("/config");
        setConfig(c);
      } catch {}
      try { await refreshAll(); } catch (e) { showToast((e as Error).message); }
    })();
  }, [api, refreshAll, showToast]);

  // ---------- Movimiento manual ----------
  async function submitTx(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(amountRef.current?.value || "");
    if (!amount || amount <= 0) return showToast("Introduce un importe válido");
    const payload = {
      type: txType,
      amount,
      currency: config.default_currency,
      category: txType === "saving" ? "Ahorro" : categoryRef.current?.value,
      merchant: merchantRef.current?.value || null,
      note: noteRef.current?.value || null,
      occurred_on: dateRef.current?.value || null,
    };
    try {
      await api("/transactions", { method: "POST", body: JSON.stringify(payload) });
      if (amountRef.current) amountRef.current.value = "";
      if (merchantRef.current) merchantRef.current.value = "";
      if (noteRef.current) noteRef.current.value = "";
      showToast("Movimiento guardado ✔");
      await refreshAll();
    } catch (e) { showToast((e as Error).message); }
  }

  async function deleteTx(id: number) {
    if (!confirm("¿Eliminar este movimiento?")) return;
    try {
      await api(`/transactions/${id}`, { method: "DELETE" });
      showToast("Eliminado");
      await refreshAll();
    } catch (e) { showToast((e as Error).message); }
  }

  // ---------- Escaneo ----------
  async function onScan(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    if (!original) return;
    setScanStatus({ kind: "loading", node: "🔍 Analizando el recibo… esto puede tardar unos segundos." });

    const file = await compressImage(original);
    const formData = new FormData();
    formData.append("file", file, "receipt.jpg");

    try {
      const res = await fetch("/api/receipts/scan", { method: "POST", body: formData });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))).detail || "No se pudo escanear el recibo";
        throw new Error(detail);
      }
      const receipt: Receipt = await res.json();
      setScanStatus({
        kind: "success",
        node: (
          <>
            ✅ Guardado: <strong>{receipt.merchant || "Recibo"}</strong> ·{" "}
            {fmt(receipt.total, receipt.currency)} · {receipt.items.length} artículo(s).{" "}
            <button className="tx-receipt-link" onClick={() => openReceipt(receipt.id)}>Ver detalle</button>
          </>
        ),
      });
      await refreshAll();
    } catch (err) {
      setScanStatus({ kind: "error", node: "❌ " + (err as Error).message });
    } finally {
      e.target.value = "";
    }
  }

  async function openReceipt(id: number) {
    try {
      const r = await api(`/receipts/${id}`);
      setModalReceipt(r);
    } catch (e) { showToast((e as Error).message); }
  }

  // ---------- Objetivos ----------
  async function addGoal() {
    const name = prompt("Nombre del objetivo (ej. Vacaciones):");
    if (!name) return;
    const target = parseFloat(prompt("Importe a alcanzar:") || "");
    if (!target || target <= 0) return showToast("Importe no válido");
    try {
      await api("/goals", { method: "POST", body: JSON.stringify({ name, target_amount: target, currency: config.default_currency }) });
      showToast("Objetivo creado 🎯");
      await refreshAll();
    } catch (e) { showToast((e as Error).message); }
  }

  async function contribute(id: number) {
    const amount = parseFloat(prompt("¿Cuánto quieres aportar?") || "");
    if (!amount || amount <= 0) return showToast("Importe no válido");
    try {
      await api(`/goals/${id}/contribute`, { method: "POST", body: JSON.stringify({ amount }) });
      showToast("¡Ahorro registrado! 🎉");
      await refreshAll();
    } catch (e) { showToast((e as Error).message); }
  }

  const cur = config.default_currency;
  const icons: Record<string, string> = { expense: "🔻", income: "🔺", saving: "🏦" };
  const signs: Record<string, string> = { expense: "-", income: "+", saving: "" };
  const maxCat = summary && summary.by_category.length ? Math.max(...summary.by_category.map((c) => c.total)) : 0;

  return (
    <>
      <header className="app-header">
        <h1>💰 Recibosapp</h1>
        <p className="subtitle">Tu asistente económico personal</p>
      </header>

      <main>
        {/* KPIs */}
        <section className="summary-cards">
          <div className="card kpi"><span className="kpi-label">Gastos</span><span className="kpi-value expense">{summary ? fmt(summary.total_expenses, cur) : "—"}</span></div>
          <div className="card kpi"><span className="kpi-label">Ingresos</span><span className="kpi-value income">{summary ? fmt(summary.total_income, cur) : "—"}</span></div>
          <div className="card kpi"><span className="kpi-label">Ahorro</span><span className="kpi-value saving">{summary ? fmt(summary.total_savings, cur) : "—"}</span></div>
          <div className="card kpi"><span className="kpi-label">Balance</span><span className={"kpi-value " + (summary && summary.balance >= 0 ? "income" : "expense")}>{summary ? fmt(summary.balance, cur) : "—"}</span></div>
        </section>

        {/* Escanear */}
        <section className="card">
          <h2>📸 Escanear recibo</h2>
          <p className="muted">Haz una foto de tu ticket y se registrará automáticamente.</p>
          {!config.scanner_enabled && (
            <div className="banner warning">
              ⚠️ El escaneo automático está desactivado. Añade tu <code>GEMINI_API_KEY</code> en las variables de entorno para activarlo. Mientras tanto, puedes añadir gastos manualmente.
            </div>
          )}
          <label className="btn btn-primary btn-block file-label">
            Tomar / subir foto
            <input type="file" accept="image/*" capture="environment" onChange={onScan} />
          </label>
          {scanStatus && <div className={"scan-status " + scanStatus.kind}>{scanStatus.node}</div>}
        </section>

        {/* Añadir movimiento */}
        <section className="card">
          <h2>➕ Añadir movimiento</h2>
          <form onSubmit={submitTx}>
            <div className="segmented">
              {(["expense", "income", "saving"] as TxType[]).map((t) => (
                <button type="button" key={t} className={"seg" + (txType === t ? " active" : "")} onClick={() => setTxType(t)}>
                  {t === "expense" ? "Gasto" : t === "income" ? "Ingreso" : "Ahorro"}
                </button>
              ))}
            </div>
            <div className="form-row">
              <input ref={amountRef} type="number" step="0.01" min="0" placeholder="Importe" required />
              <select ref={categoryRef} defaultValue="Otros">
                {config.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-row">
              <input ref={merchantRef} type="text" placeholder="Comercio / concepto" />
              <input ref={dateRef} type="date" defaultValue={today} />
            </div>
            <input ref={noteRef} type="text" placeholder="Nota (opcional)" />
            <button type="submit" className="btn btn-primary btn-block">Guardar</button>
          </form>
        </section>

        {/* Por categoría */}
        <section className="card">
          <h2>📊 En qué gastas</h2>
          <div className="bars">
            {summary && summary.by_category.length ? summary.by_category.map((c) => (
              <div className="bar-row" key={c.category}>
                <div className="bar-head"><span>{c.category}</span><span>{fmt(c.total, cur)}</span></div>
                <div className="bar-track"><div className="bar-fill" style={{ width: (maxCat > 0 ? (c.total / maxCat) * 100 : 0) + "%" }} /></div>
              </div>
            )) : <p className="empty">Aún no hay gastos registrados.</p>}
          </div>
        </section>

        {/* Objetivos */}
        <section className="card">
          <div className="card-head"><h2>🏦 Objetivos de ahorro</h2><button className="btn btn-small" onClick={addGoal}>Nuevo</button></div>
          {goals.length ? goals.map((g) => {
            const pct = g.target_amount > 0 ? Math.min((g.current_amount / g.target_amount) * 100, 100) : 0;
            return (
              <div className="goal" key={g.id}>
                <div className="goal-head"><span className="goal-name">{g.name}</span><button className="btn btn-small" onClick={() => contribute(g.id)}>+ Aportar</button></div>
                <div className="goal-progress"><div className="goal-progress-fill" style={{ width: pct + "%" }} /></div>
                <div className="goal-amounts">{fmt(g.current_amount, g.currency)} de {fmt(g.target_amount, g.currency)} ({pct.toFixed(0)}%)</div>
              </div>
            );
          }) : <p className="empty">Crea un objetivo para empezar a ahorrar.</p>}
        </section>

        {/* Movimientos */}
        <section className="card">
          <h2>🧾 Movimientos recientes</h2>
          <div className="tx-list">
            {txs.length ? txs.map((t) => (
              <div className="tx-item" key={t.id}>
                <div className="tx-info">
                  <span className="tx-title">{icons[t.type]} {t.merchant || t.category}</span>
                  <span className="tx-meta">{t.category} · {t.occurred_on}{t.source === "receipt" ? " · escaneado" : ""}</span>
                </div>
                <div className="tx-right">
                  {t.receipt_id && <button className="tx-receipt-link" title="Ver recibo" onClick={() => openReceipt(t.receipt_id!)}>🧾</button>}
                  <span className={"tx-amount " + t.type}>{signs[t.type]}{fmt(t.amount, t.currency)}</span>
                  <button className="tx-delete" title="Eliminar" onClick={() => deleteTx(t.id)}>🗑</button>
                </div>
              </div>
            )) : <p className="empty">Todavía no hay movimientos. ¡Escanea un recibo o añade uno!</p>}
          </div>
        </section>
      </main>

      {/* Modal recibo */}
      {modalReceipt && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setModalReceipt(null); }}>
          <div className="modal-content">
            <button className="modal-close" onClick={() => setModalReceipt(null)}>✕</button>
            <h2>🧾 {modalReceipt.merchant || "Recibo"}</h2>
            <p className="muted">
              {modalReceipt.address ? modalReceipt.address + " · " : ""}{modalReceipt.purchase_date || ""} · {modalReceipt.category}
            </p>
            <div className="receipt-items">
              {modalReceipt.items.length ? modalReceipt.items.map((it, i) => (
                <div className="receipt-item-row" key={i}>
                  <span>{it.quantity > 1 ? it.quantity + "× " : ""}{it.name}</span>
                  <span>{fmt(it.total_price, modalReceipt.currency)}</span>
                </div>
              )) : <p className="empty">No se detectaron artículos individuales.</p>}
            </div>
            <div className="receipt-total"><span>Total</span><span>{fmt(modalReceipt.total, modalReceipt.currency)}</span></div>
            {modalReceipt.has_image && <img className="receipt-img" src={`/api/receipts/${modalReceipt.id}/image`} alt="Recibo" />}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

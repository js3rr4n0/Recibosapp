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

// Formato compacto para los KPIs: símbolo corto y sin decimales, para que
// los importes grandes quepan en las tarjetas.
function fmtCompact(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
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

// Lanza una lluvia de confeti (celebración al escanear o ahorrar).
function burstConfetti() {
  if (typeof document === "undefined") return;
  const colors = ["#818cf8", "#c084fc", "#f472b6", "#34d399", "#38bdf8", "#fbbf24"];
  const container = document.createElement("div");
  container.className = "confetti-container";
  document.body.appendChild(container);
  for (let i = 0; i < 90; i++) {
    const p = document.createElement("i");
    p.className = "confetti-piece";
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.35 + "s";
    p.style.animationDuration = 1.9 + Math.random() * 1.1 + "s";
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(p);
  }
  setTimeout(() => container.remove(), 3200);
}

// Muestra un importe con animación de conteo ascendente.
function AnimatedMoney({ value, currency, className, compact }: { value: number; currency: string; className?: string; compact?: boolean }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) { setDisplay(to); return; }
    const start = performance.now();
    const dur = 800;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{compact ? fmtCompact(display, currency) : fmt(display, currency)}</span>;
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
      burstConfetti();
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
      burstConfetti();
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
      <div className="aurora" aria-hidden="true">
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
      </div>

      <header className="app-header reveal">
        <h1><span className="coin">💰</span> Recibosapp</h1>
        <p className="subtitle">Tu asistente económico personal</p>
      </header>

      <main>
        {/* KPIs */}
        <section className="summary-cards reveal" style={{ animationDelay: "0.05s" }}>
          <div className="card kpi k-exp"><span className="kpi-label">Gastos</span><span className="kpi-value expense">{summary ? <AnimatedMoney value={summary.total_expenses} currency={cur} compact /> : "—"}</span></div>
          <div className="card kpi k-inc"><span className="kpi-label">Ingresos</span><span className="kpi-value income">{summary ? <AnimatedMoney value={summary.total_income} currency={cur} compact /> : "—"}</span></div>
          <div className="card kpi k-sav"><span className="kpi-label">Ahorro</span><span className="kpi-value saving">{summary ? <AnimatedMoney value={summary.total_savings} currency={cur} compact /> : "—"}</span></div>
          <div className="card kpi k-bal"><span className="kpi-label">Balance</span><span className={"kpi-value " + (summary && summary.balance >= 0 ? "income" : "expense")}>{summary ? <AnimatedMoney value={summary.balance} currency={cur} compact /> : "—"}</span></div>
        </section>

        {/* Escanear */}
        <section className="card reveal" style={{ animationDelay: "0.12s" }}>
          <h2>📸 Escanear recibo</h2>
          <p className="muted">Haz una foto de tu ticket y se registrará automáticamente.</p>
          {!config.scanner_enabled && (
            <div className="banner warning">
              ⚠️ El escaneo automático está desactivado. Añade tu <code>GEMINI_API_KEY</code> en las variables de entorno para activarlo. Mientras tanto, puedes añadir gastos manualmente.
            </div>
          )}
          <label className="btn btn-primary btn-block file-label scan-btn">
            📷 Tomar / subir foto
            <input type="file" accept="image/*" capture="environment" onChange={onScan} />
          </label>
          {scanStatus && <div className={"scan-status " + scanStatus.kind}>{scanStatus.node}</div>}
        </section>

        {/* Añadir movimiento */}
        <section className="card reveal" style={{ animationDelay: "0.19s" }}>
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
        <section className="card reveal" style={{ animationDelay: "0.26s" }}>
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
        <section className="card reveal" style={{ animationDelay: "0.33s" }}>
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
        <section className="card reveal" style={{ animationDelay: "0.4s" }}>
          <h2>🧾 Movimientos recientes</h2>
          <div className="tx-list">
            {txs.length ? txs.map((t) => (
              <div className="tx-item" key={t.id}>
                <div className="tx-info">
                  <span className="tx-title">{icons[t.type]} {t.merchant || t.category}</span>
                  <span className="tx-meta">{t.category} · {(t.occurred_on || "").slice(0, 10)}{t.source === "receipt" ? " · escaneado" : ""}</span>
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
              {modalReceipt.address ? modalReceipt.address + " · " : ""}{(modalReceipt.purchase_date || "").slice(0, 10)} · {modalReceipt.category}
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

// ====== Estado global y utilidades ======
let CONFIG = { default_currency: "EUR", categories: [], scanner_enabled: false };
let selectedType = "expense";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function fmt(amount, currency = CONFIG.default_currency) {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2600);
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = "Error en la solicitud";
    try {
      detail = (await res.json()).detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

// ====== Carga inicial ======
async function init() {
  try {
    CONFIG = await api("/config");
  } catch (e) {
    console.error(e);
  }

  // Categorías en el selector.
  const catSelect = $("#tx-category");
  catSelect.innerHTML = CONFIG.categories
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");

  // Fecha de hoy por defecto.
  $("#tx-date").value = new Date().toISOString().slice(0, 10);

  // Escáner desactivado si no hay clave.
  if (!CONFIG.scanner_enabled) {
    $("#scanner-disabled").classList.remove("hidden");
  }

  bindEvents();
  await refreshAll();
}

function bindEvents() {
  // Selector de tipo (gasto/ingreso/ahorro).
  $$("#tx-type .seg").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$("#tx-type .seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedType = btn.dataset.type;
    });
  });

  // Formulario de movimiento.
  $("#tx-form").addEventListener("submit", onSubmitTransaction);

  // Escaneo de recibo.
  $("#receipt-input").addEventListener("change", onScanReceipt);

  // Objetivos de ahorro.
  $("#add-goal-btn").addEventListener("click", onAddGoal);

  // Modal.
  $("#modal-close").addEventListener("click", () => $("#receipt-modal").classList.add("hidden"));
  $("#receipt-modal").addEventListener("click", (e) => {
    if (e.target.id === "receipt-modal") $("#receipt-modal").classList.add("hidden");
  });
}

async function refreshAll() {
  await Promise.all([loadSummary(), loadTransactions(), loadGoals()]);
}

// ====== Resumen ======
async function loadSummary() {
  const s = await api("/summary");
  $("#kpi-expenses").textContent = fmt(s.total_expenses, s.currency);
  $("#kpi-income").textContent = fmt(s.total_income, s.currency);
  $("#kpi-savings").textContent = fmt(s.total_savings, s.currency);
  const bal = $("#kpi-balance");
  bal.textContent = fmt(s.balance, s.currency);
  bal.className = "kpi-value " + (s.balance >= 0 ? "income" : "expense");

  // Barras por categoría.
  const container = $("#by-category");
  if (!s.by_category.length) {
    container.innerHTML = `<p class="empty">Aún no hay gastos registrados.</p>`;
    return;
  }
  const max = Math.max(...s.by_category.map((c) => c.total));
  container.innerHTML = s.by_category
    .map((c) => {
      const pct = max > 0 ? (c.total / max) * 100 : 0;
      return `
      <div class="bar-row">
        <div class="bar-head"><span>${c.category}</span><span>${fmt(c.total, s.currency)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>`;
    })
    .join("");
}

// ====== Transacciones ======
async function loadTransactions() {
  const txs = await api("/transactions?limit=50");
  const list = $("#tx-list");
  if (!txs.length) {
    list.innerHTML = `<p class="empty">Todavía no hay movimientos. ¡Escanea un recibo o añade uno!</p>`;
    return;
  }
  const icons = { expense: "🔻", income: "🔺", saving: "🏦" };
  const signs = { expense: "-", income: "+", saving: "" };
  list.innerHTML = txs
    .map((t) => {
      const receiptLink = t.receipt_id
        ? `<span class="tx-receipt-link" data-receipt="${t.receipt_id}" title="Ver recibo">🧾</span>`
        : "";
      return `
      <div class="tx-item">
        <div class="tx-info">
          <span class="tx-title">${icons[t.type] || ""} ${escapeHtml(t.merchant || t.category)}</span>
          <span class="tx-meta">${t.category} · ${t.occurred_on}${t.source === "receipt" ? " · escaneado" : ""}</span>
        </div>
        <div class="tx-right">
          ${receiptLink}
          <span class="tx-amount ${t.type}">${signs[t.type]}${fmt(t.amount, t.currency)}</span>
          <button class="tx-delete" data-id="${t.id}" title="Eliminar">🗑</button>
        </div>
      </div>`;
    })
    .join("");

  // Enlaces a recibos y botones de borrado.
  list.querySelectorAll(".tx-receipt-link").forEach((el) =>
    el.addEventListener("click", () => openReceipt(el.dataset.receipt))
  );
  list.querySelectorAll(".tx-delete").forEach((el) =>
    el.addEventListener("click", () => deleteTransaction(el.dataset.id))
  );
}

async function onSubmitTransaction(e) {
  e.preventDefault();
  const amount = parseFloat($("#tx-amount").value);
  if (!amount || amount <= 0) return toast("Introduce un importe válido");

  const payload = {
    type: selectedType,
    amount,
    currency: CONFIG.default_currency,
    category: selectedType === "saving" ? "Ahorro" : $("#tx-category").value,
    merchant: $("#tx-merchant").value || null,
    note: $("#tx-note").value || null,
    occurred_on: $("#tx-date").value || null,
  };

  try {
    await api("/transactions", { method: "POST", body: JSON.stringify(payload) });
    e.target.reset();
    $("#tx-date").value = new Date().toISOString().slice(0, 10);
    toast("Movimiento guardado ✔");
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
}

async function deleteTransaction(id) {
  if (!confirm("¿Eliminar este movimiento?")) return;
  try {
    await api(`/transactions/${id}`, { method: "DELETE" });
    toast("Eliminado");
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
}

// ====== Escaneo de recibos ======
// Reduce el tamaño de la foto en el navegador antes de subirla. Así evitamos
// el límite de ~4.5 MB de las funciones serverless de Vercel y ahorramos datos.
function compressImage(file, maxSize = 1600, quality = 0.8) {
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
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob && blob.size < file.size ? blob : file),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // Si algo falla, subimos el original.
    };
    img.src = url;
  });
}

async function onScanReceipt(e) {
  const original = e.target.files[0];
  if (!original) return;

  const status = $("#scan-status");
  status.className = "scan-status loading";
  status.classList.remove("hidden");
  status.textContent = "🔍 Analizando el recibo… esto puede tardar unos segundos.";

  const file = await compressImage(original);
  const formData = new FormData();
  formData.append("file", file, "receipt.jpg");

  try {
    const res = await fetch("/api/receipts/scan", { method: "POST", body: formData });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))).detail || "No se pudo escanear el recibo";
      throw new Error(detail);
    }
    const receipt = await res.json();
    status.className = "scan-status success";
    status.innerHTML = `✅ Guardado: <strong>${escapeHtml(receipt.merchant || "Recibo")}</strong> ·
      ${fmt(receipt.total, receipt.currency)} · ${receipt.items.length} artículo(s).
      <span class="tx-receipt-link" id="view-scanned">Ver detalle</span>`;
    $("#view-scanned")?.addEventListener("click", () => openReceipt(receipt.id));
    await refreshAll();
  } catch (err) {
    status.className = "scan-status error";
    status.textContent = "❌ " + err.message;
  } finally {
    e.target.value = ""; // Permite volver a subir la misma foto.
  }
}

async function openReceipt(id) {
  try {
    const r = await api(`/receipts/${id}`);
    const itemsHtml = r.items.length
      ? r.items
          .map(
            (it) => `
        <div class="receipt-item-row">
          <span>${it.quantity > 1 ? it.quantity + "× " : ""}${escapeHtml(it.name)}</span>
          <span>${fmt(it.total_price, r.currency)}</span>
        </div>`
          )
          .join("")
      : `<p class="empty">No se detectaron artículos individuales.</p>`;

    $("#receipt-detail").innerHTML = `
      <h2>🧾 ${escapeHtml(r.merchant || "Recibo")}</h2>
      <p class="muted">
        ${r.address ? escapeHtml(r.address) + " · " : ""}${r.purchase_date || ""} · ${r.category}
      </p>
      <div class="receipt-items">${itemsHtml}</div>
      <div class="receipt-total"><span>Total</span><span>${fmt(r.total, r.currency)}</span></div>
      ${r.has_image ? `<img class="receipt-img" src="/api/receipts/${r.id}/image" alt="Recibo" />` : ""}
    `;
    $("#receipt-modal").classList.remove("hidden");
  } catch (err) {
    toast(err.message);
  }
}

// ====== Objetivos de ahorro ======
async function loadGoals() {
  const goals = await api("/goals");
  const container = $("#goals-list");
  if (!goals.length) {
    container.innerHTML = `<p class="empty">Crea un objetivo para empezar a ahorrar.</p>`;
    return;
  }
  container.innerHTML = goals
    .map((g) => {
      const pct = g.target_amount > 0 ? Math.min((g.current_amount / g.target_amount) * 100, 100) : 0;
      return `
      <div class="goal">
        <div class="goal-head">
          <span class="goal-name">${escapeHtml(g.name)}</span>
          <button class="btn btn-small" data-goal="${g.id}">+ Aportar</button>
        </div>
        <div class="goal-progress"><div class="goal-progress-fill" style="width:${pct}%"></div></div>
        <div class="goal-amounts">${fmt(g.current_amount, g.currency)} de ${fmt(g.target_amount, g.currency)} (${pct.toFixed(0)}%)</div>
      </div>`;
    })
    .join("");

  container.querySelectorAll("[data-goal]").forEach((btn) =>
    btn.addEventListener("click", () => contributeGoal(btn.dataset.goal))
  );
}

async function onAddGoal() {
  const name = prompt("Nombre del objetivo (ej. Vacaciones):");
  if (!name) return;
  const target = parseFloat(prompt("Importe a alcanzar:"));
  if (!target || target <= 0) return toast("Importe no válido");
  try {
    await api("/goals", {
      method: "POST",
      body: JSON.stringify({ name, target_amount: target, currency: CONFIG.default_currency }),
    });
    toast("Objetivo creado 🎯");
    await loadGoals();
  } catch (err) {
    toast(err.message);
  }
}

async function contributeGoal(id) {
  const amount = parseFloat(prompt("¿Cuánto quieres aportar?"));
  if (!amount || amount <= 0) return toast("Importe no válido");
  try {
    await api(`/goals/${id}/contribute`, { method: "POST", body: JSON.stringify({ amount }) });
    toast("¡Ahorro registrado! 🎉");
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
}

// ====== Utilidad ======
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

init();

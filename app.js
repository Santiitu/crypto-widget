// ═══════════════════════════════════════════════
// MAPA DE SÍMBOLOS
// ═══════════════════════════════════════════════
const SYMBOL_MAP = {
  "bitcoin":   { binance: "BTCUSDT",  label: "BTC" },
  "ethereum":  { binance: "ETHUSDT",  label: "ETH" },
  "cardano":   { binance: "ADAUSDT",  label: "ADA" },
  "pax-gold":  { binance: "PAXGUSDT", label: "PAXG" }
};

const COINS = ["bitcoin", "ethereum", "cardano", "pax-gold"];

// ═══════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════
function fmt(n, decimals = 2) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
    + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// ═══════════════════════════════════════════════
// SECCIÓN 1: PRECIOS EN VIVO
// ═══════════════════════════════════════════════
async function loadPrices() {
  try {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,cardano,pax-gold&vs_currencies=usd&include_24hr_change=true";
    const r = await fetch(url);
    const d = await r.json();

    const container = document.getElementById("priceCards");
    container.innerHTML = COINS.map(coin => {
      const data = d[coin];
      const label = SYMBOL_MAP[coin].label;
      const price = data.usd;
      const change = data.usd_24h_change;
      const isUp = change >= 0;
      const changeClass = isUp ? "up" : "down";
      const arrow = isUp ? "▲" : "▼";
      return `
        <div class="price-card ${changeClass}">
          <div class="price-label">${label}</div>
          <div class="price-value">$${fmt(price)}</div>
          <div class="price-change ${changeClass}">${arrow} ${fmt(Math.abs(change))}% (24h)</div>
        </div>
      `;
    }).join("");
  } catch (e) {
    document.getElementById("priceCards").innerHTML = `<p class="error-msg">Error al cargar precios. Reintentando...</p>`;
  }
}

loadPrices();
setInterval(loadPrices, 20000);

// ═══════════════════════════════════════════════
// SECCIÓN 2: HISTORIAL 4hs / 5 días
// ═══════════════════════════════════════════════
async function loadHistory() {
  const coin = document.getElementById("histCryptoSelect").value;
  const label = SYMBOL_MAP[coin].label;
  const container = document.getElementById("historyTable");
  container.innerHTML = `<p class="loading-msg">Cargando historial de ${label}...</p>`;

  try {
    // days=5 con interval=hourly da puntos cada hora; filtramos cada 4hs
    const url = `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=5&interval=hourly`;
    const r = await fetch(url);
    const d = await r.json();

    // Filtrar 1 punto cada 4 horas (índice 0, 4, 8, ...)
    const allPrices = d.prices; // [[timestamp, price], ...]
    const filtered = allPrices.filter((_, i) => i % 4 === 0).reverse(); // más reciente primero

    // Calcular variación entre periodos
    let rows = filtered.map((item, i) => {
      const ts = item[0];
      const price = item[1];
      let varPct = null;
      if (i < filtered.length - 1) {
        const prev = filtered[i + 1][1];
        varPct = ((price - prev) / prev) * 100;
      }
      return { ts, price, varPct };
    });

    const tableHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha / Hora</th>
            <th>Precio (USD)</th>
            <th>Variación</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => {
            const varDisplay = row.varPct !== null
              ? `<span class="${row.varPct >= 0 ? 'up' : 'down'}">${row.varPct >= 0 ? "▲" : "▼"} ${fmt(Math.abs(row.varPct))}%</span>`
              : `<span class="muted">—</span>`;
            return `
              <tr>
                <td>${fmtDate(row.ts)}</td>
                <td class="mono">$${fmt(row.price)}</td>
                <td>${varDisplay}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
    container.innerHTML = tableHTML;
  } catch (e) {
    container.innerHTML = `<p class="error-msg">Error al cargar historial. Verificá tu conexión.</p>`;
  }
}

// Cargar historial de BTC al inicio
loadHistory();

// ═══════════════════════════════════════════════
// SECCIÓN 3: GRÁFICO TRADINGVIEW
// ═══════════════════════════════════════════════
function showChart() {
  const coin = document.getElementById("chartCryptoSelect").value;
  const symbol = SYMBOL_MAP[coin].binance;
  const container = document.getElementById("chartContainer");
  container.style.display = "block";
  document.getElementById("chart").innerHTML = "";
  new TradingView.widget({
    width: "100%",
    height: 450,
    symbol: `BINANCE:${symbol}`,
    interval: "240",
    theme: "dark",
    style: "1",
    locale: "es",
    container_id: "chart",
    hide_top_toolbar: false,
    allow_symbol_change: true
  });
}

// ═══════════════════════════════════════════════
// SECCIÓN 4: SEÑALES CON VALORES
// ═══════════════════════════════════════════════
function calcEMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcTrend(values) {
  let sum = 0;
  for (let i = 1; i < values.length; i++) sum += values[i] - values[i - 1];
  return sum > 0 ? "Alcista" : "Bajista";
}

async function calculateSignal() {
  const coin = document.getElementById("signalCryptoSelect").value;
  const label = SYMBOL_MAP[coin].label;
  const fast = parseInt(document.getElementById("emaFast").value);
  const slow = parseInt(document.getElementById("emaSlow").value);
  const tpPct = parseFloat(document.getElementById("tpPercent").value) / 100;
  const slPct = parseFloat(document.getElementById("slPercent").value) / 100;

  const btn = document.querySelector("#signalResult ~ .btn-primary, .btn-primary[onclick='calculateSignal()']");
  document.querySelector("[onclick='calculateSignal()']").textContent = "Calculando...";

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=7`;
    const r = await fetch(url);
    const d = await r.json();
    const closes = d.prices.map(p => p[1]);
    const currentPrice = closes[closes.length - 1];

    const emaFastVal = calcEMA(closes, fast);
    const emaSlowVal = calcEMA(closes, slow);
    const trend = calcTrend(closes.slice(-10));

    let emaSignal = "Neutral";
    if (emaFastVal > emaSlowVal) emaSignal = "Compra";
    if (emaFastVal < emaSlowVal) emaSignal = "Venta";

    let finalSignal = "NEUTRAL";
    let signalClass = "neutral";
    let entryPrice = currentPrice;
    let takeProfit = null;
    let stopLoss = null;

    if (emaSignal === "Compra" && trend === "Alcista") {
      finalSignal = "COMPRA";
      signalClass = "buy";
      entryPrice = currentPrice;
      takeProfit = currentPrice * (1 + tpPct);
      stopLoss = currentPrice * (1 - slPct);
    } else if (emaSignal === "Venta" && trend === "Bajista") {
      finalSignal = "VENTA";
      signalClass = "sell";
      entryPrice = currentPrice;
      takeProfit = currentPrice * (1 - tpPct);
      stopLoss = currentPrice * (1 + slPct);
    } else {
      // Señal mixta: calcular igual con precio actual
      takeProfit = emaSignal === "Compra"
        ? currentPrice * (1 + tpPct)
        : currentPrice * (1 - tpPct);
      stopLoss = emaSignal === "Compra"
        ? currentPrice * (1 - slPct)
        : currentPrice * (1 + slPct);
    }

    // Calcular ratio riesgo/beneficio
    const rewardRisk = tpPct / slPct;

    document.getElementById("signalBadge").innerHTML = `
      <div class="badge ${signalClass}">
        <span class="badge-label">${label}</span>
        <span class="badge-signal">${finalSignal}</span>
        <span class="badge-detail">EMA: ${emaSignal} · Tendencia: ${trend}</span>
      </div>
    `;

    document.getElementById("signalValues").innerHTML = `
      <div class="signal-row">
        <div class="signal-item">
          <span class="si-label">Precio de Entrada</span>
          <span class="si-value entry">$${fmt(entryPrice)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">Take Profit (+${fmt(tpPct * 100, 1)}%)</span>
          <span class="si-value tp">$${fmt(takeProfit)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">Stop Loss (−${fmt(slPct * 100, 1)}%)</span>
          <span class="si-value sl">$${fmt(stopLoss)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">EMA Rápida (${fast})</span>
          <span class="si-value mono">$${fmt(emaFastVal)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">EMA Lenta (${slow})</span>
          <span class="si-value mono">$${fmt(emaSlowVal)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">Ratio R/B</span>
          <span class="si-value ${rewardRisk >= 1.5 ? 'tp' : 'sl'}">${fmt(rewardRisk, 2)}x</span>
        </div>
      </div>
      <button class="btn-secondary full-width" onclick="prefillGrid(${fmt(entryPrice, 8).replace(/\./g, '.').replace(/,/g, '')})">
        → Usar este precio en Grid Bot
      </button>
    `;

    document.getElementById("signalResult").style.display = "block";

  } catch (e) {
    document.getElementById("signalBadge").innerHTML = `<p class="error-msg">Error al calcular señal.</p>`;
    document.getElementById("signalResult").style.display = "block";
  }

  document.querySelector("[onclick='calculateSignal()']").textContent = "▶ Calcular Señal";
}

// Prefill del precio en Grid Bot desde señal
function prefillGrid(price) {
  // Limpiar el precio (puede tener puntos de miles)
  const cleanPrice = String(price).replace(/\./g, "").replace(",", ".");
  document.getElementById("gridCurrentPrice").value = parseFloat(cleanPrice) || price;
  document.getElementById("gridResult").style.display = "none";
  document.querySelector(".section:last-of-type").scrollIntoView({ behavior: "smooth" });
}

// ═══════════════════════════════════════════════
// SECCIÓN 5: GRID BOT
// ═══════════════════════════════════════════════
function generateGrid() {
  const currentPrice = parseFloat(document.getElementById("gridCurrentPrice").value);
  const totalAmount  = parseFloat(document.getElementById("gridTotalAmount").value);
  const levels       = parseInt(document.getElementById("gridLevels").value);
  const stepPct      = parseFloat(document.getElementById("gridStep").value) / 100;
  const direction    = document.getElementById("gridDirection").value;

  if (!currentPrice || !totalAmount || !levels || !stepPct) {
    alert("Completá todos los campos del Grid Bot.");
    return;
  }

  const amountPerLevel = totalAmount / levels;
  let rows = [];
  let totalCoins = 0;
  let totalSpent = 0;

  for (let i = 0; i < levels; i++) {
    let price;
    if (direction === "buy") {
      // Compra: cada nivel es más barato
      price = currentPrice * Math.pow(1 - stepPct, i);
    } else {
      // Venta: cada nivel es más caro
      price = currentPrice * Math.pow(1 + stepPct, i);
    }

    const coins = amountPerLevel / price;
    totalCoins += coins;
    totalSpent += amountPerLevel;

    rows.push({
      level: i + 1,
      price,
      amount: amountPerLevel,
      coins,
      cumCoins: totalCoins,
      cumSpent: totalSpent,
      avgPrice: totalSpent / totalCoins
    });
  }

  const avgEntry = totalSpent / totalCoins;
  const improvement = direction === "buy"
    ? ((currentPrice - avgEntry) / currentPrice) * 100
    : ((avgEntry - currentPrice) / currentPrice) * 100;

  // Resumen
  document.getElementById("gridSummary").innerHTML = `
    <div class="summary-grid">
      <div class="summary-item">
        <span class="si-label">Inversión Total</span>
        <span class="si-value">$${fmt(totalSpent)}</span>
      </div>
      <div class="summary-item">
        <span class="si-label">Precio Promedio Final</span>
        <span class="si-value entry">$${fmt(avgEntry)}</span>
      </div>
      <div class="summary-item">
        <span class="si-label">Total Crypto Acumulada</span>
        <span class="si-value mono">${fmt(totalCoins, 6)}</span>
      </div>
      <div class="summary-item">
        <span class="si-label">Mejora de Precio</span>
        <span class="si-value tp">+${fmt(improvement)}%</span>
      </div>
    </div>
  `;

  // Tabla de niveles
  document.getElementById("gridTable").innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Precio Nivel (USD)</th>
          <th>Monto (USD)</th>
          <th>Crypto a comprar</th>
          <th>Acumulado (USD)</th>
          <th>Precio Prom. Acum.</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td class="center muted">Nv. ${row.level}</td>
            <td class="mono">$${fmt(row.price)}</td>
            <td class="mono">$${fmt(row.amount)}</td>
            <td class="mono">${fmt(row.coins, 6)}</td>
            <td class="mono">$${fmt(row.cumSpent)}</td>
            <td class="mono entry">$${fmt(row.avgPrice)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <p class="table-note">* Cada fila es editable: modificá los montos según tu estrategia.</p>
  `;

  // Hacer celdas de precio y monto editables
  setTimeout(() => {
    document.querySelectorAll("#gridTable tbody tr").forEach((tr, i) => {
      const cells = tr.querySelectorAll("td");
      // Precio nivel (col 1) y monto (col 2) son editables
      [1, 2].forEach(colIdx => {
        cells[colIdx].contentEditable = "true";
        cells[colIdx].classList.add("editable");
        cells[colIdx].addEventListener("blur", () => recalcGridRow(tr, i, rows));
      });
    });
  }, 100);

  document.getElementById("gridResult").style.display = "block";
}

// Recalcular fila al editar
function recalcGridRow(tr, rowIndex, rows) {
  const cells = tr.querySelectorAll("td");
  const rawPrice  = cells[1].textContent.replace(/[^0-9.,]/g, "").replace(",", ".");
  const rawAmount = cells[2].textContent.replace(/[^0-9.,]/g, "").replace(",", ".");
  const price  = parseFloat(rawPrice);
  const amount = parseFloat(rawAmount);
  if (!price || !amount) return;
  const coins = amount / price;
  cells[3].textContent = fmt(coins, 6);
  // Actualizar dato en array
  rows[rowIndex].price  = price;
  rows[rowIndex].amount = amount;
  rows[rowIndex].coins  = coins;
}

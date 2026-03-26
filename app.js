// ═══════════════════════════════════════════════
// MAPA DE SÍMBOLOS
// ═══════════════════════════════════════════════
const SYMBOL_MAP = {
  "bitcoin":  { binance: "BTCUSDT",  label: "BTC",  name: "Bitcoin" },
  "ethereum": { binance: "ETHUSDT",  label: "ETH",  name: "Ethereum" },
  "cardano":  { binance: "ADAUSDT",  label: "ADA",  name: "Cardano" },
  "pax-gold": { binance: "PAXGUSDT", label: "PAXG", name: "PAX Gold" }
};
const COINS = ["bitcoin", "ethereum", "cardano", "pax-gold"];

// ═══════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════
function fmt(n, dec = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
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
    document.getElementById("priceCards").innerHTML = COINS.map(coin => {
      const data = d[coin];
      const label = SYMBOL_MAP[coin].label;
      const isUp = data.usd_24h_change >= 0;
      return `
        <div class="price-card ${isUp ? "up" : "down"}">
          <div class="price-label">${label}</div>
          <div class="price-value">$${fmt(data.usd)}</div>
          <div class="price-change ${isUp ? "up" : "down"}">
            ${isUp ? "▲" : "▼"} ${fmt(Math.abs(data.usd_24h_change))}%
          </div>
        </div>`;
    }).join("");
  } catch {
    document.getElementById("priceCards").innerHTML =
      `<p class="error-msg">Error al cargar precios.</p>`;
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
  container.innerHTML = `<p class="loading-msg">Cargando ${label}...</p>`;
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=5&interval=hourly`;
    const r = await fetch(url);
    const d = await r.json();
    const filtered = d.prices.filter((_, i) => i % 4 === 0).reverse();
    const rows = filtered.map((item, i) => ({
      ts: item[0],
      price: item[1],
      varPct: i < filtered.length - 1
        ? ((item[1] - filtered[i + 1][1]) / filtered[i + 1][1]) * 100
        : null
    }));
    container.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Fecha / Hora</th><th>Precio (USD)</th><th>Variación</th></tr></thead>
        <tbody>${rows.map(row => `
          <tr>
            <td>${fmtDate(row.ts)}</td>
            <td class="mono">$${fmt(row.price)}</td>
            <td>${row.varPct !== null
              ? `<span class="${row.varPct >= 0 ? "up" : "down"}">${row.varPct >= 0 ? "▲" : "▼"} ${fmt(Math.abs(row.varPct))}%</span>`
              : `<span class="muted">—</span>`}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
  } catch {
    container.innerHTML = `<p class="error-msg">Error al cargar historial.</p>`;
  }
}
loadHistory();

// ═══════════════════════════════════════════════
// SECCIÓN 3: GRÁFICO TRADINGVIEW
// ═══════════════════════════════════════════════
function showChart() {
  const coin = document.getElementById("chartCryptoSelect").value;
  const symbol = SYMBOL_MAP[coin].binance;
  document.getElementById("chartContainer").style.display = "block";
  document.getElementById("chart").innerHTML = "";
  new TradingView.widget({
    width: "100%", height: 450,
    symbol: `BINANCE:${symbol}`,
    interval: "240", theme: "dark",
    style: "1", locale: "es",
    container_id: "chart"
  });
}

// ═══════════════════════════════════════════════
// SECCIÓN 4: ANÁLISIS DE MERCADO / SEÑAL
// ═══════════════════════════════════════════════
function calcEMA(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

function calcVolatility(values) {
  const returns = [];
  for (let i = 1; i < values.length; i++)
    returns.push((values[i] - values[i - 1]) / values[i - 1]);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * 100;
}

function calcRangeStats(values) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = ((max - min) / min) * 100;
  return { max, min, range };
}

async function calculateSignal() {
  const coin = document.getElementById("signalCryptoSelect").value;
  const label = SYMBOL_MAP[coin].label;
  const fast = parseInt(document.getElementById("emaFast").value);
  const slow = parseInt(document.getElementById("emaSlow").value);
  const btn = document.querySelector("[onclick='calculateSignal()']");
  btn.textContent = "Calculando...";

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=7`;
    const r = await fetch(url);
    const d = await r.json();
    const closes = d.prices.map(p => p[1]);
    const currentPrice = closes[closes.length - 1];

    const emaFastVal = calcEMA(closes, fast);
    const emaSlowVal = calcEMA(closes, slow);
    const volatility = calcVolatility(closes.slice(-30));
    const stats7d = calcRangeStats(closes);

    // Tendencia
    const emaSlope = emaFastVal > emaSlowVal ? "alcista" : "bajista";
    const priceDelta7d = ((currentPrice - closes[0]) / closes[0]) * 100;

    // Evaluación para grid
    let gridSuitability, suitClass, suitIcon;
    const absDelta = Math.abs(priceDelta7d);
    if (absDelta < 8 && volatility < 2.5) {
      gridSuitability = "IDEAL para Grid";
      suitClass = "ideal";
      suitIcon = "✅";
    } else if (absDelta < 20) {
      gridSuitability = "ACEPTABLE con precaución";
      suitClass = "caution";
      suitIcon = "⚠️";
    } else {
      gridSuitability = "RIESGOSO para Grid";
      suitClass = "risky";
      suitIcon = "❌";
    }

    // Sugerencia de rango para grid (soporte/resistencia estimados)
    const suggestedLower = stats7d.min * 0.98;
    const suggestedUpper = stats7d.max * 1.02;
    const suggestedRange = ((suggestedUpper - suggestedLower) / suggestedLower) * 100;
    const suggestedLevels = Math.max(5, Math.min(20, Math.round(suggestedRange / 1)));

    document.getElementById("signalResult").innerHTML = `
      <!-- Badge de aptitud -->
      <div class="suit-badge ${suitClass}">
        <span class="suit-icon">${suitIcon}</span>
        <div>
          <div class="suit-label">${label} — ${gridSuitability}</div>
          <div class="suit-detail">Variación 7d: ${priceDelta7d >= 0 ? "+" : ""}${fmt(priceDelta7d)}% · Volatilidad: ${fmt(volatility)}%</div>
        </div>
      </div>

      <!-- Métricas -->
      <div class="signal-row">
        <div class="signal-item">
          <span class="si-label">Precio Actual</span>
          <span class="si-value entry mono">$${fmt(currentPrice)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">EMA ${fast} (Rápida)</span>
          <span class="si-value mono">$${fmt(emaFastVal)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">EMA ${slow} (Lenta)</span>
          <span class="si-value mono">$${fmt(emaSlowVal)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">Tendencia EMA</span>
          <span class="si-value ${emaSlope === "alcista" ? "up" : "down"}">${emaSlope === "alcista" ? "▲" : "▼"} ${emaSlope.toUpperCase()}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">Máx. 7 días</span>
          <span class="si-value mono">$${fmt(stats7d.max)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">Mín. 7 días</span>
          <span class="si-value mono">$${fmt(stats7d.min)}</span>
        </div>
      </div>

      <!-- Sugerencia de configuración grid -->
      <div class="suggest-box">
        <div class="suggest-title">📐 Configuración sugerida para Grid</div>
        <div class="suggest-grid">
          <div class="suggest-item">
            <span class="si-label">Límite Inferior estimado</span>
            <span class="si-value mono">$${fmt(suggestedLower)}</span>
          </div>
          <div class="suggest-item">
            <span class="si-label">Límite Superior estimado</span>
            <span class="si-value mono">$${fmt(suggestedUpper)}</span>
          </div>
          <div class="suggest-item">
            <span class="si-label">Rango total</span>
            <span class="si-value mono">${fmt(suggestedRange)}%</span>
          </div>
          <div class="suggest-item">
            <span class="si-label">Niveles recomendados</span>
            <span class="si-value mono">${suggestedLevels}</span>
          </div>
        </div>
        <button class="btn-secondary full-width" onclick="prefillGridFromSignal(${currentPrice}, ${suggestedLower}, ${suggestedUpper}, ${suggestedLevels})">
          → Usar estos valores en el Grid Bot
        </button>
      </div>
    `;
    document.getElementById("signalResult").style.display = "block";
  } catch (e) {
    document.getElementById("signalResult").innerHTML = `<p class="error-msg">Error al calcular señal.</p>`;
    document.getElementById("signalResult").style.display = "block";
  }
  btn.textContent = "▶ Analizar Mercado";
}

// Precarga automática de valores en el Grid Bot
function prefillGridFromSignal(price, lower, upper, levels) {
  document.getElementById("gridCurrentPrice").value = price.toFixed(2);
  document.getElementById("gridLower").value = lower.toFixed(2);
  document.getElementById("gridUpper").value = upper.toFixed(2);
  document.getElementById("gridLevels").value = levels;
  liveCalc();
  document.getElementById("gridSection").scrollIntoView({ behavior: "smooth" });
}

// ═══════════════════════════════════════════════
// SECCIÓN 5: GRID BOT — ADVERTENCIA MERCADO
// ═══════════════════════════════════════════════
function updateMarketWarning() {
  const condition = document.getElementById("marketCondition").value;
  const box = document.getElementById("marketWarning");
  const msgs = {
    "strong_up":   { cls: "warn-orange", text: "⚠️ PRECAUCIÓN: El precio en rally fuerte puede salir del rango rápido. Si abrís el grid, definí un TP del bot conservador." },
    "strong_down": { cls: "warn-red",    text: "❌ RIESGOSO: En caída pronunciada el capital queda atrapado en posiciones compradas. Esperá señales de estabilización antes de activar." },
    "lateral":     { cls: "warn-green",  text: "✅ CONDICIÓN IDEAL: El mercado lateral maximiza los ciclos compra→venta dentro del rango." },
    "soft_up":     { cls: "warn-green",  text: "✅ ACEPTABLE: Tendencia suave. El grid genera ciclos mientras sube gradualmente." },
    "soft_down":   { cls: "warn-green",  text: "✅ ACEPTABLE: Tendencia suave bajista. Funcionará si hay rebotes dentro del rango." }
  };
  if (msgs[condition]) {
    box.className = `step-warning ${msgs[condition].cls}`;
    box.textContent = msgs[condition].text;
    box.style.display = "block";
  } else {
    box.style.display = "none";
  }
}

// ═══════════════════════════════════════════════
// CÁLCULO EN VIVO (info boxes)
// ═══════════════════════════════════════════════
function liveCalc() {
  const lower    = parseFloat(document.getElementById("gridLower").value);
  const upper    = parseFloat(document.getElementById("gridUpper").value);
  const current  = parseFloat(document.getElementById("gridCurrentPrice").value);
  const levels   = parseInt(document.getElementById("gridLevels").value);
  const fee      = parseFloat(document.getElementById("gridFee").value);
  const capital  = parseFloat(document.getElementById("gridCapital").value);
  const portfolio= parseFloat(document.getElementById("portfolioTotal").value);
  const reserve  = parseFloat(document.getElementById("gridReserve").value) || 0;
  const slPct    = parseFloat(document.getElementById("botSL").value);
  const tpPct    = parseFloat(document.getElementById("botTP").value);

  // Paso B: Rango
  if (lower > 0 && upper > 0 && upper > lower) {
    const rangePct = ((upper - lower) / lower) * 100;
    const rangeBox = document.getElementById("rangeInfo");
    const posInRange = current > 0
      ? `Precio actual está al ${fmt(((current - lower) / (upper - lower)) * 100)}% del rango`
      : "";
    rangeBox.innerHTML = `
      <span class="info-item">Rango total: <strong>${fmt(rangePct)}%</strong></span>
      <span class="info-item">Amplitud: <strong>$${fmt(upper - lower)}</strong></span>
      ${posInRange ? `<span class="info-item">${posInRange}</span>` : ""}
    `;
    rangeBox.style.display = "flex";
  }

  // Paso C: Niveles
  if (lower > 0 && upper > 0 && upper > lower && levels > 1) {
    const stepPct = ((upper - lower) / lower / (levels - 1)) * 100;
    const totalFee = fee * 2;
    const levelBox = document.getElementById("levelInfo");
    const isViable = stepPct > totalFee + 0.3;
    levelBox.innerHTML = `
      <span class="info-item">% por nivel: <strong class="${isViable ? "up" : "down"}">${fmt(stepPct)}%</strong></span>
      <span class="info-item">Fee total/ciclo: <strong>${fmt(totalFee)}%</strong></span>
      <span class="info-item">Ganancia neta/ciclo: <strong class="${isViable ? "up" : "down"}">${fmt(stepPct - totalFee)}%</strong></span>
      ${!isViable ? `<span class="info-item down">⚠️ Muy pocos ciclos — reducí niveles o ampliá el rango</span>` : `<span class="info-item up">✅ Niveles viables</span>`}
    `;
    levelBox.style.display = "flex";
  }

  // Paso D: Capital
  if (capital > 0) {
    const capBox = document.getElementById("capitalInfo");
    const pctOfPortfolio = portfolio > 0 ? (capital / portfolio) * 100 : null;
    const pctClass = pctOfPortfolio !== null
      ? (pctOfPortfolio <= 25 ? "up" : pctOfPortfolio <= 40 ? "neutral" : "down")
      : "";
    const capPerLevel = levels > 0 ? capital / levels : 0;
    capBox.innerHTML = `
      <span class="info-item">Capital/nivel: <strong>$${fmt(capPerLevel)}</strong></span>
      ${pctOfPortfolio !== null ? `<span class="info-item">% del portfolio: <strong class="${pctClass}">${fmt(pctOfPortfolio)}%</strong></span>` : ""}
      ${reserve > 0 ? `<span class="info-item">Reserva DCA: <strong>$${fmt(reserve)}</strong></span>` : ""}
      ${pctOfPortfolio > 40 ? `<span class="info-item down">⚠️ Exposición alta. Recomendado: ≤25%</span>` : ""}
    `;
    capBox.style.display = "flex";
  }

  // Paso E: SL / TP del bot
  if (lower > 0 && upper > 0 && slPct > 0 && tpPct > 0) {
    const slPrice = lower * (1 - slPct / 100);
    const tpPrice = upper * (1 + tpPct / 100);
    const slTpBox = document.getElementById("slTpInfo");
    slTpBox.innerHTML = `
      <span class="info-item">Stop Loss del bot: <strong class="down">$${fmt(slPrice)}</strong></span>
      <span class="info-item">Take Profit del bot: <strong class="up">$${fmt(tpPrice)}</strong></span>
      <span class="info-item">Rango protegido: <strong>$${fmt(slPrice)} → $${fmt(tpPrice)}</strong></span>
    `;
    slTpBox.style.display = "flex";
  }
}

// ═══════════════════════════════════════════════
// GENERAR GRILLA COMPLETA
// ═══════════════════════════════════════════════
function generateGrid() {
  const lower    = parseFloat(document.getElementById("gridLower").value);
  const upper    = parseFloat(document.getElementById("gridUpper").value);
  const current  = parseFloat(document.getElementById("gridCurrentPrice").value);
  const levels   = parseInt(document.getElementById("gridLevels").value);
  const fee      = parseFloat(document.getElementById("gridFee").value) / 100;
  const capital  = parseFloat(document.getElementById("gridCapital").value);
  const slPct    = parseFloat(document.getElementById("botSL").value) / 100;
  const tpPct    = parseFloat(document.getElementById("botTP").value) / 100;

  if (!lower || !upper || !current || !levels || !capital) {
    alert("Completá al menos los pasos B, D y E antes de generar la grilla.");
    return;
  }
  if (upper <= lower) {
    alert("El límite superior debe ser mayor al límite inferior.");
    return;
  }

  const capitalPerLevel = capital / levels;
  const slPrice = lower * (1 - slPct);
  const tpPrice = upper * (1 + tpPct);

  // Generar niveles de precio uniformemente distribuidos
  const rows = [];
  for (let i = 0; i < levels; i++) {
    const levelPrice = lower + (upper - lower) * (i / (levels - 1));
    const buyPrice   = levelPrice;
    const sellPrice  = i < levels - 1
      ? lower + (upper - lower) * ((i + 1) / (levels - 1))
      : null;

    const coinsPerLevel = capitalPerLevel / buyPrice;
    const grossProfit   = sellPrice ? (sellPrice - buyPrice) * coinsPerLevel : 0;
    const feeCost       = sellPrice ? (buyPrice * coinsPerLevel * fee) + (sellPrice * coinsPerLevel * fee) : 0;
    const netProfit     = grossProfit - feeCost;
    const netPct        = buyPrice > 0 ? (netProfit / capitalPerLevel) * 100 : 0;
    const isActive      = current >= buyPrice * 0.999; // niveles bajo el precio actual están "comprados"

    rows.push({
      level: i + 1,
      buyPrice,
      sellPrice,
      coinsPerLevel,
      capitalPerLevel,
      grossProfit,
      feeCost,
      netProfit,
      netPct,
      isActive
    });
  }

  // Métricas globales
  const activeLevels = rows.filter(r => r.isActive).length;
  const capitalDeployed = activeLevels * capitalPerLevel;
  const totalFeeIfAllCycle = rows.reduce((a, r) => a + r.feeCost, 0);
  const totalNetIfAllCycle = rows.reduce((a, r) => a + r.netProfit, 0);
  const avgBuyPrice = rows.filter(r => r.isActive).reduce((a, r) => a + r.buyPrice, 0) / (activeLevels || 1);
  const stepPct = ((upper - lower) / lower / (levels - 1)) * 100;

  // Panel de resumen
  document.getElementById("gridSummary").innerHTML = `
    <div class="result-header">Resumen de la Grilla</div>
    <div class="summary-metrics">
      <div class="metric-block">
        <span class="si-label">Rango operativo</span>
        <span class="si-value mono">$${fmt(lower)} → $${fmt(upper)}</span>
      </div>
      <div class="metric-block">
        <span class="si-label">Stop Loss del Bot</span>
        <span class="si-value down mono">$${fmt(slPrice)}</span>
      </div>
      <div class="metric-block">
        <span class="si-label">Take Profit del Bot</span>
        <span class="si-value up mono">$${fmt(tpPrice)}</span>
      </div>
      <div class="metric-block">
        <span class="si-label">Capital por nivel</span>
        <span class="si-value mono">$${fmt(capitalPerLevel)}</span>
      </div>
      <div class="metric-block">
        <span class="si-label">% por nivel (neto)</span>
        <span class="si-value ${stepPct - fee * 200 > 0.3 ? "up" : "down"} mono">${fmt(stepPct - fee * 200)}%</span>
      </div>
      <div class="metric-block">
        <span class="si-label">Ganancia si todos ciclan</span>
        <span class="si-value up mono">$${fmt(totalNetIfAllCycle)}</span>
      </div>
      <div class="metric-block">
        <span class="si-label">Niveles activos ahora</span>
        <span class="si-value entry mono">${activeLevels} / ${levels}</span>
      </div>
      <div class="metric-block">
        <span class="si-label">Capital desplegado</span>
        <span class="si-value mono">$${fmt(capitalDeployed)}</span>
      </div>
    </div>
  `;

  // Tabla de niveles
  document.getElementById("gridTable").innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Precio COMPRA</th>
          <th>Precio VENTA</th>
          <th>Capital (USD)</th>
          <th>Crypto</th>
          <th>Gan. bruta</th>
          <th>Fee total</th>
          <th>Gan. NETA</th>
          <th>% Neto</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr class="${row.isActive ? "row-active" : "row-pending"}">
            <td class="center muted">Nv.${row.level}</td>
            <td class="mono editable" contenteditable="true">$${fmt(row.buyPrice)}</td>
            <td class="mono">${row.sellPrice ? "$" + fmt(row.sellPrice) : "<span class='muted'>—</span>"}</td>
            <td class="mono editable" contenteditable="true">$${fmt(row.capitalPerLevel)}</td>
            <td class="mono">${fmt(row.coinsPerLevel, 6)}</td>
            <td class="mono ${row.grossProfit > 0 ? "up" : "muted"}">${row.sellPrice ? "$" + fmt(row.grossProfit) : "—"}</td>
            <td class="mono down">$${fmt(row.feeCost)}</td>
            <td class="mono ${row.netProfit > 0 ? "up" : "muted"} bold">${row.sellPrice ? "$" + fmt(row.netProfit) : "—"}</td>
            <td class="mono ${row.netPct > 0 ? "up" : "muted"}">${row.sellPrice ? fmt(row.netPct) + "%" : "—"}</td>
            <td class="center"><span class="status-badge ${row.isActive ? "active" : "pending"}">${row.isActive ? "ACTIVO" : "PENDIENTE"}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <p class="table-note">✏️ Los campos de Precio COMPRA y Capital son editables. El bot compra en cada nivel y vende en el nivel inmediato superior.</p>
  `;

  // Explicación de ciclos
  document.getElementById("cycleInfo").innerHTML = `
    <div class="cycle-box">
      <div class="cycle-title">¿Cómo genera ganancia esta grilla?</div>
      <div class="cycle-steps">
        <div class="cycle-step">
          <span class="cs-num">1</span>
          <span>El bot coloca una orden de <strong>COMPRA</strong> en cada nivel del rango ($${fmt(lower)} → $${fmt(upper)})</span>
        </div>
        <div class="cycle-step">
          <span class="cs-num">2</span>
          <span>Cuando el precio <strong>baja</strong> y toca un nivel → compra automáticamente</span>
        </div>
        <div class="cycle-step">
          <span class="cs-num">3</span>
          <span>Cuando el precio <strong>sube</strong> al nivel siguiente → vende automáticamente, cerrando el ciclo</span>
        </div>
        <div class="cycle-step">
          <span class="cs-num">4</span>
          <span>Cada ciclo cerrado genera <strong>~${fmt(stepPct - fee * 200)}% neto</strong>. Cuantos más rebotes, más ciclos = más ganancia</span>
        </div>
        <div class="cycle-step warn">
          <span class="cs-num">!</span>
          <span>Si el precio <strong>rompe el SL ($${fmt(slPrice)})</strong> → el bot cierra todo. Si supera el TP ($${fmt(tpPrice)}) → libera capital para seguir el rally</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById("gridResult").style.display = "block";
  document.getElementById("gridResult").scrollIntoView({ behavior: "smooth" });
}

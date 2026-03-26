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

// IDs de CoinGecko para cada símbolo Binance
const BINANCE_TO_COINGECKO = {
  "BTCUSDT":  "bitcoin",
  "ETHUSDT":  "ethereum",
  "ADAUSDT":  "cardano",
  "PAXGUSDT": "pax-gold"
};

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

// Fetch con timeout para no quedar colgado
async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// ═══════════════════════════════════════════════
// FUENTES DE DATOS — con fallback
// Intenta: CoinGecko Demo → Binance → CoinGecko Pro
// ═══════════════════════════════════════════════

// Precios simples: usa Binance 24h ticker (sin CORS)
async function fetchPricesBinance() {
  const symbols = ["BTCUSDT", "ETHUSDT", "ADAUSDT", "PAXGUSDT"];
  const results = {};
  await Promise.all(symbols.map(async (sym) => {
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`;
    const r = await fetchWithTimeout(url);
    const d = await r.json();
    const coin = BINANCE_TO_COINGECKO[sym];
    results[coin] = {
      usd: parseFloat(d.lastPrice),
      usd_24h_change: parseFloat(d.priceChangePercent)
    };
  }));
  return results;
}

// Historial OHLC: usa Binance klines (velas de 4hs, últimos 5 días = 30 velas)
async function fetchHistoryBinance(coin) {
  const sym = SYMBOL_MAP[coin].binance;
  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=4h&limit=30`;
  const r = await fetchWithTimeout(url);
  const d = await r.json();
  // Binance klines: [openTime, open, high, low, close, volume, ...]
  return d.map(k => ({
    ts: k[0],
    open:  parseFloat(k[1]),
    high:  parseFloat(k[2]),
    low:   parseFloat(k[3]),
    close: parseFloat(k[4]),
    vol:   parseFloat(k[5])
  })).reverse(); // más reciente primero
}

// Historial para señal EMA: cierre de las últimas 100 velas de 4hs
async function fetchClosesBinance(coin) {
  const sym = SYMBOL_MAP[coin].binance;
  const url = `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=4h&limit=100`;
  const r = await fetchWithTimeout(url);
  const d = await r.json();
  return d.map(k => parseFloat(k[4])); // solo cierres
}

// ═══════════════════════════════════════════════
// SECCIÓN 1: PRECIOS EN VIVO
// ═══════════════════════════════════════════════
async function loadPrices() {
  try {
    const data = await fetchPricesBinance();
    document.getElementById("priceCards").innerHTML = COINS.map(coin => {
      const d = data[coin];
      const label = SYMBOL_MAP[coin].label;
      const isUp = d.usd_24h_change >= 0;
      return `
        <div class="price-card ${isUp ? "up" : "down"}">
          <div class="price-label">${label}</div>
          <div class="price-value">$${fmt(d.usd)}</div>
          <div class="price-change ${isUp ? "up" : "down"}">
            ${isUp ? "▲" : "▼"} ${fmt(Math.abs(d.usd_24h_change))}%
          </div>
        </div>`;
    }).join("");
  } catch (e) {
    document.getElementById("priceCards").innerHTML =
      `<p class="error-msg">Error al cargar precios. Verificá tu conexión.</p>`;
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
    const rows = await fetchHistoryBinance(coin);

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Fecha / Hora</th>
            <th>Apertura</th>
            <th>Máx.</th>
            <th>Mín.</th>
            <th>Cierre</th>
            <th>Variación</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => {
            const varPct = ((row.close - row.open) / row.open) * 100;
            const isUp = varPct >= 0;
            return `<tr>
              <td>${fmtDate(row.ts)}</td>
              <td class="mono">$${fmt(row.open)}</td>
              <td class="mono up">$${fmt(row.high)}</td>
              <td class="mono down">$${fmt(row.low)}</td>
              <td class="mono">$${fmt(row.close)}</td>
              <td><span class="${isUp ? "up" : "down"}">${isUp ? "▲" : "▼"} ${fmt(Math.abs(varPct))}%</span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>`;
  } catch (e) {
    container.innerHTML = `<p class="error-msg">Error al cargar historial. Verificá tu conexión.</p>`;
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

async function calculateSignal() {
  const coin = document.getElementById("signalCryptoSelect").value;
  const label = SYMBOL_MAP[coin].label;
  const fast = parseInt(document.getElementById("emaFast").value);
  const slow = parseInt(document.getElementById("emaSlow").value);
  const btn = document.querySelector("[onclick='calculateSignal()']");
  btn.textContent = "Calculando...";
  btn.disabled = true;

  try {
    const closes = await fetchClosesBinance(coin);
    const currentPrice = closes[closes.length - 1];
    const emaFastVal = calcEMA(closes, fast);
    const emaSlowVal = calcEMA(closes, slow);
    const volatility = calcVolatility(closes.slice(-30));

    const priceDelta7d = ((currentPrice - closes[closes.length - 43]) / closes[closes.length - 43]) * 100; // 42 velas ~ 7 días
    const max7d = Math.max(...closes.slice(-43));
    const min7d = Math.min(...closes.slice(-43));
    const emaSlope = emaFastVal > emaSlowVal ? "alcista" : "bajista";
    const absDelta = Math.abs(priceDelta7d);

    let gridSuitability, suitClass, suitIcon;
    if (absDelta < 8 && volatility < 2.5) {
      gridSuitability = "IDEAL para Grid";
      suitClass = "ideal"; suitIcon = "✅";
    } else if (absDelta < 20) {
      gridSuitability = "ACEPTABLE con precaución";
      suitClass = "caution"; suitIcon = "⚠️";
    } else {
      gridSuitability = "RIESGOSO para Grid";
      suitClass = "risky"; suitIcon = "❌";
    }

    const suggestedLower = min7d * 0.98;
    const suggestedUpper = max7d * 1.02;
    const suggestedRange = ((suggestedUpper - suggestedLower) / suggestedLower) * 100;
    const suggestedLevels = Math.max(5, Math.min(20, Math.round(suggestedRange / 1)));

    document.getElementById("signalResult").innerHTML = `
      <div class="suit-badge ${suitClass}">
        <span class="suit-icon">${suitIcon}</span>
        <div>
          <div class="suit-label">${label} — ${gridSuitability}</div>
          <div class="suit-detail">Variación 7d: ${priceDelta7d >= 0 ? "+" : ""}${fmt(priceDelta7d)}% · Volatilidad: ${fmt(volatility)}%</div>
        </div>
      </div>
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
          <span class="si-value mono">$${fmt(max7d)}</span>
        </div>
        <div class="signal-item">
          <span class="si-label">Mín. 7 días</span>
          <span class="si-value mono">$${fmt(min7d)}</span>
        </div>
      </div>
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
      </div>`;

    document.getElementById("signalResult").style.display = "block";
  } catch (e) {
    document.getElementById("signalResult").innerHTML =
      `<p class="error-msg">Error al calcular señal. Verificá tu conexión.</p>`;
    document.getElementById("signalResult").style.display = "block";
  }

  btn.textContent = "▶ Analizar Mercado";
  btn.disabled = false;
}

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
    "strong_up":   { cls: "warn-orange", text: "⚠️ PRECAUCIÓN: Rally fuerte. El precio puede salir del rango rápido. Usá un TP del bot conservador." },
    "strong_down": { cls: "warn-red",    text: "❌ RIESGOSO: Caída pronunciada. El capital puede quedar atrapado en posiciones compradas. Esperá estabilización." },
    "lateral":     { cls: "warn-green",  text: "✅ IDEAL: Mercado lateral maximiza los ciclos compra→venta dentro del rango." },
    "soft_up":     { cls: "warn-green",  text: "✅ ACEPTABLE: Tendencia alcista suave. El grid genera ciclos mientras sube gradualmente." },
    "soft_down":   { cls: "warn-green",  text: "✅ ACEPTABLE: Tendencia bajista suave. Funcionará si hay rebotes dentro del rango." }
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
// CÁLCULO EN VIVO (info boxes pasos B–E)
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

  // Paso B
  if (lower > 0 && upper > 0 && upper > lower) {
    const rangePct = ((upper - lower) / lower) * 100;
    const posInRange = current > 0
      ? `Precio actual al ${fmt(((current - lower) / (upper - lower)) * 100)}% del rango`
      : "";
    const box = document.getElementById("rangeInfo");
    box.innerHTML = `
      <span class="info-item">Rango total: <strong>${fmt(rangePct)}%</strong></span>
      <span class="info-item">Amplitud: <strong>$${fmt(upper - lower)}</strong></span>
      ${posInRange ? `<span class="info-item">${posInRange}</span>` : ""}`;
    box.style.display = "flex";
  }

  // Paso C
  if (lower > 0 && upper > 0 && upper > lower && levels > 1 && fee > 0) {
    const stepPct = ((upper - lower) / lower / (levels - 1)) * 100;
    const totalFee = fee * 2;
    const isViable = stepPct > totalFee + 0.3;
    const box = document.getElementById("levelInfo");
    box.innerHTML = `
      <span class="info-item">% por nivel: <strong class="${isViable ? "up" : "down"}">${fmt(stepPct)}%</strong></span>
      <span class="info-item">Fee total/ciclo: <strong>${fmt(totalFee)}%</strong></span>
      <span class="info-item">Ganancia neta/ciclo: <strong class="${isViable ? "up" : "down"}">${fmt(stepPct - totalFee)}%</strong></span>
      <span class="info-item ${isViable ? "up" : "down"}">${isViable ? "✅ Niveles viables" : "⚠️ Muy pocos ciclos — reducí niveles o ampliá rango"}</span>`;
    box.style.display = "flex";
  }

  // Paso D
  if (capital > 0) {
    const pctOfPortfolio = portfolio > 0 ? (capital / portfolio) * 100 : null;
    const pctClass = pctOfPortfolio !== null
      ? (pctOfPortfolio <= 25 ? "up" : pctOfPortfolio <= 40 ? "neutral" : "down") : "";
    const capPerLevel = levels > 0 ? capital / levels : 0;
    const box = document.getElementById("capitalInfo");
    box.innerHTML = `
      <span class="info-item">Capital/nivel: <strong>$${fmt(capPerLevel)}</strong></span>
      ${pctOfPortfolio !== null ? `<span class="info-item">% del portfolio: <strong class="${pctClass}">${fmt(pctOfPortfolio)}%</strong></span>` : ""}
      ${reserve > 0 ? `<span class="info-item">Reserva DCA: <strong>$${fmt(reserve)}</strong></span>` : ""}
      ${pctOfPortfolio > 40 ? `<span class="info-item down">⚠️ Exposición alta. Recomendado: ≤25%</span>` : ""}`;
    box.style.display = "flex";
  }

  // Paso E
  if (lower > 0 && upper > 0 && slPct > 0 && tpPct > 0) {
    const slPrice = lower * (1 - slPct / 100);
    const tpPrice = upper * (1 + tpPct / 100);
    const box = document.getElementById("slTpInfo");
    box.innerHTML = `
      <span class="info-item">Stop Loss del bot: <strong class="down">$${fmt(slPrice)}</strong></span>
      <span class="info-item">Take Profit del bot: <strong class="up">$${fmt(tpPrice)}</strong></span>
      <span class="info-item">Rango protegido: <strong>$${fmt(slPrice)} → $${fmt(tpPrice)}</strong></span>`;
    box.style.display = "flex";
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
  const stepPct = ((upper - lower) / lower / (levels - 1)) * 100;

  const rows = [];
  for (let i = 0; i < levels; i++) {
    const buyPrice  = lower + (upper - lower) * (i / (levels - 1));
    const sellPrice = i < levels - 1
      ? lower + (upper - lower) * ((i + 1) / (levels - 1))
      : null;
    const coinsPerLevel = capitalPerLevel / buyPrice;
    const grossProfit   = sellPrice ? (sellPrice - buyPrice) * coinsPerLevel : 0;
    const feeCost       = sellPrice
      ? (buyPrice * coinsPerLevel * fee) + (sellPrice * coinsPerLevel * fee)
      : capitalPerLevel * fee;
    const netProfit = grossProfit - feeCost;
    const netPct    = buyPrice > 0 ? (netProfit / capitalPerLevel) * 100 : 0;
    const isActive  = current >= buyPrice * 0.999;

    rows.push({ level: i + 1, buyPrice, sellPrice, coinsPerLevel,
                capitalPerLevel, grossProfit, feeCost, netProfit, netPct, isActive });
  }

  const activeLevels      = rows.filter(r => r.isActive).length;
  const capitalDeployed   = activeLevels * capitalPerLevel;
  const totalNetIfAllCycle= rows.reduce((a, r) => a + r.netProfit, 0);

  // Resumen
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
        <span class="si-label">% neto por ciclo</span>
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
    </div>`;

  // Tabla
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
          </tr>`).join("")}
      </tbody>
    </table>
    <p class="table-note">✏️ Precio COMPRA y Capital son editables. El bot compra en cada nivel y vende en el nivel inmediato superior.</p>`;

  // Ciclos
  document.getElementById("cycleInfo").innerHTML = `
    <div class="cycle-box">
      <div class="cycle-title">¿Cómo genera ganancia esta grilla?</div>
      <div class="cycle-steps">
        <div class="cycle-step"><span class="cs-num">1</span><span>El bot coloca <strong>COMPRA</strong> en cada nivel del rango ($${fmt(lower)} → $${fmt(upper)})</span></div>
        <div class="cycle-step"><span class="cs-num">2</span><span>Cuando el precio <strong>baja</strong> y toca un nivel → compra automáticamente</span></div>
        <div class="cycle-step"><span class="cs-num">3</span><span>Cuando el precio <strong>sube</strong> al nivel siguiente → vende, cerrando el ciclo</span></div>
        <div class="cycle-step"><span class="cs-num">4</span><span>Cada ciclo genera <strong>~${fmt(stepPct - fee * 200)}% neto</strong>. Más rebotes = más ciclos = más ganancia</span></div>
        <div class="cycle-step warn"><span class="cs-num">!</span><span>Si rompe el SL ($${fmt(slPrice)}) → cierra todo. Si supera el TP ($${fmt(tpPrice)}) → libera capital</span></div>
      </div>
    </div>`;

  document.getElementById("gridResult").style.display = "block";
  document.getElementById("gridResult").scrollIntoView({ behavior: "smooth" });
}

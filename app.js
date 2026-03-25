// Mapeo CoinGecko → Ticker Binance
function mapCryptoToBinanceSymbol(coin) {
  const map = {
    "bitcoin": "BTCUSDT",
    "ethereum": "ETHUSDT",
    "cardano": "ADAUSDT",
    "pax-gold": "PAXGUSDT"
  };
  return map[coin];
}

// Cargar precios simples
async function loadPrices() {
  const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,cardano,pax-gold&vs_currencies=usd&include_24hr_change=true";
  const r = await fetch(url);
  const d = await r.json();
  document.getElementById("prices").innerHTML = `
    <p>BTC: $${d.bitcoin.usd}</p>
    <p>ETH: $${d.ethereum.usd}</p>
    <p>ADA: $${d.cardano.usd}</p>
    <p>PAXG: $${d["pax-gold"].usd}</p>
  `;
}
loadPrices();
setInterval(loadPrices, 20000);

// Mostrar gráfico dinámico según crypto elegida
function showChart() {
  document.getElementById("chartContainer").style.display = "block";
  const coin = document.getElementById("cryptoSelect").value;
  const symbol = mapCryptoToBinanceSymbol(coin);
  // Limpia el gráfico previo
  document.getElementById("chart").innerHTML = "";
  new TradingView.widget({
    width: "100%",
    height: 500,
    symbol: `BINANCE:${symbol}`,
    interval: "60",
    theme: "dark",
    style: "1",
    locale: "es",
    container_id: "chart"
  });
}

function showSignals() {
  document.getElementById("signals").style.display = "block";
  document.getElementById("signals").innerHTML = "Calculá abajo para ver señales personalizadas.";
}

// Obtener historial de precios
async function getHistory(coin) {
  const url = `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=usd&days=7`;
  const r = await fetch(url);
  const d = await r.json();
  return d.prices.map(p => p[1]);
}

// EMA
function calcEMA(values, period) {
  let k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// Tendencia simple
function calcTrend(values) {
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    sum += values[i] - values[i - 1];
  }
  return sum > 0 ? "Alcista ✅" : "Bajista ❌";
}

// Señal final
async function calculateCustomSignal() {
  const coin = document.getElementById("cryptoSelect").value;
  const fast = parseInt(document.getElementById("emaFast").value);
  const slow = parseInt(document.getElementById("emaSlow").value);
  const closes = await getHistory(coin);
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  let emaSignal = "Neutral";
  if (emaFast > emaSlow) emaSignal = "Compra ✅";
  if (emaFast < emaSlow) emaSignal = "Venta ❌";
  const trend = calcTrend(closes.slice(-10));
  let final = "Neutral";
  if (emaSignal.includes("Compra") && trend.includes("Alcista")) final = "COMPRA ✅✅";
  else if (emaSignal.includes("Venta") && trend.includes("Bajista")) final = "VENTA ❌❌";
  const box = document.getElementById("customResult");
  box.style.display = "block";
  box.innerHTML = `
    <h3>Resultado</h3>
    <p>EMA: ${emaSignal}</p>
    <p>Tendencia: ${trend}</p>
    <h2>${final}</h2>
  `;
}

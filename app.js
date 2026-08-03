const CONFIG_KEY = "tradevault-supabase-config-v1";
const app = document.getElementById("app");
let client = null;
let currentUser = null;
let trades = [];
let activeTab = "dashboard";

const money = value => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
}).format(Number(value) || 0);

function pnl(trade) {
  if (trade.exit_price === null || trade.exit_price === "") return null;
  const move = trade.direction === "long"
    ? Number(trade.exit_price) - Number(trade.entry_price)
    : Number(trade.entry_price) - Number(trade.exit_price);
  return move * Number(trade.quantity) - Number(trade.fees || 0);
}

function risk(trade) {
  return Math.abs(Number(trade.entry_price) - Number(trade.stop_price)) * Number(trade.quantity);
}

function rMultiple(trade) {
  const result = pnl(trade);
  const amount = risk(trade);
  return result === null || amount === 0 ? null : result / amount;
}

function plannedRR(trade) {
  const riskDistance = Math.abs(Number(trade.entry_price) - Number(trade.stop_price));
  const rewardDistance = trade.direction === "long"
    ? Number(trade.target_price) - Number(trade.entry_price)
    : Number(trade.entry_price) - Number(trade.target_price);
  return riskDistance ? rewardDistance / riskDistance : 0;
}

function getSavedConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY));
  } catch {
    return null;
  }
}

function startClient(config) {
  client = window.supabase.createClient(config.url, config.key);
  initializeAuth();
}

async function initializeAuth() {
  const { data: { session } } = await client.auth.getSession();
  currentUser = session?.user || null;

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    currentUser ? loadTrades() : renderLogin();
  });

  currentUser ? await loadTrades() : renderLogin();
}

function renderSetup(message = "") {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-brand">
        <p class="eyebrow light">ONE-TIME CONNECTION</p>
        <h1>TradeVault</h1>
        <p>Connect your journal to the Supabase project you already created. These browser-safe details are stored only on this device.</p>
      </section>
      <section class="auth-card">
        <p class="eyebrow">SUPABASE SETUP</p>
        <h2>Connect the database</h2>
        <p class="setup-note">Use the Project URL and publishable/anon key from Supabase. Never use a service-role or secret key.</p>
        <form id="setup-form" class="stack-form">
          <label>
            Supabase Project URL
            <input id="setup-url" type="url" placeholder="https://your-project.supabase.co" required>
          </label>
          <label>
            Publishable or anon key
            <textarea id="setup-key" rows="5" placeholder="sb_publishable_... or eyJ..." required></textarea>
          </label>
          <button class="primary-btn" type="submit">Connect TradeVault</button>
        </form>
        ${message ? `<p class="form-message">${escapeHtml(message)}</p>` : ""}
      </section>
    </main>`;

  document.getElementById("setup-form").addEventListener("submit", async event => {
    event.preventDefault();
    const url = document.getElementById("setup-url").value.trim().replace(/\/$/, "");
    const key = document.getElementById("setup-key").value.trim();
    const button = event.target.querySelector("button");
    button.disabled = true;
    button.textContent = "Checking…";

    try {
      const testClient = window.supabase.createClient(url, key);
      const { error } = await testClient.auth.getSession();
      if (error) throw error;

      localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key }));
      client = testClient;
      initializeAuth();
    } catch (error) {
      renderSetup(error?.message || "The connection details could not be verified.");
    }
  });
}

function renderLogin() {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-brand">
        <p class="eyebrow light">DISCIPLINE OVER IMPULSE</p>
        <h1>TradeVault</h1>
        <p>Journal the decision. Measure the process. Protect the capital.</p>
      </section>
      <section class="auth-card">
        <p class="eyebrow">PRIVATE CLOUD JOURNAL</p>
        <h2>Welcome</h2>
        <p class="muted">Enter your email to receive a secure sign-in link.</p>
        <form id="login-form" class="stack-form">
          <label>Email address<input id="email" type="email" required placeholder="you@example.com"></label>
          <button class="primary-btn" type="submit">Email me a sign-in link</button>
        </form>
        <p id="login-message" class="form-message hidden"></p>
        <button id="change-connection" class="text-btn">Change Supabase connection</button>
      </section>
    </main>`;

  document.getElementById("login-form").addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("email").value.trim();
    const button = event.target.querySelector("button");
    const message = document.getElementById("login-message");
    button.disabled = true;
    button.textContent = "Sending…";

    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` }
    });

    message.classList.remove("hidden");
    message.textContent = error ? error.message : "Check your email for the secure sign-in link.";
    button.disabled = false;
    button.textContent = "Email me a sign-in link";
  });

  document.getElementById("change-connection").onclick = () => {
    localStorage.removeItem(CONFIG_KEY);
    renderSetup();
  };
}

async function loadTrades() {
  const { data, error } = await client
    .from("trades")
    .select("*")
    .order("trade_date", { ascending: false });

  if (error) {
    app.innerHTML = `
      <section class="loading-screen">
        <h2>Could not load trades</h2>
        <p>${escapeHtml(error.message)}</p>
        <button id="reset-config" class="secondary-btn">Change connection</button>
      </section>`;
    document.getElementById("reset-config").onclick = () => {
      localStorage.removeItem(CONFIG_KEY);
      renderSetup();
    };
    return;
  }

  trades = data || [];
  renderApp();
}

function renderApp() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div>
          <div class="brand-row">
            <div class="brand-mark">TV</div>
            <div><strong>TradeVault</strong><small>Cloud Journal</small></div>
          </div>
          <nav>
            <button data-tab="dashboard">⌂ Dashboard</button>
            <button data-tab="trades">↗ Trades</button>
            <button data-tab="calculator">÷ Risk Calculator</button>
            <button data-tab="playbook">▤ Playbook</button>
          </nav>
        </div>
        <div class="sidebar-bottom">
          <small>${escapeHtml(currentUser?.email || "")}</small>
          <button id="sign-out">⇥ Sign out</button>
          <button id="reset-connection">⚙ Change connection</button>
        </div>
      </aside>
      <main class="main-area">
        <header class="topbar">
          <div class="title-row">
            <button class="mobile-menu" id="mobile-menu">☰</button>
            <div><p class="eyebrow">PERSONAL TRADING SYSTEM</p><h1 id="page-title"></h1></div>
          </div>
          <div class="header-actions">
            <button class="secondary-btn" id="export-btn">Export</button>
            <button class="primary-btn" id="add-btn">+ Add Trade</button>
          </div>
        </header>
        <section id="page-content"></section>
      </main>
    </div>
    <div id="modal-root"></div>`;

  document.querySelectorAll("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      activeTab = button.dataset.tab;
      document.getElementById("sidebar").classList.remove("open");
      renderTab();
    });
  });

  document.getElementById("mobile-menu").onclick = () =>
    document.getElementById("sidebar").classList.toggle("open");

  document.getElementById("sign-out").onclick = () => client.auth.signOut();
  document.getElementById("reset-connection").onclick = () => {
    if (!confirm("Change the Supabase connection on this device?")) return;
    localStorage.removeItem(CONFIG_KEY);
    location.reload();
  };
  document.getElementById("add-btn").onclick = openTradeModal;
  document.getElementById("export-btn").onclick = exportCsv;
  renderTab();
}

function renderTab() {
  const titles = {
    dashboard: "Dashboard",
    trades: "Trade Journal",
    calculator: "Risk Calculator",
    playbook: "Strategy Playbook"
  };

  document.getElementById("page-title").textContent = titles[activeTab];
  document.querySelectorAll("[data-tab]").forEach(button =>
    button.classList.toggle("active", button.dataset.tab === activeTab)
  );

  if (activeTab === "dashboard") renderDashboard();
  if (activeTab === "trades") renderTrades();
  if (activeTab === "calculator") renderCalculator();
  if (activeTab === "playbook") renderPlaybook();
}

function renderDashboard() {
  const closed = trades.filter(trade => pnl(trade) !== null);
  const wins = closed.filter(trade => pnl(trade) > 0);
  const losses = closed.filter(trade => pnl(trade) < 0);
  const net = closed.reduce((sum, trade) => sum + pnl(trade), 0);
  const averageR = closed.length
    ? closed.reduce((sum, trade) => sum + rMultiple(trade), 0) / closed.length
    : 0;
  const grossWins = wins.reduce((sum, trade) => sum + pnl(trade), 0);
  const grossLosses = Math.abs(losses.reduce((sum, trade) => sum + pnl(trade), 0));
  const factor = grossLosses ? grossWins / grossLosses : grossWins ? Infinity : 0;

  const fields = [
    "level_identified","structure_confirmed","candle_confirmed",
    "risk_approved","reward_approved","session_approved"
  ];
  const discipline = trades.length
    ? trades.reduce((sum, trade) => sum + fields.filter(field => trade[field]).length, 0)
      / (trades.length * fields.length) * 100
    : 0;

  document.getElementById("page-content").innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow light">PERFORMANCE OVERVIEW</p>
        <h2>Trade the setup, not the feeling.</h2>
        <p>Your dashboard measures outcomes, but your journal measures discipline.</p>
      </div>
      <div><small>Discipline Score</small><strong>${discipline.toFixed(0)}%</strong></div>
    </section>
    <section class="metric-grid">
      ${metric("Net P/L", money(net), `${closed.length} closed trades`)}
      ${metric("Win Rate", `${closed.length ? (wins.length / closed.length * 100).toFixed(1) : "0.0"}%`, `${wins.length} wins`)}
      ${metric("Average R", `${averageR >= 0 ? "+" : ""}${averageR.toFixed(2)}R`, "Per closed trade")}
      ${metric("Profit Factor", factor === Infinity ? "∞" : factor.toFixed(2), "Wins ÷ losses")}
    </section>
    <section class="dashboard-grid">
      <article class="panel">
        <div class="panel-title"><div><p class="eyebrow">EQUITY CURVE</p><h3>Cumulative P/L</h3></div></div>
        <div class="chart-box"><canvas id="equity-chart"></canvas></div>
      </article>
      <article class="panel">
        <div class="panel-title"><div><p class="eyebrow">PROCESS</p><h3>Rule Adherence</h3></div></div>
        <div class="rule-list">${ruleBars(fields)}</div>
      </article>
    </section>
    <article class="panel recent-panel">
      <div class="panel-title"><div><p class="eyebrow">RECENT</p><h3>Latest Trades</h3></div></div>
      ${tradeTable(trades.slice(0, 5), true)}
    </article>`;

  drawChart(closed);
}

function metric(label, value, note) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function ruleBars(fields) {
  const labels = {
    level_identified:"Level identified",
    structure_confirmed:"Structure confirmed",
    candle_confirmed:"Candle confirmation",
    risk_approved:"Risk within plan",
    reward_approved:"Minimum 2R",
    session_approved:"Planned session"
  };

  return fields.map(field => {
    const score = trades.length
      ? trades.filter(trade => trade[field]).length / trades.length * 100
      : 0;
    return `
      <div>
        <div class="rule-label"><span>${labels[field]}</span><strong>${score.toFixed(0)}%</strong></div>
        <div class="progress"><div style="width:${score}%"></div></div>
      </div>`;
  }).join("");
}

function renderTrades() {
  document.getElementById("page-content").innerHTML = `
    <section class="panel">
      <div class="panel-title responsive">
        <div><p class="eyebrow">JOURNAL</p><h3>All Trades</h3></div>
        <div class="filters">
          <input id="search" placeholder="Search symbol or strategy">
          <select id="result-filter">
            <option value="all">All results</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="open">Open</option>
          </select>
        </div>
      </div>
      <div id="trade-table-wrap">${tradeTable(trades, false)}</div>
    </section>`;

  document.getElementById("search").oninput = filterTrades;
  document.getElementById("result-filter").onchange = filterTrades;
  bindDeleteButtons();
}

function filterTrades() {
  const query = document.getElementById("search").value.toLowerCase();
  const filter = document.getElementById("result-filter").value;

  const list = trades.filter(trade => {
    const textMatch =
      trade.symbol.toLowerCase().includes(query) ||
      trade.strategy.toLowerCase().includes(query);
    const result = pnl(trade);
    const resultMatch =
      filter === "all" ||
      (filter === "open" && result === null) ||
      (filter === "win" && result > 0) ||
      (filter === "loss" && result < 0);
    return textMatch && resultMatch;
  });

  document.getElementById("trade-table-wrap").innerHTML = tradeTable(list, false);
  bindDeleteButtons();
}

function tradeTable(list, compact) {
  return `
    <div class="table-scroll">
      <table>
        <thead><tr>
          <th>Date</th><th>Symbol</th><th>Side</th><th>Strategy</th>
          <th>P/L</th><th>R</th><th>Grade</th>${compact ? "" : "<th></th>"}
        </tr></thead>
        <tbody>
          ${list.length ? list.map(trade => {
            const result = pnl(trade);
            const r = rMultiple(trade);
            return `
              <tr>
                <td>${trade.trade_date}</td>
                <td><strong>${escapeHtml(trade.symbol)}</strong></td>
                <td>${trade.direction}</td>
                <td>${escapeHtml(trade.strategy)}</td>
                <td class="${result === null ? "muted" : result >= 0 ? "positive" : "negative"}">${result === null ? "Open" : money(result)}</td>
                <td class="${r === null ? "muted" : r >= 0 ? "positive" : "negative"}">${r === null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`}</td>
                <td><span class="grade">${escapeHtml(trade.grade)}</span></td>
                ${compact ? "" : `<td><button class="icon-delete" data-delete="${trade.id}">Delete</button></td>`}
              </tr>`;
          }).join("") : `<tr><td colspan="8" class="muted">No trades found.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

function bindDeleteButtons() {
  document.querySelectorAll("[data-delete]").forEach(button => {
    button.onclick = async () => {
      if (!confirm("Delete this trade permanently?")) return;
      const { error } = await client.from("trades").delete().eq("id", button.dataset.delete);
      if (error) return alert(error.message);
      trades = trades.filter(trade => trade.id !== button.dataset.delete);
      renderTrades();
    };
  });
}

function renderCalculator() {
  document.getElementById("page-content").innerHTML = `
    <div class="calculator-grid">
      <section class="panel">
        <div class="panel-title"><div><p class="eyebrow">CAPITAL PROTECTION</p><h3>Position Size Calculator</h3></div></div>
        <div class="form-grid">
          <label>Account Size<input id="ca" type="number" value="10000"></label>
          <label>Risk %<input id="cr" type="number" value="1"></label>
          <label>Entry<input id="ce" type="number" value="100"></label>
          <label>Stop Loss<input id="cs" type="number" value="98"></label>
          <label>Target<input id="ct" type="number" value="104"></label>
        </div>
      </section>
      <section class="result-card">
        <p class="eyebrow light">CALCULATED PLAN</p>
        <h2>Before you enter</h2>
        <div id="calc-results"></div>
      </section>
    </div>`;

  ["ca","cr","ce","cs","ct"].forEach(id =>
    document.getElementById(id).oninput = calculate
  );
  calculate();
}

function calculate() {
  const account = Number(document.getElementById("ca").value);
  const percentage = Number(document.getElementById("cr").value);
  const entry = Number(document.getElementById("ce").value);
  const stop = Number(document.getElementById("cs").value);
  const target = Number(document.getElementById("ct").value);

  const distance = Math.abs(entry - stop);
  const riskAmount = account * percentage / 100;
  const quantity = distance ? Math.floor(riskAmount / distance) : 0;
  const rr = distance ? Math.abs(target - entry) / distance : 0;

  document.getElementById("calc-results").innerHTML = `
    ${resultRow("Dollar Risk", money(riskAmount))}
    ${resultRow("Stop Distance", money(distance))}
    ${resultRow("Position Size", quantity.toLocaleString())}
    ${resultRow("Potential Reward", money(Math.abs(target - entry) * quantity))}
    ${resultRow("Risk : Reward", `1 : ${rr.toFixed(2)}`)}
    <p>${rr >= 2 ? "This setup meets the 2R planning rule." : "This setup is below the 2R planning rule."}</p>`;
}

function resultRow(label, value) {
  return `<div class="result-row"><span>${label}</span><strong>${value}</strong></div>`;
}

function renderPlaybook() {
  document.getElementById("page-content").innerHTML = `
    <div class="playbook-grid">
      <section class="strategy-hero">
        <p class="eyebrow light">PRIMARY STRATEGY</p>
        <h2>Support, Structure & Confirmation</h2>
        <p>A price-action framework using key levels, market structure, and candlestick confirmation.</p>
        <div class="chips"><span>Context: 1h–4h</span><span>Execution: 5m–15m</span><span>Minimum: 2R</span></div>
      </section>
      ${playCard("Entry Rules", [
        "Price reaches a clearly marked support or resistance area.",
        "Market structure supports the direction or confirms a genuine shift.",
        "A valid candlestick pattern confirms rejection, continuation, or reversal."
      ])}
      ${playCard("Skip the Trade", [
        "The level is weak, unclear, or repeatedly tested.",
        "The setup conflicts with higher-timeframe structure.",
        "The reward is below 2R, the stop is unreasonable, or the entry is driven by FOMO."
      ])}
    </div>`;
}

function playCard(title, items) {
  return `<section class="panel playbook-card"><p class="eyebrow">${title.toUpperCase()}</p><ol>${items.map(item => `<li>${item}</li>`).join("")}</ol></section>`;
}

function openTradeModal() {
  document.getElementById("modal-root").innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card">
        <div class="modal-header">
          <div><p class="eyebrow">NEW JOURNAL ENTRY</p><h2>Add Trade</h2></div>
          <button class="icon-btn" id="close-modal">×</button>
        </div>
        <form id="trade-form">
          <div class="modal-body">
            <div class="form-grid">
              <label>Trade Date<input name="trade_date" type="date" value="${new Date().toISOString().slice(0,10)}" required></label>
              <label>Symbol<input name="symbol" required placeholder="NQ, QQQ, AAPL…"></label>
              <label>Market<select name="market"><option>NASDAQ</option><option>Options</option><option>Stocks</option><option>Forex</option><option>Crypto</option></select></label>
              <label>Direction<select name="direction"><option value="long">long</option><option value="short">short</option></select></label>
              <label>Strategy<select name="strategy"><option>Support, Structure & Confirmation</option><option>Opening Range Breakout</option><option>Daily Trend Continuation</option><option>Support / Resistance Reversal</option></select></label>
              <label>Market Condition<select name="market_condition"><option>Uptrend</option><option>Downtrend</option><option>Range</option><option>Choppy</option></select></label>
              <label>Timeframe<input name="timeframe" value="15m"></label>
              <label>Quantity<input name="quantity" type="number" step="any" value="1"></label>
              <label>Entry<input name="entry_price" type="number" step="any" required></label>
              <label>Stop Loss<input name="stop_price" type="number" step="any" required></label>
              <label>Target<input name="target_price" type="number" step="any" required></label>
              <label>Exit (optional)<input name="exit_price" type="number" step="any"></label>
              <label>Fees<input name="fees" type="number" step="any" value="0"></label>
              <label>Grade<select name="grade"><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
            </div>

            <fieldset>
              <legend>Strategy Checklist</legend>
              <div class="check-grid">
                ${check("level_identified","Level identified")}
                ${check("structure_confirmed","Structure confirmed")}
                ${check("candle_confirmed","Candle confirmed")}
                ${check("risk_approved","Risk within plan")}
                ${check("reward_approved","Minimum 2R available")}
                ${check("session_approved","Planned session")}
              </div>
            </fieldset>

            <label>Trade Notes<textarea name="notes" rows="4" placeholder="What did you see, execute well, or need to improve?"></textarea></label>
          </div>
          <div class="modal-footer">
            <span id="rr-preview">Planned R:R 0.00</span>
            <div>
              <button type="button" class="secondary-btn" id="cancel-modal">Cancel</button>
              <button class="primary-btn" type="submit">Save Trade</button>
            </div>
          </div>
        </form>
      </section>
    </div>`;

  const form = document.getElementById("trade-form");
  const close = () => document.getElementById("modal-root").innerHTML = "";
  document.getElementById("close-modal").onclick = close;
  document.getElementById("cancel-modal").onclick = close;

  form.oninput = () => {
    const values = Object.fromEntries(new FormData(form));
    document.getElementById("rr-preview").textContent =
      `Planned R:R ${plannedRR(values).toFixed(2)}`;
  };

  form.onsubmit = async event => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData);

    ["entry_price","stop_price","target_price","quantity","fees"].forEach(key =>
      payload[key] = Number(payload[key])
    );
    payload.exit_price = payload.exit_price === "" ? null : Number(payload.exit_price);
    payload.symbol = payload.symbol.trim().toUpperCase();

    [
      "level_identified","structure_confirmed","candle_confirmed",
      "risk_approved","reward_approved","session_approved"
    ].forEach(key => payload[key] = formData.get(key) === "on");

    if (plannedRR(payload) < 2) payload.reward_approved = false;

    const saveButton = form.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";

    const { data, error } = await client.from("trades").insert(payload).select().single();
    if (error) {
      saveButton.disabled = false;
      saveButton.textContent = "Save Trade";
      return alert(error.message);
    }

    trades.unshift(data);
    close();
    activeTab = "dashboard";
    renderTab();
  };
}

function check(name, label) {
  return `<label><input type="checkbox" name="${name}">${label}</label>`;
}

function drawChart(closed) {
  const canvas = document.getElementById("equity-chart");

  if (!closed.length) {
    canvas.replaceWith(Object.assign(document.createElement("div"), {
      className: "empty-box",
      textContent: "Close a trade to begin your equity curve."
    }));
    return;
  }

  const ordered = [...closed].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  let cumulative = 0;
  const values = [0, ...ordered.map(trade => cumulative += pnl(trade))];

  const dpr = devicePixelRatio || 1;
  const width = canvas.clientWidth || 700;
  const height = 290;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const pad = { top:20, right:25, bottom:25, left:55 };
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;
  const x = index => pad.left + index / (values.length - 1) * (width - pad.left - pad.right);
  const y = value => pad.top + (max - value) / range * (height - pad.top - pad.bottom);

  ctx.font = "11px sans-serif";
  ctx.strokeStyle = "#dfd7ca";
  ctx.fillStyle = "#736f67";

  for (let i = 0; i <= 4; i++) {
    const value = max - range * i / 4;
    const yy = y(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(width - pad.right, yy);
    ctx.stroke();
    ctx.fillText(money(value), 2, yy + 4);
  }

  ctx.beginPath();
  ctx.strokeStyle = "#151515";
  ctx.lineWidth = 3;
  values.forEach((value, index) =>
    index ? ctx.lineTo(x(index), y(value)) : ctx.moveTo(x(index), y(value))
  );
  ctx.stroke();
}

function exportCsv() {
  const headers = [
    "Date","Symbol","Market","Direction","Strategy","Entry","Stop",
    "Target","Exit","Quantity","P/L","R","Grade","Notes"
  ];

  const rows = trades.map(trade => [
    trade.trade_date, trade.symbol, trade.market, trade.direction, trade.strategy,
    trade.entry_price, trade.stop_price, trade.target_price, trade.exit_price ?? "",
    trade.quantity, pnl(trade) ?? "", rMultiple(trade)?.toFixed(2) ?? "",
    trade.grade, trade.notes
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const url = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tradevault-${new Date().toISOString().slice(0,10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

const savedConfig = getSavedConfig();
savedConfig ? startClient(savedConfig) : renderSetup();

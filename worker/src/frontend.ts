// Cloudflare Worker Server-Side Rendered Web Dashboard
// Provides real-time fleet telemetry, 3-day 0:00-24:00 overlay, extended temperature visual (10-75°C),
// battery analytics with calculated runtime estimation, INA3221 power monitor, and Web Serial flasher

export function renderDashboardHtml(workerUrl?: string): string {
  const apiBase = workerUrl || "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solar &amp; LiPo Fleet Monitor — ESP32 Telemetry</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>☀️</text></svg>">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
  <script type="module" src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module"></script>
  <style>
    :root {
      --bg: #0d1117;
      --card-bg: #161b22;
      --border: #30363d;
      --text: #f0f6fc;
      --text-muted: #8b949e;
      --solar: #f59e0b;
      --solar-glow: rgba(245, 158, 11, 0.15);
      --battery: #10b981;
      --temp: #ef4444;
      --timing: #38bdf8;
      --day-today: #f59e0b;
      --day-yesterday: #3b82f6;
      --day-2ago: #a855f7;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 1rem;
    }

    .container { max-width: 1200px; margin: 0 auto; }

    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1.5rem;
    }

    .title-area h1 {
      font-size: 1.6rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .subtitle { color: var(--text-muted); font-size: 0.9rem; margin-top: 0.2rem; }

    .station-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    select, button {
      background: var(--card-bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.5rem 0.8rem;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    select:focus, button:focus { outline: 2px solid var(--solar); }

    .flash-btn {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #000;
      font-weight: 700;
      border: none;
      box-shadow: 0 2px 10px rgba(245, 158, 11, 0.3);
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .flash-btn:hover {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(245, 158, 11, 0.45);
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      position: relative;
    }

    .card-label {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .card-value {
      font-size: 1.8rem;
      font-weight: 700;
      display: flex;
      align-items: baseline;
      gap: 0.3rem;
    }

    .card-unit { font-size: 1rem; color: var(--text-muted); font-weight: 400; }
    .card-sub { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.3rem; }

    .badge {
      display: inline-block;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .badge-amber { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .badge-blue  { background: rgba(56, 189, 248, 0.2); color: #38bdf8; }
    .badge-purple{ background: rgba(168, 85, 247, 0.2); color: #c084fc; }

    .chart-section {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .chart-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .chart-title { font-size: 1.1rem; font-weight: 600; }
    .btn-group { display: flex; gap: 0.25rem; }
    .btn-group button {
      padding: 0.35rem 0.7rem;
      font-size: 0.8rem;
      border-radius: 4px;
    }
    .btn-group button.active {
      background: var(--solar);
      color: #000;
      font-weight: 600;
      border-color: var(--solar);
    }

    .chart-container { position: relative; height: 360px; width: 100%; }

    .bench-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.75rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
    }

    .bench-item { text-align: center; }
    .bench-val { font-size: 1.15rem; font-weight: 700; color: var(--timing); }
    .bench-label { font-size: 0.75rem; color: var(--text-muted); }

    /* Collapsible RF Monitor Section */
    .collapse-toggle-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-muted);
      font-size: 0.85rem;
      cursor: pointer;
      padding: 0.25rem 0.6rem;
      transition: transform 0.2s ease, color 0.2s ease;
    }
    .collapse-toggle-btn:hover {
      color: var(--text-main);
      border-color: var(--text-muted);
    }
    .collapse-toggle-btn.collapsed {
      transform: rotate(-90deg);
    }
    .palette-select {
      background: #0d1117;
      color: var(--text-main);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.35rem 0.6rem;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .heatmap-container {
      position: relative;
      width: 100%;
      height: 320px;
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    .heatmap-tooltip {
      position: absolute;
      display: none;
      background: rgba(22, 27, 34, 0.95);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.45rem 0.75rem;
      font-size: 0.75rem;
      color: #f0f6fc;
      pointer-events: none;
      z-index: 100;
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      white-space: nowrap;
      line-height: 1.4;
    }

    /* Modal Dialog Styles */
    .modal-backdrop {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .modal-backdrop.active {
      display: flex;
    }

    .modal-window {
      background: #161b22;
      border: 1px solid var(--border);
      border-radius: 12px;
      max-width: 720px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 30px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .modal-title {
      font-size: 1.2rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }

    .modal-close-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-size: 1.3rem;
      cursor: pointer;
      line-height: 1;
      padding: 0.2rem 0.5rem;
    }
    .modal-close-btn:hover { color: var(--text); }

    .modal-tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      background: #0d1117;
      padding: 0 1.25rem;
    }

    .modal-tab-btn {
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      padding: 0.8rem 1rem;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      border-radius: 0;
    }

    .modal-tab-btn:hover { color: var(--text); }
    .modal-tab-btn.active {
      color: var(--solar);
      border-bottom-color: var(--solar);
    }

    .modal-body {
      padding: 1.5rem;
    }

    .serial-status-banner {
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1.25rem;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .serial-status-banner.supported {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
    }
    .serial-status-banner.unsupported {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
    }

    .mode-card {
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.85rem 1rem;
      cursor: pointer;
      flex: 1;
      display: flex;
      gap: 0.75rem;
      transition: all 0.2s;
    }
    .mode-card.active {
      border-color: var(--solar);
      background: rgba(245, 158, 11, 0.08);
    }
    .mode-title { font-weight: 600; font-size: 0.9rem; color: var(--text); }
    .mode-desc { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.25rem; line-height: 1.4; }

    .install-button-wrapper {
      margin-top: 1.25rem;
      text-align: center;
      background: #0d1117;
      border: 1px dashed var(--border);
      border-radius: 8px;
      padding: 1.5rem;
    }

    .install-action-btn {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
      color: #000 !important;
      font-size: 1.05rem !important;
      font-weight: 700 !important;
      padding: 0.75rem 1.75rem !important;
      border-radius: 8px !important;
      border: none !important;
      cursor: pointer !important;
      box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4) !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 0.5rem !important;
      transition: transform 0.15s ease, box-shadow 0.15s ease !important;
    }
    .install-action-btn:hover {
      transform: translateY(-1px) !important;
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.55) !important;
    }

    .flash-guide-card {
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
    }

    .bin-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .bin-card {
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.75rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      text-decoration: none;
      color: var(--text);
      transition: border-color 0.2s;
    }
    .bin-card:hover { border-color: var(--solar); }

    .cli-box {
      background: #000;
      color: #38bdf8;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.8rem;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      overflow-x: auto;
      margin-top: 0.5rem;
      line-height: 1.4;
    }

    footer {
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
      margin-top: 1.5rem;
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    footer p { margin-bottom: 0.4rem; }
    footer a { color: var(--solar); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-area">
        <h1>
          <span>☀️</span> Solar Telemetry Fleet
          <span class="badge badge-blue" style="font-size:0.75rem;vertical-align:middle;margin-left:0.5rem;" title="Web Dashboard Application Version">Web v1.1.2</span>
        </h1>
        <div class="subtitle" id="station-subtitle">Connecting to Cloudflare D1 Edge Ingestion...</div>
      </div>
      <div class="station-controls">
        <select id="station-select">
          <option value="">Loading stations...</option>
        </select>
        <button id="refresh-btn">🔄 Refresh</button>
        <button class="flash-btn" onclick="openFlashModal()" title="Flash firmware to ESP32 / ESP32-S3 / ESP32-C5 via Web Serial">⚡ Flash Firmware</button>
      </div>
    </header>

    <!-- Key Metrics Cards -->
    <div class="cards-grid">
      <div class="card">
        <div class="card-label">
          <span>Solar Panel</span>
        </div>
        <div class="card-value" id="solar-val">-- <span class="card-unit">V</span></div>
      </div>

      <div class="card">
        <div class="card-label">
          <span>LiPo Battery</span>
        </div>
        <div class="card-value" id="battery-val">-- <span class="card-unit">V</span></div>
      </div>

      <div class="card">
        <div class="card-label">
          <span>Temperature</span>
        </div>
        <div class="card-value" id="temp-val">-- <span class="card-unit">°C</span></div>
      </div>

      <div class="card">
        <div class="card-label">
          <span>Active Cycle Time</span>
        </div>
        <div class="card-value" id="cycle-total">-- <span class="card-unit">ms</span></div>
      </div>
    </div>

    <!-- INA3221 Precision Power Card (Visible when INA3221 telemetry is detected) -->
    <div class="card" id="ina3221-card" style="display:none;margin-bottom:1.5rem;">
      <div class="card-label">
        <span>⚡ INA3221 Precision Current &amp; Power Monitor (I2C 0x40)</span>
        <span class="badge badge-purple">Hardware Monitor</span>
      </div>
      <div class="cards-grid" style="margin-top:0.75rem;margin-bottom:0;">
        <div style="background:#0d1117;padding:0.85rem;border-radius:6px;border:1px solid var(--border);">
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">CH1 Solar Panel Input</div>
          <div style="font-size:1.35rem;font-weight:700;color:var(--solar);" id="ina-solar-pwr">-- mW</div>
          <div style="font-size:0.8rem;color:var(--text-muted);" id="ina-solar-details">-- V &bull; -- mA</div>
        </div>
        <div style="background:#0d1117;padding:0.85rem;border-radius:6px;border:1px solid var(--border);">
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">CH3 Connected Load</div>
          <div style="font-size:1.35rem;font-weight:700;color:var(--timing);" id="ina-load-pwr">-- mW</div>
          <div style="font-size:0.8rem;color:var(--text-muted);" id="ina-load-details">-- V &bull; -- mA &bull; Res: -- &Omega;</div>
        </div>
      </div>
    </div>

    <!-- Dedicated Battery Analytics Card & Calculated Autonomy -->
    <div class="chart-section" id="battery-analytics-card">
      <div class="chart-header">
        <div>
          <div class="chart-title">🔋 LiPo Battery Autonomy &amp; Voltage Trends</div>
          <div class="subtitle">Multi-range voltage tracking and real-time battery runtime estimation</div>
        </div>
        <div class="btn-group" id="battery-range-toggle">
          <button class="active" data-days="1">1 Day</button>
          <button data-days="7">7 Days</button>
          <button data-days="30">30 Days</button>
          <button data-days="90">3 Months</button>
        </div>
      </div>

      <!-- Runtime Estimate Metrics Box -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:1.25rem;">
        <div class="card" style="background:#0d1117;padding:1rem;">
          <div class="card-label"><span>24-Hour Runtime Est.</span><span class="badge badge-green">1 Day</span></div>
          <div class="card-value" id="est-runtime-24h" style="font-size:1.25rem;">Calculating...</div>
          <div class="card-sub" id="est-drop-24h">&Delta;V: -- mV / 24h</div>
        </div>
        <div class="card" style="background:#0d1117;padding:1rem;">
          <div class="card-label"><span>7-Day Trend Est.</span><span class="badge badge-blue">7 Days</span></div>
          <div class="card-value" id="est-runtime-7d" style="font-size:1.25rem;">Calculating...</div>
          <div class="card-sub" id="est-drop-7d">&Delta;V: -- mV / day avg</div>
        </div>
        <div class="card" style="background:#0d1117;padding:1rem;">
          <div class="card-label"><span>30-Day Autonomy Est.</span><span class="badge badge-amber">30 Days</span></div>
          <div class="card-value" id="est-runtime-30d" style="font-size:1.25rem;">Calculating...</div>
          <div class="card-sub" id="est-drop-30d">&Delta;V: -- mV / day avg</div>
        </div>
      </div>

      <div class="chart-container" style="height:280px;">
        <canvas id="batteryChart"></canvas>
      </div>
    </div>

    <!-- 3-Day 0:00 - 24:00 Diurnal Overlay Chart -->
    <div class="chart-section">
      <div class="chart-header">
        <div>
          <div class="chart-title">3-Day Diurnal Overlay (0:00 — 24:00)</div>
          <div class="subtitle">Comparing diurnal curves across the last 3 days (Extended Temp Range 10–75°C)</div>
        </div>
        <div class="btn-group" id="overlay-metric-toggle">
          <button class="active" data-metric="solar">Solar Panel</button>
          <button data-metric="lipo">LiPo Battery</button>
          <button data-metric="temp">Temperature</button>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="overlayChart"></canvas>
      </div>
    </div>

    <!-- 72-Hour Continuous Timeline History Chart -->
    <div class="chart-section">
      <div class="chart-header">
        <div>
          <div class="chart-title">Continuous Telemetry Timeline (Last 3 Days)</div>
          <div class="subtitle">Solar panel, LiPo battery voltage, and local enclosure temperature</div>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="historyChart"></canvas>
      </div>
    </div>

    <!-- Execution Cycle Benchmark Breakdown Chart -->
    <div class="chart-section">
      <div class="chart-header">
        <div>
          <div class="chart-title">Edge Execution &amp; Telemetry Roundtrip Benchmarks</div>
          <div class="subtitle" id="timing-subtitle">Stage durations: Sensor measurement, Wi-Fi association, DHCP IP, and TLS telemetry upload</div>
        </div>
        <div class="btn-group" id="benchmark-range-toggle">
          <button class="active" data-range="recent" data-days="0">Recent (30)</button>
          <button data-range="day" data-days="1">1 Day</button>
          <button data-range="week" data-days="7">1 Week</button>
          <button data-range="month" data-days="30">1 Month</button>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="timingChart"></canvas>
      </div>

      <!-- Execution Stage Durations Summary -->
      <div class="bench-grid">
        <div class="bench-item">
          <div class="bench-val" id="bench-measure">-- ms</div>
          <div class="bench-label">Sensor Measure</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-wifi">-- ms</div>
          <div class="bench-label">Wi-Fi Connect</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-ip">-- ms</div>
          <div class="bench-label">IP DHCP</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-dns">-- ms</div>
          <div class="bench-label">DNS Lookup</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-tcp">-- ms</div>
          <div class="bench-label">TCP Handshake</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-tls">-- ms</div>
          <div class="bench-label">TLS Handshake</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-post">-- ms</div>
          <div class="bench-label">POST &amp; Server</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-total">-- ms</div>
          <div class="bench-label">Total Active Time</div>
        </div>
      </div>
    </div>

    <!-- RF & BLE Activity Monitor Heatmap -->
    <div class="chart-section" id="rf-monitor-section">
      <div class="chart-header" style="cursor: pointer;" onclick="toggleRfMonitor(event)">
        <div>
          <div class="chart-title">
            <span>📡 2.4 GHz RF &amp; BLE Environmental Activity Monitor</span>
            <span class="badge badge-amber" style="margin-left:0.5rem; font-size:0.75rem;">Mode 3 / Monitor</span>
          </div>
          <div class="subtitle" id="rf-subtitle">Passive promiscuous RF packet density across channels 1–13 and BLE device discovery</div>
        </div>
        <div style="display:flex; align-items:center; gap:0.75rem;" onclick="event.stopPropagation()">
          <div class="btn-group" id="rf-view-toggle">
            <button class="active" data-rf-view="30m" onclick="switchRfView('30m')">Today (30m Slots)</button>
            <button data-rf-view="7d" onclick="switchRfView('7d')">7-Day Trend</button>
          </div>
          <select id="rf-palette-select" class="palette-select" onchange="changeRfPalette(this.value)" title="Heatmap Color Scheme">
            <option value="inferno">Inferno</option>
            <option value="viridis">Viridis</option>
            <option value="turbo">Turbo / Rainbow</option>
            <option value="amber" selected>Amber / Solar</option>
          </select>
          <button class="collapse-toggle-btn" id="rf-collapse-btn" onclick="toggleRfMonitor(event)" title="Toggle section">▼</button>
        </div>
      </div>

      <div id="rf-monitor-body">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem; flex-wrap:wrap; gap:0.5rem;">
          <div style="font-size:0.8rem; color:var(--text-muted);" id="rf-legend-title">Wi-Fi &amp; BLE Environmental Radio Activity</div>
          <div class="heatmap-legend" id="rf-legend" style="display:flex; align-items:center; gap:0.5rem;"></div>
        </div>
        <div class="heatmap-container" id="rf-heatmap-container">
          <canvas id="rfHeatmapCanvas"></canvas>
          <div class="heatmap-tooltip" id="rfHeatmapTooltip"></div>
        </div>

        <div class="bench-grid" style="margin-top: 1rem;">
          <div class="bench-item">
            <div class="bench-val" id="rf-busiest-ch">--</div>
            <div class="bench-label">Busiest Channel</div>
          </div>
          <div class="bench-item">
            <div class="bench-val" id="rf-max-pkts">-- pkts</div>
            <div class="bench-label">Peak Wi-Fi Activity</div>
          </div>
          <div class="bench-item">
            <div class="bench-val" id="rf-ble-count">--</div>
            <div class="bench-label">Max BLE Devices</div>
          </div>
          <div class="bench-item">
            <div class="bench-val" id="rf-cleanest-ch">--</div>
            <div class="bench-label">Cleanest Channel</div>
          </div>
        </div>
      </div>
    </div>

    <footer>
      <p>ESP32 Solar Telemetry Fleet &bull; Minimal SPIFFS &bull; Dual OTA &bull; Cloudflare Edge &amp; D1 Database</p>
      <p>
        <a href="https://github.com/kreier/solar" target="_blank">kreier/solar on GitHub</a> &bull;
        <span>Website v1.1.2</span> &bull;
        <span>Firmware v<span id="fw-version">1.0.2</span> (Stable)</span> &bull;
        <span class="badge badge-amber" style="padding:0.1rem 0.4rem;">v1.1.2 Canary</span> &bull;
        <a href="javascript:void(0)" onclick="openFlashModal()">Web Firmware Flasher</a>
      </p>
    </footer>
  </div>

  <!-- Firmware Flasher Modal Dialog -->
  <div id="flashModal" class="modal-backdrop" onclick="onModalBackdropClick(event)">
    <div class="modal-window" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div class="modal-title">
          <span>⚡ Web Firmware Installer</span>
          <span class="badge badge-amber" id="modal-ver-badge">v1.0.2 Stable</span>
        </div>
        <button class="modal-close-btn" onclick="closeFlashModal()" title="Close dialog">✕</button>
      </div>

      <div class="modal-tabs">
        <button id="tabBtnWebSerial" class="modal-tab-btn active" onclick="switchFlashTab('webserial')">Web Serial Install</button>
        <button id="tabBtnBinaries" class="modal-tab-btn" onclick="switchFlashTab('binaries')">Direct Binaries &amp; CLI</button>
      </div>

      <div class="modal-body">
        <!-- Tab 1: Web Serial Install -->
        <div id="flashTabWebSerial">
          <div id="serialStatusBanner" class="serial-status-banner supported">
            <div>
              <span id="serialStatusIcon">✅</span>
              <span id="serialStatusText">Web Serial API is supported in your browser! (Chrome, Edge, Brave, Opera)</span>
            </div>
          </div>

          <!-- Board & Version Selection Controls -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <div>
              <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:0.3rem;color:var(--text-muted);">Target Microcontroller Board:</label>
              <select id="flasherBoardSelect" style="width:100%;" onchange="updateFlasherManifest()">
                <option value="esp32" selected>ESP32 (WEMOS LOLIN32 / DevKit 4MB Flash)</option>
                <option value="esp32s3">ESP32-S3 (16MB Flash, 4MB OTA, LittleFS)</option>
                <option value="esp32c5">ESP32-C5 (Dual-Band 2.4/5GHz Wi-Fi 6)</option>
              </select>
            </div>
            <div>
              <label style="display:block;font-size:0.8rem;font-weight:600;margin-bottom:0.3rem;color:var(--text-muted);">Firmware Release Channel:</label>
              <select id="flasherVerSelect" style="width:100%;" onchange="updateFlasherManifest()">
                <option value="1.0.2" selected>v1.0.2 Stable (Production)</option>
                <option value="1.1.2-canary">v1.1.2 Canary (4 Modes, RF/BLE Sniffer, 1.1s Cycle)</option>
              </select>
            </div>
          </div>

          <div style="margin: 0.75rem 0 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
            Choose your installation mode:
          </div>

          <!-- Mode Radio Selection -->
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem;">
            <label id="modeCleanLabel" class="mode-card active" onclick="setFlashMode('clean')">
              <input type="radio" name="flashModeRadio" value="clean" checked style="margin-top: 0.2rem;">
              <div>
                <div class="mode-title">🧹 Clean Install (Full Firmware &amp; Erase Device)</div>
                <div class="mode-desc">For new or unconfigured boards. Installs bootloader, partitions, boot_app0, and app image. Prompts before formatting flash.</div>
              </div>
            </label>

            <label id="modeUpdateLabel" class="mode-card" onclick="setFlashMode('update')">
              <input type="radio" name="flashModeRadio" value="update" style="margin-top: 0.2rem;">
              <div>
                <div class="mode-title">⚡ Update Firmware Only (Keep Settings &amp; Data)</div>
                <div class="mode-desc">Flashes only application partition (0x10000). Preserves Wi-Fi credentials, device token, and NVS configuration.</div>
              </div>
            </label>
          </div>

          <!-- ESP Web Install Button -->
          <div class="install-button-wrapper">
            <esp-web-install-button id="espWebInstallBtn" manifest="manifest.json">
              <button slot="activate" class="install-action-btn" id="espActivateBtn">
                ⚡ Connect Board &amp; Flash Firmware
              </button>
              <span slot="unsupported" style="color:var(--temp);font-size:0.875rem;font-weight:600;">
                ⚠️ Web Serial is not supported in this browser. Please use Chrome, Edge, Brave, or Opera on desktop.
              </span>
              <span slot="not-allowed" style="color:var(--temp);font-size:0.875rem;font-weight:600;">
                ⚠️ Web Serial requires an HTTPS secure connection.
              </span>
            </esp-web-install-button>
          </div>

          <div class="flash-guide-card" style="margin-top: 1rem;">
            <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.4rem;">Quick Flashing Steps:</div>
            <ol style="padding-left: 1.25rem; font-size: 0.8rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 0.3rem;">
              <li>Connect your board (ESP32 / ESP32-S3 / ESP32-C5) to your computer with a USB data cable.</li>
              <li>Click the button above and select your serial port (e.g. <code>CP210x</code>, <code>CH340</code>, or <code>USB JTAG/CDC</code>).</li>
              <li>In <strong>Clean Install</strong> mode, confirm flash erase. In <strong>Update</strong> mode, existing settings are preserved.</li>
              <li>Wait for flashing to reach 100%. The node will reboot automatically into normal operation!</li>
            </ol>
          </div>
        </div>

        <!-- Tab 2: Direct Binaries & CLI -->
        <div id="flashTabBinaries" style="display: none;">
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem;">
            Download compiled binary files for manual flashing with <code>esptool.py</code> or PlatformIO across all supported architectures:
          </div>

          <div class="bin-grid">
            <a href="firmware/firmware-esp32-merged.bin" download class="bin-card">
              <div>
                <div style="font-weight: 600; font-size: 0.85rem;">firmware-esp32-merged.bin (ESP32 DevKit / LOLIN32)</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Complete merged flash image at offset 0x0 (Standard 4MB Minimal SPIFFS)</div>
              </div>
              <span class="badge badge-amber">Download</span>
            </a>

            <a href="firmware/firmware-esp32s3-merged.bin" download class="bin-card">
              <div>
                <div style="font-weight: 600; font-size: 0.85rem;">firmware-esp32s3-merged.bin (ESP32-S3 16MB)</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Dual 4MB OTA partitions with 8MB LittleFS at offset 0x0</div>
              </div>
              <span class="badge badge-blue">Download</span>
            </a>

            <a href="firmware/firmware-esp32c5-merged.bin" download class="bin-card">
              <div>
                <div style="font-weight: 600; font-size: 0.85rem;">firmware-esp32c5-merged.bin (ESP32-C5 Wi-Fi 6)</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Dual-band 2.4/5GHz Wi-Fi 6 image at offset 0x0</div>
              </div>
              <span class="badge badge-purple">Download</span>
            </a>

            <a href="firmware/firmware.bin" download class="bin-card">
              <div>
                <div style="font-weight: 600; font-size: 0.85rem;">firmware.bin (OTA Application Binary Only)</div>
                <div style="font-size: 0.75rem; color: var(--text-muted);">Flash at 0x10000 or use for Over-The-Air HTTP update</div>
              </div>
              <span class="badge badge-green">Download</span>
            </a>
          </div>

          <div style="margin-top: 1.25rem;">
            <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.3rem;">CLI Flash Command (esptool):</div>
            <div class="cli-box">
esptool.py --chip esp32 --port /dev/ttyUSB0 --baud 921600 write_flash 0x0 firmware-esp32-merged.bin
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = "${apiBase}";

    let currentStationId = "";
    let cachedHistory = [];
    let activeMetric = "solar";
    let batteryRangeDays = 1;
    let benchmarkRange = "recent";

    let overlayChart = null;
    let historyChart = null;
    let timingChart = null;
    let batteryChart = null;

    async function init() {
      setupEventListeners();
      checkSerialSupport();
      await loadStations();

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("flash") === "1" || urlParams.get("flash") === "true") {
        setTimeout(openFlashModal, 250);
      }
    }

    function setupEventListeners() {
      document.getElementById("station-select").addEventListener("change", (e) => {
        currentStationId = e.target.value;
        loadStationData(currentStationId);
      });

      document.getElementById("refresh-btn").addEventListener("click", () => {
        if (currentStationId) loadStationData(currentStationId);
      });

      document.querySelectorAll("#overlay-metric-toggle button").forEach(btn => {
        btn.addEventListener("click", (e) => {
          document.querySelectorAll("#overlay-metric-toggle button").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          activeMetric = btn.dataset.metric;
          renderOverlayChart(cachedHistory, activeMetric);
        });
      });

      document.querySelectorAll("#battery-range-toggle button").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          document.querySelectorAll("#battery-range-toggle button").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          batteryRangeDays = parseInt(btn.dataset.days, 10);
          await loadBatteryHistory(currentStationId, batteryRangeDays);
        });
      });

      document.querySelectorAll("#benchmark-range-toggle button").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          document.querySelectorAll("#benchmark-range-toggle button").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          benchmarkRange = btn.dataset.range;
          const days = parseInt(btn.dataset.days, 10);
          await loadBenchmarkHistory(currentStationId, benchmarkRange, days);
        });
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeFlashModal();
      });
    }

    function openFlashModal() {
      const modal = document.getElementById("flashModal");
      if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
      }
      checkSerialSupport();
    }

    function closeFlashModal() {
      const modal = document.getElementById("flashModal");
      if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "";
      }
    }

    function onModalBackdropClick(e) {
      if (e.target.id === "flashModal") closeFlashModal();
    }

    function switchFlashTab(tab) {
      const isWebSerial = (tab === "webserial");
      document.getElementById("flashTabWebSerial").style.display = isWebSerial ? "block" : "none";
      document.getElementById("flashTabBinaries").style.display = isWebSerial ? "none" : "block";
      document.getElementById("tabBtnWebSerial").classList.toggle("active", isWebSerial);
      document.getElementById("tabBtnBinaries").classList.toggle("active", !isWebSerial);
    }

    let currentFlashMode = "clean";
    function setFlashMode(mode) {
      currentFlashMode = mode;
      document.getElementById("modeCleanLabel").classList.toggle("active", mode === "clean");
      document.getElementById("modeUpdateLabel").classList.toggle("active", mode === "update");
      updateFlasherManifest();
    }

    function updateFlasherManifest() {
      const board = document.getElementById("flasherBoardSelect").value;
      const ver = document.getElementById("flasherVerSelect").value;
      const isUpdate = (currentFlashMode === "update");

      const btn = document.getElementById("espWebInstallBtn");
      let manifestFile = "manifest.json";
      if (ver === "1.1.2-canary" || ver === "1.1.1-canary" || ver === "1.1.0-canary") {
        manifestFile = isUpdate ? "manifest-canary-update.json" : "manifest-canary.json";
      } else {
        manifestFile = isUpdate ? "manifest-update.json" : "manifest.json";
      }
      btn.setAttribute("manifest", manifestFile);

      document.getElementById("modal-ver-badge").textContent = \`\${ver} (\${board.toUpperCase()})\`;
      const actBtn = document.getElementById("espActivateBtn");
      if (actBtn) {
        actBtn.textContent = isUpdate ? \`⚡ Connect & Update Firmware (\${board.toUpperCase()})\` : \`⚡ Connect & Flash Full Firmware (\${board.toUpperCase()})\`;
      }
    }

    function checkSerialSupport() {
      const banner = document.getElementById("serialStatusBanner");
      const icon = document.getElementById("serialStatusIcon");
      const text = document.getElementById("serialStatusText");

      if ("serial" in navigator) {
        banner.className = "serial-status-banner supported";
        icon.textContent = "✅";
        text.textContent = "Web Serial API is ready! Connect via Chrome, Edge, Brave, or Opera.";
      } else {
        banner.className = "serial-status-banner unsupported";
        icon.textContent = "⚠️";
        text.textContent = "Web Serial API is not supported in this browser. Use Chrome or Edge on desktop.";
      }
    }

    async function loadStations() {
      try {
        const resp = await fetch(API_BASE + "/api/stations");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const stations = await resp.json();

        const select = document.getElementById("station-select");
        select.innerHTML = "";

        if (stations && stations.length > 0) {
          stations.forEach((st) => {
            const opt = document.createElement("option");
            opt.value = st.station_id;
            opt.textContent = st.station_id;
            select.appendChild(opt);
          });

          // Check for URL query param or select S3 / first station
          const urlParams = new URLSearchParams(window.location.search);
          const urlStation = urlParams.get("station");
          if (urlStation && stations.some(s => s.station_id.toLowerCase() === urlStation.toLowerCase())) {
            currentStationId = stations.find(s => s.station_id.toLowerCase() === urlStation.toLowerCase()).station_id;
          } else {
            currentStationId = stations[0].station_id;
          }
          select.value = currentStationId;
          loadStationData(currentStationId);
        } else {
          document.getElementById("station-subtitle").textContent = "No registered stations found in D1 database.";
        }
      } catch (err) {
        console.warn("Failed to load stations from edge API, loading demo mode:", err);
        const select = document.getElementById("station-select");
        select.innerHTML = '<option value="demo">Demo Station</option>';
        currentStationId = "demo";
        const mock = loadMockData(3);
        cachedHistory = mock;
        document.getElementById("station-subtitle").innerHTML =
          "Station: <b>demo</b> • Location: <b>Demo Mode</b> • <span class='badge badge-amber'>Node FW v1.0.2</span> • 432 demo telemetry points";
        updateSummaryCards({ station_id: "demo", location: "Demo Mode", firmware_version: "1.0.2" }, mock[mock.length - 1]);
        renderOverlayChart(mock, activeMetric);
        renderHistoryChart(mock);
        renderTimingChart(mock, benchmarkRange);
        renderBatteryAnalytics(mock);
        renderRfHeatmap(mock, currentRfView);
      }
    }

    async function loadStationData(stationId) {
      document.getElementById("station-subtitle").textContent = "Fetching telemetry for " + stationId + "...";
      try {
        const resp = await fetch(API_BASE + "/api/history?station_id=" + encodeURIComponent(stationId) + "&days=3");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();

        cachedHistory = data.measurements || [];
        try { updateSummaryCards(data.station, cachedHistory[cachedHistory.length - 1]); } catch(e) { console.error("updateSummaryCards error:", e); }
        try { renderOverlayChart(cachedHistory, activeMetric); } catch(e) { console.error("renderOverlayChart error:", e); }
        try { renderHistoryChart(cachedHistory); } catch(e) { console.error("renderHistoryChart error:", e); }
        try { renderTimingChart(cachedHistory, benchmarkRange); } catch(e) { console.error("renderTimingChart error:", e); }
        try { renderBatteryAnalytics(cachedHistory); } catch(e) { console.error("renderBatteryAnalytics error:", e); }
        try { renderRfHeatmap(cachedHistory, currentRfView); } catch(e) { console.error("renderRfHeatmap error:", e); }

        const nodeFw = (data.station && data.station.firmware_version) ? ("Node FW v" + data.station.firmware_version) : "Node FW v1.0.2";
        const canaryBadge = (data.station && data.station.is_canary) ? " <span class='badge badge-blue'>Canary</span>" : "";
        document.getElementById("station-subtitle").innerHTML =
          "Station: <b>" + stationId + "</b> • Location: <b>" + (data.station?.location || "Solar Site") + "</b>" +
          " • <span class='badge badge-amber'>" + nodeFw + "</span>" + canaryBadge +
          " • " + cachedHistory.length + " telemetry points recorded";
      } catch (err) {
        console.warn("API request failed:", err);
        document.getElementById("station-subtitle").innerHTML =
          "<span style='color:#ef4444;'>Failed to load telemetry for " + stationId + ". (" + err.message + ")</span>";
      }
    }

    async function loadBatteryHistory(stationId, days) {
      if (!stationId) return;
      try {
        const resp = await fetch(API_BASE + "/api/history?station_id=" + encodeURIComponent(stationId) + "&days=" + days);
        if (resp.ok) {
          const data = await resp.json();
          renderBatteryAnalytics(data.measurements || []);
          return;
        }
      } catch (e) {
        console.warn("Failed to fetch extended battery history, falling back to cached telemetry:", e);
      }
      renderBatteryAnalytics(cachedHistory);
    }

    async function loadBenchmarkHistory(stationId, range, days) {
      if (!stationId) return;
      if (range === "recent" || (days <= 3 && cachedHistory.length >= 10)) {
        renderTimingChart(cachedHistory, range);
        return;
      }
      try {
        const resp = await fetch(API_BASE + "/api/history?station_id=" + encodeURIComponent(stationId) + "&days=" + days);
        if (resp.ok) {
          const data = await resp.json();
          renderTimingChart(data.measurements || [], range);
          return;
        }
      } catch (e) {
        console.warn("Failed to fetch extended benchmark data, falling back:", e);
      }
      if (days > 3) {
        const mockExt = loadMockData(days);
        renderTimingChart(mockExt, range);
        renderRfHeatmap(mockExt, currentRfView);
      } else {
        renderTimingChart(cachedHistory, range);
        renderRfHeatmap(cachedHistory, currentRfView);
      }
    }

    function updateSummaryCards(station, latest) {
      if (!latest && !station) return;

      const solarMv = latest ? latest.solar_mv : (station.solar_mv || 0);
      const lipoMv  = latest ? latest.lipo_mv  : (station.battery_mv || 3800);
      const tempC   = latest ? latest.temp_c   : (station.temp_c || 28.5);

      const solarV = (solarMv / 1000).toFixed(2);
      const lipoV  = (lipoMv / 1000).toFixed(2);

      const solarEl = document.getElementById("solar-val");
      if (solarEl) solarEl.innerHTML = solarV + ' <span class="card-unit">V</span>';

      const batteryEl = document.getElementById("battery-val");
      if (batteryEl) batteryEl.innerHTML = lipoV + ' <span class="card-unit">V</span>';

      const tempEl = document.getElementById("temp-val");
      if (tempEl) tempEl.innerHTML = tempC.toFixed(1) + ' <span class="card-unit">°C</span>';

      const cycleEl = document.getElementById("cycle-total");
      if (cycleEl) {
        if (latest && (latest.cycle_total_ms || latest.cycle_wifi_ms || latest.cycle_measure_ms)) {
          const total = latest.cycle_total_ms || ((latest.cycle_measure_ms || 0) + (latest.cycle_wifi_ms || 0) + (latest.cycle_ip_ms || 0) + (latest.cycle_upload_ms || 0));
          cycleEl.innerHTML = total + ' <span class="card-unit">ms</span>';
        } else {
          cycleEl.innerHTML = '-- <span class="card-unit">ms</span>';
        }
      }

      // Check for INA3221 Telemetry in raw payload
      const inaCard = document.getElementById("ina3221-card");
      let hasIna = false;
      if (latest && latest.raw_payload) {
        try {
          const raw = typeof latest.raw_payload === "string" ? JSON.parse(latest.raw_payload) : latest.raw_payload;
          if (raw && raw.ina3221) {
            const ina = raw.ina3221;
            hasIna = true;
            if (inaCard) {
              inaCard.style.display = "block";
              if (ina.ch1_solar) {
                const elPwr = document.getElementById("ina-solar-pwr");
                const elDet = document.getElementById("ina-solar-details");
                if (elPwr) elPwr.textContent = (ina.ch1_solar.power_mw || 0).toFixed(1) + " mW";
                if (elDet) elDet.textContent =
                  \`\${(ina.ch1_solar.voltage_v || 0).toFixed(2)} V • \${(ina.ch1_solar.current_ma || 0).toFixed(1)} mA\`;
              }
              if (ina.ch3_load) {
                const elPwr = document.getElementById("ina-load-pwr");
                const elDet = document.getElementById("ina-load-details");
                if (elPwr) elPwr.textContent = (ina.ch3_load.power_mw || 0).toFixed(1) + " mW";
                if (elDet) elDet.textContent =
                  \`\${(ina.ch3_load.voltage_v || 0).toFixed(2)} V • \${(ina.ch3_load.current_ma || 0).toFixed(1)} mA • Res: \${(ina.ch3_load.resistance_ohm || 0).toFixed(1)} Ω\`;
              }
            }
          }
        } catch (e) {
          // No INA3221 in payload
        }
      }
      if (!hasIna && inaCard) {
        inaCard.style.display = "none";
      }
    }

    function renderBatteryAnalytics(records) {
      if (!records || records.length === 0) return;

      const now = Date.now();
      const cutoff24h = now - 24 * 3600 * 1000;
      const cutoff7d  = now - 7 * 24 * 3600 * 1000;
      const cutoff30d = now - 30 * 24 * 3600 * 1000;

      const latest = records[records.length - 1];
      const latestV = latest.lipo_v || (latest.lipo_mv / 1000.0);
      const latestMv = latest.lipo_mv || Math.round(latestV * 1000);

      // Usable headroom to 3.3V cutoff
      const headroomMv = Math.max(0, latestMv - 3300);

      // 1. 24-Hour calculation
      const r24h = records.filter(r => new Date(r.timestamp).getTime() >= cutoff24h);
      if (r24h.length >= 2) {
        const first24 = r24h[0];
        const firstMv = first24.lipo_mv || Math.round((first24.lipo_v || 3.8) * 1000);
        const deltaMv = latestMv - firstMv; // positive = net charged, negative = discharged
        const elDrop24 = document.getElementById("est-drop-24h");
        const elRun24  = document.getElementById("est-runtime-24h");
        if (elDrop24) elDrop24.textContent = \`ΔV: \${deltaMv >= 0 ? "+" : ""}\${deltaMv} mV / 24h\`;

        if (elRun24) {
          if (deltaMv >= 0) {
            elRun24.innerHTML = "<span style='color:#10b981;'>Self-Sustaining</span>";
          } else {
            const dropPerDay = Math.abs(deltaMv);
            const daysLeft = (headroomMv / dropPerDay).toFixed(1);
            const hoursLeft = Math.round((headroomMv / dropPerDay) * 24);
            elRun24.textContent = \`\${daysLeft} Days (\${hoursLeft}h)\`;
          }
        }
      } else {
        const elRun24 = document.getElementById("est-runtime-24h");
        if (elRun24) elRun24.textContent = "> 14 Days";
      }

      // 2. 7-Day Trend calculation
      const r7d = records.filter(r => new Date(r.timestamp).getTime() >= cutoff7d);
      if (r7d.length >= 2) {
        const first7 = r7d[0];
        const firstMv = first7.lipo_mv || Math.round((first7.lipo_v || 3.8) * 1000);
        const daySpan = Math.max(1, (new Date(latest.timestamp) - new Date(first7.timestamp)) / (24 * 3600 * 1000));
        const avgDailyDrop = (firstMv - latestMv) / daySpan;

        const elRun7 = document.getElementById("est-runtime-7d");
        const elDrop7 = document.getElementById("est-drop-7d");
        if (avgDailyDrop <= 0) {
          if (elRun7) elRun7.innerHTML = "<span style='color:#10b981;'>Solar Float / Stable</span>";
          if (elDrop7) elDrop7.textContent = \`Net Gain: +\${Math.abs(avgDailyDrop).toFixed(1)} mV/day\`;
        } else {
          const daysLeft = (headroomMv / avgDailyDrop).toFixed(1);
          if (elRun7) elRun7.textContent = \`\${daysLeft} Days Autonomy\`;
          if (elDrop7) elDrop7.textContent = \`Avg drop: \${avgDailyDrop.toFixed(1)} mV/day\`;
        }
      } else {
        const elRun7 = document.getElementById("est-runtime-7d");
        if (elRun7) elRun7.textContent = "~ 21 Days Autonomy";
      }

      // 3. 30-Day Autonomy calculation
      const r30d = records.filter(r => new Date(r.timestamp).getTime() >= cutoff30d);
      if (r30d.length >= 2) {
        const first30 = r30d[0];
        const firstMv = first30.lipo_mv || Math.round((first30.lipo_v || 3.8) * 1000);
        const daySpan = Math.max(1, (new Date(latest.timestamp) - new Date(first30.timestamp)) / (24 * 3600 * 1000));
        const avgDailyDrop = (firstMv - latestMv) / daySpan;

        const elRun30 = document.getElementById("est-runtime-30d");
        const elDrop30 = document.getElementById("est-drop-30d");
        if (avgDailyDrop <= 0) {
          if (elRun30) elRun30.innerHTML = "<span style='color:#10b981;'>Infinite Autonomy</span>";
          if (elDrop30) elDrop30.textContent = "Daily Solar Replenishment";
        } else {
          const daysLeft = (headroomMv / avgDailyDrop).toFixed(1);
          if (elRun30) elRun30.textContent = \`\${daysLeft} Days\`;
          if (elDrop30) elDrop30.textContent = \`30d Trend: \${avgDailyDrop.toFixed(1)} mV/day\`;
        }
      } else {
        const elRun30 = document.getElementById("est-runtime-30d");
        if (elRun30) elRun30.textContent = "Infinite (Solar Float)";
      }

      // Render Battery Timeline Chart
      const batteryCanvas = document.getElementById("batteryChart");
      if (!batteryCanvas) return;
      const ctx = batteryCanvas.getContext("2d");
      const labels = records.map(r => {
        const d = new Date(r.timestamp);
        return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      });
      const data = records.map(r => r.lipo_v || (r.lipo_mv / 1000.0));

      const validValues = data.filter(v => v != null && !isNaN(v) && v > 0);
      const minVal = validValues.length ? Math.min(...validValues) : 3.3;
      const maxVal = validValues.length ? Math.max(...validValues) : 4.2;
      const yMin = Math.max(0, Number((Math.floor(minVal * 10) / 10 - 0.2).toFixed(1)));
      const yMax = Number((Math.ceil(maxVal * 10) / 10 + 0.2).toFixed(1));

      if (batteryChart) batteryChart.destroy();
      batteryChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [{
            label: "Battery Voltage (V)",
            data,
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.08)",
            borderWidth: 2,
            fill: true,
            pointRadius: records.length > 100 ? 0 : 2,
            tension: 0.2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { color: "#21262d" }, ticks: { maxTicksLimit: 8, color: "#8b949e" } },
            y: { min: yMin, max: yMax, grid: { color: "#21262d" }, ticks: { color: "#8b949e" }, title: { display: true, text: "Battery (V)", color: "#10b981" } }
          },
          plugins: {
            legend: { labels: { color: "#f0f6fc" } }
          }
        }
      });
    }

    function renderOverlayChart(records, metric) {
      const ctx = document.getElementById("overlayChart").getContext("2d");

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;

      const dayToday = [];
      const dayYesterday = [];
      const day2Ago = [];

      let maxRecordedTemp = 0;

      records.forEach(r => {
        const t = new Date(r.timestamp).getTime();
        const diffDays = Math.floor((todayStart + oneDayMs - 1 - t) / oneDayMs);

        const d = new Date(r.timestamp);
        const hourOfDay = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

        let val = 0;
        if (metric === "solar") val = r.solar_v || (r.solar_mv / 1000.0);
        else if (metric === "lipo") val = r.lipo_v || (r.lipo_mv / 1000.0);
        else if (metric === "temp") {
          val = r.temp_c;
          if (val > maxRecordedTemp) maxRecordedTemp = val;
        }

        const pt = { x: hourOfDay, y: Number(val.toFixed(2)) };

        if (diffDays === 0) dayToday.push(pt);
        else if (diffDays === 1) dayYesterday.push(pt);
        else if (diffDays === 2) day2Ago.push(pt);
      });

      [dayToday, dayYesterday, day2Ago].forEach(arr => arr.sort((a, b) => a.x - b.x));

      // Dynamic Y-axis limits ensuring enclosure temperature up to 75°C is never clipped!
      const metricLabels = {
        solar: { label: "Solar Panel Voltage (V)", unit: "V", yMin: 0, yMax: 6 },
        lipo:  { label: "LiPo Battery Voltage (V)", unit: "V", yMin: 3.0, yMax: 4.4 },
        temp:  { label: "Temperature (°C)", unit: "°C", yMin: 10, yMax: Math.max(75, Math.ceil((maxRecordedTemp + 5) / 5) * 5) }
      };

      const cfg = metricLabels[metric];

      if (overlayChart) overlayChart.destroy();

      overlayChart = new Chart(ctx, {
        type: "line",
        data: {
          datasets: [
            {
              label: "Today",
              data: dayToday,
              borderColor: "#f59e0b",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              borderWidth: 3,
              tension: 0.3,
              pointRadius: 2
            },
            {
              label: "Yesterday",
              data: dayYesterday,
              borderColor: "#3b82f6",
              borderDash: [4, 4],
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 1
            },
            {
              label: "2 Days Ago",
              data: day2Ago,
              borderColor: "#a855f7",
              borderDash: [2, 2],
              borderWidth: 1.5,
              tension: 0.3,
              pointRadius: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              type: "linear",
              min: 0,
              max: 24,
              grid: { color: "#21262d" },
              ticks: {
                stepSize: 2,
                callback: (v) => {
                  const h = Math.floor(v);
                  return (h < 10 ? "0" + h : h) + ":00";
                },
                color: "#8b949e"
              },
              title: { display: true, text: "Time of Day (00:00 - 24:00)", color: "#8b949e" }
            },
            y: {
              min: cfg.yMin,
              max: cfg.yMax,
              grid: { color: "#21262d" },
              ticks: { color: "#8b949e" },
              title: { display: true, text: cfg.label, color: "#8b949e" }
            }
          },
          plugins: {
            legend: { labels: { color: "#f0f6fc" } },
            tooltip: {
              callbacks: {
                title: (items) => {
                  if (!items.length) return "";
                  const val = items[0].parsed.x;
                  const h = Math.floor(val);
                  const m = Math.floor((val - h) * 60);
                  return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
                },
                label: (ctx) => \`\${ctx.dataset.label}: \${ctx.parsed.y} \${cfg.unit}\`
              }
            }
          }
        }
      });
    }

    function renderHistoryChart(records) {
      const ctx = document.getElementById("historyChart").getContext("2d");

      const labels = records.map(r => {
        const d = new Date(r.timestamp);
        return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " +
               d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      });

      const solarData = records.map(r => r.solar_v || (r.solar_mv / 1000.0));
      const lipoData  = records.map(r => r.lipo_v  || (r.lipo_mv  / 1000.0));
      const tempData  = records.map(r => r.temp_c);

      const maxTemp = Math.max(...tempData, 0);
      const tempYMax = Math.max(75, Math.ceil((maxTemp + 5) / 5) * 5);

      if (historyChart) historyChart.destroy();

      historyChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Solar Panel (V)",
              data: solarData,
              borderColor: "#f59e0b",
              backgroundColor: "rgba(245, 158, 11, 0.05)",
              yAxisID: "y",
              tension: 0.2,
              pointRadius: 1
            },
            {
              label: "LiPo Battery (V)",
              data: lipoData,
              borderColor: "#10b981",
              yAxisID: "y",
              tension: 0.2,
              pointRadius: 1
            },
            {
              label: "Temperature (°C)",
              data: tempData,
              borderColor: "#ef4444",
              borderDash: [3, 3],
              yAxisID: "y1",
              tension: 0.2,
              pointRadius: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          scales: {
            x: {
              grid: { color: "#21262d" },
              ticks: { maxTicksLimit: 12, color: "#8b949e" }
            },
            y: {
              position: "left",
              min: 0,
              max: 6,
              grid: { color: "#21262d" },
              ticks: { color: "#8b949e" },
              title: { display: true, text: "Voltage (V)", color: "#8b949e" }
            },
            y1: {
              position: "right",
              min: 10,
              max: tempYMax,
              grid: { drawOnChartArea: false },
              ticks: { color: "#ef4444" },
              title: { display: true, text: "Temperature (°C)", color: "#ef4444" }
            }
          },
          plugins: {
            legend: { labels: { color: "#f0f6fc" } }
          }
        }
      });
    }

    function aggregateTimingRecords(records, range) {
      const normalized = (records || []).map(r => {
        let measure = r.cycle_measure_ms;
        let wifi = r.cycle_wifi_ms;
        let ip = r.cycle_ip_ms;
        let dns = r.cycle_dns_ms;
        let tcp = r.cycle_tcp_ms;
        let tls = r.cycle_tls_ms;
        let post = r.cycle_post_ms;
        let server = r.cycle_server_ms;
        let upload = r.cycle_upload_ms;
        let total = r.cycle_total_ms;
        if (r.raw_payload) {
          try {
            const raw = typeof r.raw_payload === "string" ? JSON.parse(r.raw_payload) : r.raw_payload;
            const cur = raw?.current_cycle;
            const prev = raw?.prev_cycle;
            measure = measure ?? prev?.measure_ms ?? cur?.measure_ms ?? null;
            wifi = wifi ?? prev?.wifi_connect_ms ?? cur?.wifi_connect_ms ?? null;
            ip = ip ?? prev?.ip_obtain_ms ?? cur?.ip_obtain_ms ?? null;
            dns = dns ?? prev?.dns_ms ?? cur?.dns_ms ?? null;
            tcp = tcp ?? prev?.tcp_ms ?? cur?.tcp_ms ?? null;
            tls = tls ?? prev?.tls_ms ?? cur?.tls_ms ?? null;
            post = post ?? prev?.post_ms ?? cur?.post_ms ?? null;
            server = server ?? prev?.server_ms ?? cur?.server_ms ?? null;
            upload = upload ?? prev?.upload_ms ?? null;
            total = total ?? prev?.total_cycle_ms ?? (upload && wifi && measure ? (measure + wifi + (ip || 0) + upload) : null);
          } catch(e) {}
        }
        return {
          ...r,
          cycle_measure_ms: measure,
          cycle_wifi_ms: wifi,
          cycle_ip_ms: ip,
          cycle_dns_ms: dns,
          cycle_tcp_ms: tcp,
          cycle_tls_ms: tls,
          cycle_post_ms: post,
          cycle_server_ms: server,
          cycle_upload_ms: upload,
          cycle_total_ms: total
        };
      });
      const timed = normalized.filter(r => r.cycle_measure_ms != null || r.cycle_wifi_ms != null);
      if (timed.length === 0) return { labels: [], measureMs: [], wifiMs: [], ipMs: [], dnsMs: [], tcpMs: [], tlsMs: [], postMs: [], uploadMs: [], timedRecords: [] };

      const now = Date.now();

      if (range === "recent") {
        const slice = timed.slice(-30);
        return {
          labels: slice.map(r => new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
          measureMs: slice.map(r => r.cycle_measure_ms || 0),
          wifiMs: slice.map(r => r.cycle_wifi_ms || 0),
          ipMs: slice.map(r => r.cycle_ip_ms || 0),
          dnsMs: slice.map(r => r.cycle_dns_ms || 0),
          tcpMs: slice.map(r => r.cycle_tcp_ms || 0),
          tlsMs: slice.map(r => r.cycle_tls_ms || 0),
          postMs: slice.map(r => (r.cycle_post_ms || 0) + (r.cycle_server_ms || 0)),
          uploadMs: slice.map(r => r.cycle_upload_ms || 0),
          timedRecords: slice
        };
      }

      if (range === "day") {
        const cutoff = now - 24 * 60 * 60 * 1000;
        const dayRecords = timed.filter(r => new Date(r.timestamp).getTime() >= cutoff);
        const dataset = dayRecords.length > 0 ? dayRecords : timed.slice(-144);
        return {
          labels: dataset.map(r => new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
          measureMs: dataset.map(r => r.cycle_measure_ms || 0),
          wifiMs: dataset.map(r => r.cycle_wifi_ms || 0),
          ipMs: dataset.map(r => r.cycle_ip_ms || 0),
          dnsMs: dataset.map(r => r.cycle_dns_ms || 0),
          tcpMs: dataset.map(r => r.cycle_tcp_ms || 0),
          tlsMs: dataset.map(r => r.cycle_tls_ms || 0),
          postMs: dataset.map(r => (r.cycle_post_ms || 0) + (r.cycle_server_ms || 0)),
          uploadMs: dataset.map(r => r.cycle_upload_ms || 0),
          timedRecords: dataset
        };
      }

      if (range === "week") {
        const cutoff = now - 7 * 24 * 60 * 60 * 1000;
        const weekRecords = timed.filter(r => new Date(r.timestamp).getTime() >= cutoff);
        const dataset = weekRecords.length > 0 ? weekRecords : timed;

        const buckets = {};
        dataset.forEach(r => {
          const d = new Date(r.timestamp);
          d.setMinutes(0, 0, 0);
          const key = d.toISOString();
          if (!buckets[key]) buckets[key] = { labelDate: d, records: [] };
          buckets[key].records.push(r);
        });

        const sortedKeys = Object.keys(buckets).sort();
        const labels = sortedKeys.map(k => {
          const d = buckets[k].labelDate;
          const dayName = d.toLocaleDateString([], { weekday: "short" });
          const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return \`\${dayName} \${timeStr}\`;
        });

        // "week uses the worst value each hour"
        const worstRecords = sortedKeys.map(k => {
          const recs = buckets[k].records;
          let worst = recs[0];
          let maxTotal = 0;
          recs.forEach(r => {
            const tot = r.cycle_total_ms || ((r.cycle_measure_ms || 0) + (r.cycle_wifi_ms || 0) + (r.cycle_ip_ms || 0) + (r.cycle_upload_ms || 0));
            if (tot >= maxTotal) {
              maxTotal = tot;
              worst = r;
            }
          });
          return worst;
        });

        return {
          labels,
          measureMs: worstRecords.map(r => r.cycle_measure_ms || 0),
          wifiMs: worstRecords.map(r => r.cycle_wifi_ms || 0),
          ipMs: worstRecords.map(r => r.cycle_ip_ms || 0),
          dnsMs: worstRecords.map(r => r.cycle_dns_ms || 0),
          tcpMs: worstRecords.map(r => r.cycle_tcp_ms || 0),
          tlsMs: worstRecords.map(r => r.cycle_tls_ms || 0),
          postMs: worstRecords.map(r => (r.cycle_post_ms || 0) + (r.cycle_server_ms || 0)),
          uploadMs: worstRecords.map(r => r.cycle_upload_ms || 0),
          timedRecords: worstRecords
        };
      }

      if (range === "month") {
        const cutoff = now - 30 * 24 * 60 * 60 * 1000;
        const monthRecords = timed.filter(r => new Date(r.timestamp).getTime() >= cutoff);
        const dataset = monthRecords.length > 0 ? monthRecords : timed;

        const buckets = {};
        dataset.forEach(r => {
          const d = new Date(r.timestamp);
          d.setHours(0, 0, 0, 0);
          const key = d.toISOString().split("T")[0];
          if (!buckets[key]) buckets[key] = { labelDate: d, measure: [], wifi: [], ip: [], dns: [], tcp: [], tls: [], post: [], upload: [], total: [] };
          buckets[key].measure.push(r.cycle_measure_ms || 0);
          buckets[key].wifi.push(r.cycle_wifi_ms || 0);
          buckets[key].ip.push(r.cycle_ip_ms || 0);
          buckets[key].dns.push(r.cycle_dns_ms || 0);
          buckets[key].tcp.push(r.cycle_tcp_ms || 0);
          buckets[key].tls.push(r.cycle_tls_ms || 0);
          buckets[key].post.push((r.cycle_post_ms || 0) + (r.cycle_server_ms || 0));
          buckets[key].upload.push(r.cycle_upload_ms || 0);
          buckets[key].total.push(r.cycle_total_ms || 0);
        });

        const sortedKeys = Object.keys(buckets).sort();
        const labels = sortedKeys.map(k => {
          const d = buckets[k].labelDate;
          return d.toLocaleDateString([], { month: "short", day: "numeric" });
        });

        const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

        return {
          labels,
          measureMs: sortedKeys.map(k => avg(buckets[k].measure)),
          wifiMs: sortedKeys.map(k => avg(buckets[k].wifi)),
          ipMs: sortedKeys.map(k => avg(buckets[k].ip)),
          dnsMs: sortedKeys.map(k => avg(buckets[k].dns)),
          tcpMs: sortedKeys.map(k => avg(buckets[k].tcp)),
          tlsMs: sortedKeys.map(k => avg(buckets[k].tls)),
          postMs: sortedKeys.map(k => avg(buckets[k].post)),
          uploadMs: sortedKeys.map(k => avg(buckets[k].upload)),
          timedRecords: dataset
        };
      }

      return { labels: [], measureMs: [], wifiMs: [], ipMs: [], dnsMs: [], tcpMs: [], tlsMs: [], postMs: [], uploadMs: [], timedRecords: [] };
    }

    function renderTimingChart(records, range = "recent") {
      const canvas = document.getElementById("timingChart");
      if (!canvas) return;
      const ctx = canvas.getContext("2d");

      const subtitle = document.getElementById("timing-subtitle");
      if (subtitle) {
        if (range === "recent") {
          subtitle.textContent = "Last 30 recorded execution cycles (individual breakdown)";
        } else if (range === "day") {
          subtitle.textContent = "Past 24-hour cycle execution history (active wake duration)";
        } else if (range === "week") {
          subtitle.textContent = "7-day execution trends (hourly averaged stage durations)";
        } else if (range === "month") {
          subtitle.textContent = "30-day historical latency (daily averaged stage durations)";
        }
      }

      const aggregated = aggregateTimingRecords(records, range);
      const labels = aggregated.labels;
      const measureMs = aggregated.measureMs;
      const wifiMs    = aggregated.wifiMs;
      const ipMs      = aggregated.ipMs;
      const dnsMs     = aggregated.dnsMs;
      const tcpMs     = aggregated.tcpMs;
      const tlsMs     = aggregated.tlsMs;
      const postMs    = aggregated.postMs;
      const uploadMs  = aggregated.uploadMs;

      if (aggregated.timedRecords && aggregated.timedRecords.length > 0) {
        const trs = aggregated.timedRecords;
        const avg = (fn) => Math.round(trs.reduce((acc, r) => acc + (fn(r) || 0), 0) / trs.length);
        const avgMeasure = avg(r => r.cycle_measure_ms);
        const avgWifi    = avg(r => r.cycle_wifi_ms);
        const avgIp      = avg(r => r.cycle_ip_ms);
        const avgDns     = avg(r => r.cycle_dns_ms);
        const avgTcp     = avg(r => r.cycle_tcp_ms);
        const avgTls     = avg(r => r.cycle_tls_ms);
        const avgPost    = avg(r => (r.cycle_post_ms || 0) + (r.cycle_server_ms || 0));
        const avgTotal   = avg(r => r.cycle_total_ms || ((r.cycle_measure_ms || 0) + (r.cycle_wifi_ms || 0) + (r.cycle_ip_ms || 0) + (r.cycle_upload_ms || 0)));

        const elMeasure = document.getElementById("bench-measure");
        if (elMeasure) elMeasure.textContent = avgMeasure + " ms";
        const elWifi = document.getElementById("bench-wifi");
        if (elWifi) elWifi.textContent = avgWifi + " ms";
        const elIp = document.getElementById("bench-ip");
        if (elIp) elIp.textContent = avgIp + " ms";
        const elDns = document.getElementById("bench-dns");
        if (elDns) elDns.textContent = (avgDns || 18) + " ms";
        const elTcp = document.getElementById("bench-tcp");
        if (elTcp) elTcp.textContent = (avgTcp || 32) + " ms";
        const elTls = document.getElementById("bench-tls");
        if (elTls) elTls.textContent = (avgTls || 290) + " ms";
        const elPost = document.getElementById("bench-post");
        if (elPost) elPost.textContent = (avgPost || 120) + " ms";
        const elTotal = document.getElementById("bench-total");
        if (elTotal) elTotal.textContent = avgTotal + " ms";
      }

      if (timingChart) timingChart.destroy();

      const hasGranular = tlsMs.some(v => v > 0);

      const datasets = [
        { label: "ADC Measure", data: measureMs, backgroundColor: "#10b981", stack: "Stack 0" },
        { label: "Wi-Fi Connect", data: wifiMs, backgroundColor: "#f59e0b", stack: "Stack 0" },
        { label: "IP DHCP", data: ipMs, backgroundColor: "#a855f7", stack: "Stack 0" }
      ];

      if (hasGranular) {
        datasets.push(
          { label: "DNS Lookup", data: dnsMs, backgroundColor: "#06b6d4", stack: "Stack 0" },
          { label: "TCP Handshake", data: tcpMs, backgroundColor: "#6366f1", stack: "Stack 0" },
          { label: "TLS Handshake", data: tlsMs, backgroundColor: "#3b82f6", stack: "Stack 0" },
          { label: "HTTP POST & Server", data: postMs, backgroundColor: "#ec4899", stack: "Stack 0" }
        );
      } else {
        datasets.push(
          { label: "TLS & Upload", data: uploadMs, backgroundColor: "#38bdf8", stack: "Stack 0" }
        );
      }

      timingChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, grid: { color: "#21262d" }, ticks: { maxTicksLimit: range === "month" ? 15 : 12, color: "#8b949e" } },
            y: { stacked: true, grid: { color: "#21262d" }, ticks: { color: "#8b949e" }, title: { display: true, text: "Active Time (ms)", color: "#8b949e" } }
          },
          plugins: {
            legend: { labels: { color: "#f0f6fc" } }
          }
        }
      });
    }

    function loadMockData(days = 3) {
      const records = [];
      const now = Date.now();
      const points = days * 24 * 6;

      for (let i = points; i >= 0; i--) {
        const time = new Date(now - i * 10 * 60 * 1000);
        const hour = time.getHours() + time.getMinutes() / 60;

        let solarMv = 0;
        if (hour >= 6 && hour <= 18) {
          const sunAngle = Math.sin(((hour - 6) / 12) * Math.PI);
          solarMv = Math.max(0, Math.round(sunAngle * 5400 + (Math.random() * 200 - 100)));
        }

        const lipoMv = Math.round(3800 + (solarMv > 1000 ? 350 : -50) + Math.sin((hour / 24) * 2 * Math.PI) * 80);
        // Sun inside closed container can reach 55°C - 62°C!
        const tempC = Number((28 + Math.sin(((hour - 9) / 24) * 2 * Math.PI) * 26 + (Math.random() * 0.8)).toFixed(1));

        // Simulate RF monitor data across 2.4 GHz spectrum & BLE
        const busiestCh = (i % 4 === 0) ? 6 : (i % 3 === 0 ? 1 : (i % 2 === 0 ? 11 : 3));
        const maxPkts = Math.round(40 + 210 * Math.sin((hour / 24) * 2 * Math.PI) + Math.random() * 60);
        const pkts = Math.max(12, maxPkts);
        const bleDevs = Math.max(2, Math.round(4 + 8 * Math.sin(((hour - 3) / 24) * 2 * Math.PI) + Math.random() * 4));
        const chArray = new Array(14).fill(0);
        for (let c = 1; c <= 13; c++) {
          if (c === busiestCh) chArray[c] = pkts;
          else chArray[c] = Math.round(pkts * (0.05 + 0.35 * Math.random()));
        }

        records.push({
          timestamp: time.toISOString(),
          solar_mv: solarMv,
          solar_v: Number((solarMv / 1000).toFixed(2)),
          lipo_mv: lipoMv,
          lipo_v: Number((lipoMv / 1000).toFixed(2)),
          temp_c: tempC,
          temp_mv: Math.round(tempC * 10),
          boot_count: 500 - i,
          cycle_boot_ms: 5,
          cycle_measure_ms: 12,
          cycle_wifi_ms: 820 + Math.round(Math.random() * 150),
          cycle_ip_ms: 110 + Math.round(Math.random() * 30),
          cycle_upload_ms: 380 + Math.round(Math.random() * 90),
          cycle_total_ms: 1350 + Math.round(Math.random() * 250),
          cycle_http_code: 200,
          wifi_channels_json: JSON.stringify(chArray),
          wifi_busiest_channel: busiestCh,
          wifi_max_packets: pkts,
          ble_unique_devices: bleDevs,
          raw_payload: JSON.stringify({
            ina3221: {
              ch1_solar: { voltage_v: solarMv / 1000, current_ma: solarMv > 1000 ? 320.5 : 0, power_mw: solarMv > 1000 ? (solarMv / 1000 * 320.5) : 0 },
              ch3_load: { voltage_v: 3.3, current_ma: 42.1, power_mw: 138.9, resistance_ohm: 78.4 }
            }
          })
        });
      }

      return records;
    }

    // ==========================================
    // RF & BLE MONITOR HEATMAP ENGINE
    // ==========================================
    let currentRfPalette = "amber";
    let currentRfView = "30m";
    let isRfCollapsed = false;
    let cachedRfRecords = [];
    let rfCanvasInitialized = false;
    let rfGridMeta = null;

    const RF_PALETTES = {
      inferno: [
        [0.0, [0, 0, 4]],
        [0.2, [50, 10, 94]],
        [0.4, [120, 28, 109]],
        [0.6, [187, 55, 84]],
        [0.8, [237, 105, 37]],
        [1.0, [252, 255, 164]]
      ],
      viridis: [
        [0.0, [68, 1, 84]],
        [0.25, [59, 82, 139]],
        [0.5, [33, 145, 140]],
        [0.75, [94, 201, 98]],
        [1.0, [253, 231, 37]]
      ],
      turbo: [
        [0.0, [48, 18, 59]],
        [0.25, [40, 187, 236]],
        [0.5, [162, 252, 60]],
        [0.75, [251, 128, 34]],
        [1.0, [122, 4, 3]]
      ],
      amber: [
        [0.0, [22, 18, 12]],
        [0.25, [120, 53, 15]],
        [0.5, [217, 119, 6]],
        [0.75, [251, 191, 36]],
        [1.0, [254, 240, 138]]
      ]
    };

    function interpolatePalette(t, paletteKey) {
      t = Math.max(0, Math.min(1, t));
      const stops = RF_PALETTES[paletteKey] || RF_PALETTES.amber;
      for (let i = 0; i < stops.length - 1; i++) {
        const [p0, c0] = stops[i];
        const [p1, c1] = stops[i + 1];
        if (t >= p0 && t <= p1) {
          const f = (t - p0) / (p1 - p0);
          const r = Math.round(c0[0] + f * (c1[0] - c0[0]));
          const g = Math.round(c0[1] + f * (c1[1] - c0[1]));
          const b = Math.round(c0[2] + f * (c1[2] - c0[2]));
          return \`rgb(\${r},\${g},\${b})\`;
        }
      }
      const last = stops[stops.length - 1][1];
      return \`rgb(\${last[0]},\${last[1]},\${last[2]})\`;
    }

    function toggleRfMonitor(event) {
      if (event) event.stopPropagation();
      isRfCollapsed = !isRfCollapsed;
      const body = document.getElementById("rf-monitor-body");
      const btn = document.getElementById("rf-collapse-btn");
      if (body) body.style.display = isRfCollapsed ? "none" : "block";
      if (btn) btn.classList.toggle("collapsed", isRfCollapsed);
      if (!isRfCollapsed) {
        renderRfHeatmap(cachedRfRecords, currentRfView);
      }
    }

    function changeRfPalette(palette) {
      currentRfPalette = palette;
      renderRfHeatmap(cachedRfRecords, currentRfView);
    }

    function switchRfView(view) {
      currentRfView = view;
      const buttons = document.querySelectorAll("#rf-view-toggle button");
      buttons.forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-rf-view") === view);
      });
      renderRfHeatmap(cachedRfRecords, currentRfView);
    }

    function updateRfLegend(minVal, maxVal) {
      const legendEl = document.getElementById("rf-legend");
      if (!legendEl) return;
      const gradStops = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        gradStops.push(\`\${interpolatePalette(t, currentRfPalette)} \${t * 100}%\`);
      }
      legendEl.innerHTML = \`
        <span style="font-size:0.7rem; color:var(--text-muted);">\${minVal} pkts</span>
        <div style="width: 100px; height: 8px; border-radius: 4px; background: linear-gradient(to right, \${gradStops.join(", ")}); border: 1px solid var(--border);"></div>
        <span style="font-size:0.7rem; color:var(--text-muted);">\${maxVal} pkts</span>
      \`;
    }

    function renderRfHeatmap(records, view = "30m") {
      cachedRfRecords = records || [];
      if (isRfCollapsed) return;

      const canvas = document.getElementById("rfHeatmapCanvas");
      const container = document.getElementById("rf-heatmap-container");
      if (!canvas || !container) return;

      const now = Date.now();
      const numRows = 14; // Rows 0..12: Channels 1..13; Row 13: BLE
      const rowLabels = [
        "CH 1", "CH 2", "CH 3", "CH 4", "CH 5", "CH 6", "CH 7",
        "CH 8", "CH 9", "CH 10", "CH 11", "CH 12", "CH 13", "BLE"
      ];

      let numCols = 48;
      let colLabels = [];
      let cellData = [];

      if (view === "30m") {
        numCols = 48;
        const slotDuration = 30 * 60 * 1000;
        const startCutoff = now - 24 * 60 * 60 * 1000;

        for (let c = 0; c < numCols; c++) {
          const slotStart = startCutoff + c * slotDuration;
          const slotEnd = slotStart + slotDuration;
          const d = new Date(slotStart);
          colLabels.push(d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

          const slotRecs = cachedRfRecords.filter(r => {
            const t = new Date(r.timestamp).getTime();
            return t >= slotStart && t < slotEnd;
          });

          cellData[c] = [];
          for (let r = 0; r < numRows; r++) {
            let maxVal = 0;
            if (r < 13) {
              const ch = r + 1;
              slotRecs.forEach(rec => {
                let pkts = 0;
                if (rec.wifi_channels_json) {
                  try {
                    const arr = typeof rec.wifi_channels_json === "string" ? JSON.parse(rec.wifi_channels_json) : rec.wifi_channels_json;
                    pkts = arr[ch] || 0;
                  } catch (e) {}
                } else if (rec.wifi_busiest_channel === ch) {
                  pkts = rec.wifi_max_packets || 0;
                }
                if (pkts > maxVal) maxVal = pkts;
              });
            } else {
              slotRecs.forEach(rec => {
                const ble = rec.ble_unique_devices || 0;
                if (ble > maxVal) maxVal = ble;
              });
            }
            cellData[c][r] = {
              val: maxVal,
              timeLabel: colLabels[c],
              rowLabel: rowLabels[r],
              isBle: r === 13
            };
          }
        }
      } else {
        // 7-Day View
        numCols = 7;
        const dayDuration = 24 * 60 * 60 * 1000;
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const endCutoff = today.getTime();
        const startCutoff = endCutoff - 7 * dayDuration;

        for (let c = 0; c < numCols; c++) {
          const slotStart = startCutoff + c * dayDuration;
          const slotEnd = slotStart + dayDuration;
          const d = new Date(slotStart);
          const dayName = d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
          colLabels.push(dayName);

          const dayRecs = cachedRfRecords.filter(r => {
            const t = new Date(r.timestamp).getTime();
            return t >= slotStart && t < slotEnd;
          });

          cellData[c] = [];
          for (let r = 0; r < numRows; r++) {
            let maxVal = 0;
            if (r < 13) {
              const ch = r + 1;
              dayRecs.forEach(rec => {
                let pkts = 0;
                if (rec.wifi_channels_json) {
                  try {
                    const arr = typeof rec.wifi_channels_json === "string" ? JSON.parse(rec.wifi_channels_json) : rec.wifi_channels_json;
                    pkts = arr[ch] || 0;
                  } catch (e) {}
                } else if (rec.wifi_busiest_channel === ch) {
                  pkts = rec.wifi_max_packets || 0;
                }
                if (pkts > maxVal) maxVal = pkts;
              });
            } else {
              dayRecs.forEach(rec => {
                const ble = rec.ble_unique_devices || 0;
                if (ble > maxVal) maxVal = ble;
              });
            }
            cellData[c][r] = {
              val: maxVal,
              timeLabel: dayName,
              rowLabel: rowLabels[r],
              isBle: r === 13
            };
          }
        }
      }

      // Compute summary statistics
      let globalMaxPkts = 0;
      let globalMaxBle = 0;
      const chTotals = new Array(14).fill(0);

      for (let c = 0; c < numCols; c++) {
        for (let r = 0; r < numRows; r++) {
          const val = cellData[c][r].val;
          if (r < 13) {
            chTotals[r + 1] += val;
            if (val > globalMaxPkts) globalMaxPkts = val;
          } else {
            if (val > globalMaxBle) globalMaxBle = val;
          }
        }
      }

      let busiestCh = 1;
      let maxChSum = -1;
      let cleanestCh = 1;
      let minChSum = Infinity;
      for (let ch = 1; ch <= 13; ch++) {
        if (chTotals[ch] > maxChSum) {
          maxChSum = chTotals[ch];
          busiestCh = ch;
        }
        if (chTotals[ch] < minChSum) {
          minChSum = chTotals[ch];
          cleanestCh = ch;
        }
      }

      const elBusiest = document.getElementById("rf-busiest-ch");
      if (elBusiest) elBusiest.textContent = "CH " + busiestCh;
      const elMaxPkts = document.getElementById("rf-max-pkts");
      if (elMaxPkts) elMaxPkts.textContent = (globalMaxPkts || 0) + " pkts";
      const elBle = document.getElementById("rf-ble-count");
      if (elBle) elBle.textContent = (globalMaxBle || 0) + " devs";
      const elCleanest = document.getElementById("rf-cleanest-ch");
      if (elCleanest) elCleanest.textContent = "CH " + cleanestCh;

      updateRfLegend(0, globalMaxPkts > 0 ? globalMaxPkts : 100);

      // Render to Canvas
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth || 800;
      const height = 320;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // Clear
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, width, height);

      const margin = { left: 45, right: 15, top: 12, bottom: 26 };
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom;

      const gapX = view === "30m" ? 1.5 : 3.0;
      const gapY = 1.5;
      const cellW = (plotWidth - (numCols - 1) * gapX) / numCols;
      const cellH = (plotHeight - (numRows - 1) * gapY) / numRows;

      rfGridMeta = {
        margin,
        cellW,
        cellH,
        gapX,
        gapY,
        numCols,
        numRows,
        cellData,
        width,
        height
      };

      const scaleNorm = Math.max(10, globalMaxPkts, globalMaxBle * 15);

      for (let c = 0; c < numCols; c++) {
        for (let r = 0; r < numRows; r++) {
          const item = cellData[c][r];
          const x = margin.left + c * (cellW + gapX);
          const y = margin.top + r * (cellH + gapY);

          if (item.val === 0) {
            ctx.fillStyle = "#161b22";
            ctx.fillRect(x, y, cellW, cellH);
          } else {
            const effectiveVal = item.isBle ? item.val * 15 : item.val;
            const t = Math.log(1 + effectiveVal) / Math.log(1 + scaleNorm);
            ctx.fillStyle = interpolatePalette(t, currentRfPalette);
            ctx.fillRect(x, y, cellW, cellH);
          }
        }
      }

      // Draw Row Labels (Y-Axis)
      ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      for (let r = 0; r < numRows; r++) {
        const y = margin.top + r * (cellH + gapY) + cellH / 2;
        ctx.fillStyle = (r === 13) ? "#38bdf8" : "#8b949e";
        ctx.fillText(rowLabels[r], margin.left - 6, y);
      }

      // Draw Column Labels (X-Axis)
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#8b949e";

      if (view === "30m") {
        for (let c = 0; c < numCols; c += 6) {
          const x = margin.left + c * (cellW + gapX) + cellW / 2;
          ctx.fillText(colLabels[c], x, margin.top + plotHeight + 6);
        }
      } else {
        for (let c = 0; c < numCols; c++) {
          const x = margin.left + c * (cellW + gapX) + cellW / 2;
          ctx.fillText(colLabels[c], x, margin.top + plotHeight + 6);
        }
      }

      if (!rfCanvasInitialized) {
        initRfCanvasListeners(canvas);
        rfCanvasInitialized = true;
      }
    }

    function initRfCanvasListeners(canvas) {
      const tooltip = document.getElementById("rfHeatmapTooltip");
      const container = document.getElementById("rf-heatmap-container");

      canvas.addEventListener("mousemove", (e) => {
        if (!rfGridMeta) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const { margin, cellW, cellH, gapX, gapY, numCols, numRows, cellData } = rfGridMeta;

        if (
          mouseX >= margin.left &&
          mouseX <= margin.left + numCols * (cellW + gapX) &&
          mouseY >= margin.top &&
          mouseY <= margin.top + numRows * (cellH + gapY)
        ) {
          const col = Math.floor((mouseX - margin.left) / (cellW + gapX));
          const row = Math.floor((mouseY - margin.top) / (cellH + gapY));

          if (col >= 0 && col < numCols && row >= 0 && row < numRows) {
            const item = cellData[col][row];
            if (tooltip) {
              const unit = item.isBle ? "devices" : "pkts/s";
              tooltip.innerHTML = \`
                <div style="font-weight:600; color:\${item.isBle ? '#38bdf8' : '#fbbf24'};">\${item.rowLabel}</div>
                <div>Time: \${item.timeLabel}</div>
                <div>Activity: <b>\${item.val}</b> \${unit}</div>
              \`;
              tooltip.style.display = "block";
              const ttLeft = Math.min(container.clientWidth - 150, mouseX + 12);
              const ttTop = Math.max(10, mouseY - 40);
              tooltip.style.left = ttLeft + "px";
              tooltip.style.top = ttTop + "px";
            }
            return;
          }
        }
        if (tooltip) tooltip.style.display = "none";
      });

      canvas.addEventListener("mouseleave", () => {
        if (tooltip) tooltip.style.display = "none";
      });

      window.addEventListener("resize", () => {
        if (!isRfCollapsed && cachedRfRecords.length > 0) {
          renderRfHeatmap(cachedRfRecords, currentRfView);
        }
      });
    }

    window.addEventListener("DOMContentLoaded", init);
  </script>
</body>
</html>
`;
}

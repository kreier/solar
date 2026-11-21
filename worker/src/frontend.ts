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
  <script type="module">
    import { ESPLoader, Transport } from "./esptool.bundle.js";
    window.ESPLoader = ESPLoader;
    window.ESPTransport = Transport;
  </script>
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
      height: 560px;
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
          <span class="badge badge-blue" style="font-size:0.75rem;vertical-align:middle;margin-left:0.5rem;" title="Web Dashboard Application Version">Web v1.1.8</span>
        </h1>
        <div class="subtitle" id="station-subtitle">Connecting to Cloudflare D1 Edge Ingestion...</div>
      </div>
      <div class="station-controls">
        <select id="station-select">
          <option value="">Loading stations...</option>
        </select>
        <button id="refresh-btn">🔄 Refresh</button>
        <button id="settings-btn" onclick="openSettingsModal()" title="Configure station mode, name, prune data or delete station">⚙️ Settings</button>
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

      <div class="card" id="card-power">
        <div class="card-label">
          <span>Solar Power</span>
        </div>
        <div class="card-value" id="power-val">-- <span class="card-unit">mW</span></div>
      </div>

      <div class="card" id="card-lipo">
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
      <div class="cards-grid" style="margin-top:0.75rem;margin-bottom:0;" id="ina3221-grid">
        <div style="background:#0d1117;padding:0.85rem;border-radius:6px;border:1px solid var(--border);" id="ina-ch1-box">
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">CH1 Solar Panel Input</div>
          <div style="font-size:1.35rem;font-weight:700;color:var(--solar);" id="ina-solar-pwr">-- mW</div>
          <div style="font-size:0.8rem;color:var(--text-muted);" id="ina-solar-details">-- V &bull; -- mA</div>
        </div>
        <div style="background:#0d1117;padding:0.85rem;border-radius:6px;border:1px solid var(--border);display:none;" id="ina-ch2-box">
          <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;">CH2 Battery / Aux</div>
          <div style="font-size:1.35rem;font-weight:700;color:var(--battery);" id="ina-ch2-pwr">-- mW</div>
          <div style="font-size:0.8rem;color:var(--text-muted);" id="ina-ch2-details">-- V &bull; -- mA</div>
        </div>
        <div style="background:#0d1117;padding:0.85rem;border-radius:6px;border:1px solid var(--border);" id="ina-ch3-box">
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
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-sm" id="btn-toggle-battery-graph" onclick="toggleBatteryGraph()" style="background:#21262d;border:1px solid var(--border);color:var(--text);padding:0.35rem 0.75rem;border-radius:6px;cursor:pointer;font-size:0.8rem;">📈 Show Trend Graph</button>
          <div class="btn-group" id="battery-range-toggle" style="display:none;">
            <button class="active" data-days="1">1 Day</button>
            <button data-days="7">7 Days</button>
            <button data-days="30">30 Days</button>
            <button data-days="365">365 Days</button>
          </div>
        </div>
      </div>

      <!-- Runtime Estimate Metrics Box -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:1.25rem;">
        <div class="card" style="background:#0d1117;padding:1rem;">
          <div class="card-label"><span>24-Hour Runtime Est.</span><span class="badge badge-green">1 Day</span></div>
          <div class="card-value" id="est-runtime-24h" style="font-size:1.35rem;font-weight:700;color:var(--battery);">-- Days</div>
          <div class="card-sub" id="est-drop-24h">&Delta;V: -- mV / 24h</div>
        </div>
        <div class="card" style="background:#0d1117;padding:1rem;">
          <div class="card-label"><span>7-Day Trend Est.</span><span class="badge badge-blue">7 Days</span></div>
          <div class="card-value" id="est-runtime-7d" style="font-size:1.35rem;font-weight:700;color:var(--battery);">-- Days</div>
          <div class="card-sub" id="est-drop-7d">&Delta;V: -- mV / day avg</div>
        </div>
        <div class="card" style="background:#0d1117;padding:1rem;">
          <div class="card-label"><span>30-Day Autonomy Est.</span><span class="badge badge-amber">30 Days</span></div>
          <div class="card-value" id="est-runtime-30d" style="font-size:1.35rem;font-weight:700;color:var(--battery);">-- Days</div>
          <div class="card-sub" id="est-drop-30d">&Delta;V: -- mV / day avg</div>
        </div>
      </div>

      <div id="battery-chart-collapse" style="display:none;">
        <div class="chart-container" style="height:280px;">
          <canvas id="batteryChart"></canvas>
        </div>
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
          <button class="active" data-metric="solar">Solar Voltage</button>
          <button data-metric="power">Solar Power</button>
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
          <div class="chart-title">Uplink Latency Distribution</div>
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
    <div class="chart-section" id="rf-monitor-section" style="display: none;">
      <div class="chart-header" style="cursor: pointer;" onclick="toggleRfMonitor(event)">
        <div>
          <div class="chart-title">
            <span>📡 2.4 GHz RF &amp; BLE Environmental Activity Monitor</span>
            <span class="badge badge-amber" style="margin-left:0.5rem; font-size:0.75rem;">Mode 3 / Monitor</span>
          </div>
          <div class="subtitle" id="rf-subtitle">Today's 2.4 GHz channels (1–13, BLE) and 7-day diurnal trend comparison</div>
        </div>
        <div style="display:flex; align-items:center; gap:0.75rem;" onclick="event.stopPropagation()">
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
        <span>Website v1.1.8</span> &bull;
        <span>Firmware v<span id="fw-version">1.1.5</span> (Stable)</span> &bull;
        <span class="badge badge-amber" style="padding:0.1rem 0.4rem;">v1.1.8 Canary</span> &bull;
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
          <span class="badge badge-amber" id="modal-ver-badge">v1.1.8 Canary</span>
        </div>
        <button class="modal-close-btn" onclick="closeFlashModal()" title="Close dialog">✕</button>
      </div>

      <div class="modal-tabs">
        <button id="tabBtnSmartOTA" class="modal-tab-btn active" onclick="switchFlashTab('smartota')">🔍 Investigate &amp; Dual-OTA Manager</button>
        <button id="tabBtnWebSerial" class="modal-tab-btn" onclick="switchFlashTab('webserial')">🧹 Factory Clean Flash</button>
        <button id="tabBtnBinaries" class="modal-tab-btn" onclick="switchFlashTab('binaries')">Direct Binaries &amp; CLI</button>
      </div>

      <div class="modal-body">
        <!-- Tab 0: Smart Dual-OTA & Partition Inspector -->
        <div id="flashTabSmartOTA">
          <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
            <div>
              <div style="font-weight:600;font-size:0.9rem;color:#7dd3fc;">🔍 ESP32 Dual-OTA &amp; Partition Inspector</div>
              <div style="font-size:0.78rem;color:var(--text-muted);" id="otaInspectorSub">Connect to inspect active boot slots, installed firmware versions, and safely update without erasing NVS.</div>
            </div>
            <div style="display:flex;gap:0.5rem;">
              <button id="btnConnectInspect" class="btn btn-primary" onclick="connectAndInspect()" style="padding:0.4rem 0.85rem;font-size:0.82rem;">🔍 Connect &amp; Inspect</button>
              <button id="btnDisconnectInspect" class="btn btn-secondary" onclick="disconnectInspector()" style="display:none;padding:0.4rem 0.85rem;font-size:0.82rem;">Disconnect</button>
            </div>
          </div>

          <div id="otaInspectStatus" style="font-size:0.82rem;margin-bottom:0.75rem;color:var(--text-muted);display:none;padding:0.5rem 0.8rem;border-radius:6px;"></div>

          <!-- Inspector Device Info (Visible once connected) -->
          <div id="otaDeviceInfoCard" style="display:none;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:0.75rem;font-size:0.8rem;">
              <div><span style="color:var(--text-muted);">Chip:</span> <b id="devChipName">-</b></div>
              <div><span style="color:var(--text-muted);">Flash Size:</span> <b id="devFlashSize">-</b></div>
              <div><span style="color:var(--text-muted);">MAC:</span> <b id="devMacAddr">-</b></div>
              <div><span style="color:var(--text-muted);">Current Boot:</span> <span id="devActiveSlotBadge" class="badge badge-green">-</span></div>
            </div>
          </div>

          <!-- Dual-Bank Slot Comparison -->
          <div id="otaSlotsGrid" style="display:none;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
            <!-- Bank 0 (app0) -->
            <div id="cardSlot0" style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:0.85rem;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                <b style="font-size:0.9rem;">Slot 0 (app0)</b>
                <span id="badgeSlot0" class="badge badge-green">ACTIVE</span>
              </div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;" id="rangeSlot0">Offset: 0x10000 • Size: -</div>
              <div style="background:rgba(255,255,255,0.03);border-radius:6px;padding:0.5rem;margin-bottom:0.6rem;font-size:0.8rem;">
                <div><span style="color:var(--text-muted);">Firmware:</span> <b id="fwSlot0" style="color:var(--accent);">Detecting...</b></div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;" id="descSlot0">-</div>
              </div>
              <button id="btnSwitchSlot0" class="btn btn-secondary" onclick="switchBootSlot(0)" style="width:100%;font-size:0.78rem;padding:0.35rem;" disabled>
                🔄 Boot from Slot 0 (Revert)
              </button>
            </div>

            <!-- Bank 1 (app1) -->
            <div id="cardSlot1" style="background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:0.85rem;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                <b style="font-size:0.9rem;">Slot 1 (app1)</b>
                <span id="badgeSlot1" class="badge badge-gray">INACTIVE</span>
              </div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;" id="rangeSlot1">Offset: 0x1F0000 • Size: -</div>
              <div style="background:rgba(255,255,255,0.03);border-radius:6px;padding:0.5rem;margin-bottom:0.6rem;font-size:0.8rem;">
                <div><span style="color:var(--text-muted);">Firmware:</span> <b id="fwSlot1" style="color:var(--accent);">Detecting...</b></div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;" id="descSlot1">-</div>
              </div>
              <button id="btnSwitchSlot1" class="btn btn-secondary" onclick="switchBootSlot(1)" style="width:100%;font-size:0.78rem;padding:0.35rem;" disabled>
                🔄 Boot from Slot 1 (Revert)
              </button>
            </div>
          </div>

          <!-- Non-Destructive Update Flasher -->
          <div id="otaFlashActionCard" style="display:none;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:0.85rem;margin-bottom:1rem;">
            <div style="font-weight:600;font-size:0.85rem;color:#6ee7b7;margin-bottom:0.3rem;">⚡ Flash Update into Inactive Slot (Non-Destructive)</div>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.6rem;">
              Directly flashes into <b id="targetSlotLabel" style="color:#6ee7b7;">Slot 1 (app1)</b>. Preserves bootloader, partition table, and NVS Wi-Fi credentials. Automatically switches boot pointer to the new slot.
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;">
              <select id="otaFwSelect" style="flex:1;min-width:180px;font-size:0.82rem;padding:0.4rem;">
                <option value="1.1.8-canary" selected>v1.1.8 Canary (Latest)</option>
                <option value="1.1.7-canary">v1.1.7 Canary</option>
                <option value="1.1.6-canary">v1.1.6 Canary</option>
                <option value="1.1.5">v1.1.5 Stable</option>
                <option value="1.1.4">v1.1.4 Stable</option>
                <option value="1.0.2">v1.0.2 Stable (Legacy)</option>
              </select>
              <button id="btnStartSmartFlash" class="btn btn-primary" onclick="startSmartFlash()" style="padding:0.4rem 1rem;font-size:0.82rem;background:#10b981;border-color:#10b981;">
                ⚡ Flash Inactive Slot &amp; Reboot
              </button>
            </div>
            <!-- Progress Bar -->
            <div id="otaProgressWrapper" style="display:none;margin-top:0.75rem;">
              <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:0.25rem;">
                <span id="otaProgressLabel">Writing...</span>
                <span id="otaProgressPercent">0%</span>
              </div>
              <div style="background:rgba(255,255,255,0.1);border-radius:4px;height:8px;overflow:hidden;">
                <div id="otaProgressBar" style="width:0%;height:100%;background:#10b981;transition:width 0.2s;"></div>
              </div>
            </div>
          </div>

          <!-- Partition Table Display (Collapsible) -->
          <details id="otaPartDetails" style="display:none;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:0.5rem 0.85rem;margin-bottom:1rem;">
            <summary style="font-size:0.8rem;font-weight:600;cursor:pointer;color:var(--text-muted);">📋 View Complete Flash Partition Scheme</summary>
            <div style="overflow-x:auto;margin-top:0.5rem;">
              <table style="width:100%;font-size:0.75rem;border-collapse:collapse;text-align:left;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border);color:var(--text-muted);">
                    <th style="padding:0.3rem;">Name</th>
                    <th style="padding:0.3rem;">Type</th>
                    <th style="padding:0.3rem;">Offset</th>
                    <th style="padding:0.3rem;">Size</th>
                  </tr>
                </thead>
                <tbody id="otaPartTableBody"></tbody>
              </table>
            </div>
          </details>
        </div>

        <!-- Tab 1: Web Serial Install -->
        <div id="flashTabWebSerial" style="display:none;">
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
                <option value="1.1.8-canary" selected>v1.1.8 Canary (Robust Multi-Manifest, Non-Destructive Update, Coredump Partition)</option>
                <option value="1.1.7-canary">v1.1.7 Canary (INA3221 CH2, Solar Power Telemetry, LiPo Autonomy Analytics)</option>
                <option value="1.1.6-canary">v1.1.6 Canary (S3 USB Update Bootloader, Soft-AP Verbose, Phy My Hung)</option>
                <option value="1.1.5">v1.1.5 Stable (Production: Reset OTA, Auto-scale, INA3221 3-CH)</option>
                <option value="1.1.4">v1.1.4 Stable</option>
                <option value="1.0.2">v1.0.2 Stable (Legacy)</option>
              </select>
            </div>
          </div>

          <div style="margin: 0.75rem 0 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
            Choose your installation mode:
          </div>

          <!-- Mode Radio Selection -->
          <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
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
                <div class="mode-title">⚡ Update Firmware (Keep Settings &amp; Data)</div>
                <div class="mode-desc">Flashes bootloader, partitions, otadata, and app. Preserves Wi-Fi credentials, tokens, and NVS configuration. In the installer prompt, leave <b>"Erase device" unchecked</b>.</div>
              </div>
            </label>
          </div>

          <div id="updatePreserveNotice" style="display:none; margin-bottom:1rem; padding:0.6rem 0.85rem; border-radius:8px; background:rgba(56,189,248,0.1); border:1px solid rgba(56,189,248,0.3); font-size:0.8rem; color:#7dd3fc; line-height:1.4;">
            💡 <strong>Preserving Settings:</strong> When the ESP Web Tools dialog opens, <strong>leave the "Erase device" checkbox UNCHECKED</strong>. This updates your bootloader, partitions, and application code while keeping your stored Wi-Fi credentials, tokens, and NVS calibration untouched!
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

  <!-- Station Settings & Admin Login Modal -->
  <div id="settingsModal" class="modal-backdrop" onclick="onSettingsModalBackdropClick(event)">
    <div class="modal-window" onclick="event.stopPropagation()" style="max-width: 600px;">
      <!-- Modal Header (Adapts dynamically to login vs settings) -->
      <div class="modal-header">
        <div class="modal-title" style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin-right: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span id="settings-title-text">⚙️ Station Settings</span>
            <span class="badge badge-blue" id="settings-station-badge">Station</span>
          </div>
          <button type="button" id="admin-logout-btn" onclick="logoutAdmin()" style="display: none; font-size: 0.75rem; padding: 0.25rem 0.6rem; background: rgba(255,255,255,0.08); border: 1px solid var(--border); color: var(--text-muted); cursor: pointer; border-radius: 4px;">🚪 Log Out</button>
        </div>
        <button class="modal-close-btn" onclick="closeSettingsModal()" title="Close dialog">✕</button>
      </div>

      <div class="modal-body" style="padding: 1.5rem;">
        <!-- 1. Admin Login View (Shown when not authenticated) -->
        <div id="settings-login-view" style="display: none; flex-direction: column; gap: 1.1rem;">
          <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.45;">
            Administrator credentials are required to configure station operating modes, manage device parameters, prune records, or delete stations.
          </div>

          <div id="admin-login-error" style="display: none; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #fca5a5; padding: 0.6rem 0.8rem; border-radius: 6px; font-size: 0.85rem;"></div>

          <div>
            <label style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Username</label>
            <input type="text" id="admin-username" placeholder="Enter admin username" autocomplete="username" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.8rem; color: var(--text);" onkeydown="if(event.key==='Enter') submitAdminLogin()">
          </div>

          <div>
            <label style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Password</label>
            <input type="password" id="admin-password" placeholder="Enter admin password" autocomplete="current-password" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.55rem 0.8rem; color: var(--text);" onkeydown="if(event.key==='Enter') submitAdminLogin()">
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem;">
            <button type="button" class="btn-sm" onclick="closeSettingsModal()" style="padding: 0.5rem 1rem;">Cancel</button>
            <button type="button" id="admin-login-btn" class="btn-sm" onclick="submitAdminLogin()" style="background: var(--solar); color: #000; font-weight: 700; border: none; padding: 0.5rem 1.25rem; display: flex; align-items: center; gap: 0.4rem;">
              <span>🔑 Sign In</span>
            </button>
          </div>
        </div>

        <!-- 2. Station Configuration View (Shown when authenticated) -->
        <div id="settings-config-view" style="display: none; flex-direction: column; gap: 1.25rem;">
          <!-- General Station Info & Config -->
          <div>
            <label style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Station ID</label>
            <input type="text" id="settings-station-id" readonly style="width: 100%; background: #0d1117; border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; color: var(--text-muted); font-family: monospace;">
          </div>

          <div>
            <label style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Location</label>
            <input type="text" id="settings-location" placeholder="e.g. Roof Top, District 7" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; color: var(--text);">
          </div>

          <div>
            <label style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Operational Mode (Synchronized via OTA check)</label>
            <select id="settings-power-mode" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; color: var(--text);">
              <option value="0">1. Low Power (Deep Sleep, 10m RTC sample, 1h Wi-Fi burst upload, 24h OTA)</option>
              <option value="1">2. Active (Light Sleep, 1m sample, 10m avg upload, 1h OTA)</option>
              <option value="2">3. Verbose (Active + 1m serial diagnostics)</option>
              <option value="3">4. Monitor (Active + 2.4GHz RF &amp; BLE occupancy scan)</option>
            </select>
          </div>

          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            <label class="checkbox-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="settings-enable-lipo" value="1" style="width: auto;">
              <span>Enable LiPo Battery Voltage Telemetry</span>
            </label>
            <label class="checkbox-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
              <input type="checkbox" id="settings-is-canary" value="1" style="width: auto;">
              <span>Accept Canary Firmware Releases (v1.1.4-canary OTA)</span>
            </label>
          </div>

          <div>
            <label style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); display: block; margin-bottom: 0.35rem;">Target Firmware Version Override (Optional)</label>
            <input type="text" id="settings-target-version" placeholder="Leave blank for automatic release channel default" style="width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; color: var(--text);">
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem;">
            <button type="button" class="btn-sm" onclick="closeSettingsModal()" style="padding: 0.5rem 1rem;">Cancel</button>
            <button type="button" class="btn-sm" onclick="saveStationSettings()" style="background: var(--solar); color: #000; font-weight: 700; border: none; padding: 0.5rem 1.25rem;">💾 Save Settings</button>
          </div>

          <!-- Prune Telemetry Data Section -->
          <div style="border-top: 1px solid var(--border); padding-top: 1.25rem; margin-top: 0.5rem;">
            <div style="font-size: 0.95rem; font-weight: 600; color: var(--solar); margin-bottom: 0.35rem;">🧹 Prune Telemetry Records</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">Free database space by purging historical telemetry points older than a specified duration:</div>
            <div style="display: flex; gap: 0.75rem; align-items: center;">
              <select id="prune-older-than" style="flex: 1; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; color: var(--text);">
                <option value="2">Older than 2 days</option>
                <option value="7">Older than 7 days</option>
                <option value="14">Older than 14 days</option>
                <option value="30">Older than 30 days</option>
              </select>
              <button type="button" onclick="pruneStationTelemetry()" style="background: #374151; color: var(--text); border: 1px solid var(--border); padding: 0.5rem 1rem; border-radius: 6px;">🗑️ Prune Data</button>
            </div>
          </div>

          <!-- Danger Zone Section -->
          <div style="border-top: 1px solid rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.05); padding: 1rem; border-radius: 6px; margin-top: 0.5rem;">
            <div style="font-size: 0.95rem; font-weight: 600; color: #ef4444; margin-bottom: 0.25rem;">🚨 Danger Zone: Delete Station</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">Permanently remove this station and all of its recorded measurements from Cloudflare D1. This action is irreversible.</div>
            <button type="button" onclick="deleteCurrentStation()" style="background: #ef4444; color: #fff; font-weight: 700; border: none; padding: 0.5rem 1rem; border-radius: 6px;">🗑️ Delete Station &amp; Data</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = "${apiBase}";

    let currentStationId = "";
    let cachedHistory = [];
    let allStations = [];
    let currentStationRecord = null;
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
        if (e.key === "Escape") {
          closeFlashModal();
          closeSettingsModal();
        }
      });
    }

    function getAdminToken() {
      return sessionStorage.getItem("solar_admin_token");
    }

    function showSettingsLoginView(errMsg) {
      const loginView = document.getElementById("settings-login-view");
      const configView = document.getElementById("settings-config-view");
      const logoutBtn = document.getElementById("admin-logout-btn");
      const titleText = document.getElementById("settings-title-text");
      const badge = document.getElementById("settings-station-badge");
      const errBox = document.getElementById("admin-login-error");

      if (loginView) loginView.style.display = "flex";
      if (configView) configView.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (titleText) titleText.textContent = "🔒 Admin Login";
      if (badge) badge.style.display = "none";

      if (errBox) {
        if (errMsg) {
          errBox.textContent = errMsg;
          errBox.style.display = "block";
        } else {
          errBox.style.display = "none";
        }
      }

      setTimeout(() => {
        const userInput = document.getElementById("admin-username");
        if (userInput) userInput.focus();
      }, 100);
    }

    function showSettingsConfigView() {
      const loginView = document.getElementById("settings-login-view");
      const configView = document.getElementById("settings-config-view");
      const logoutBtn = document.getElementById("admin-logout-btn");
      const titleText = document.getElementById("settings-title-text");
      const badge = document.getElementById("settings-station-badge");

      if (loginView) loginView.style.display = "none";
      if (configView) configView.style.display = "flex";
      if (logoutBtn) logoutBtn.style.display = "inline-block";
      if (titleText) titleText.textContent = "⚙️ Station Settings";
      if (badge) {
        badge.textContent = currentStationId;
        badge.style.display = "inline-block";
      }

      document.getElementById("settings-station-id").value = currentStationId;
      const st = allStations.find(s => s.station_id === currentStationId) || currentStationRecord || {};
      document.getElementById("settings-location").value = st.location || "";
      document.getElementById("settings-power-mode").value = (st.power_mode !== undefined && st.power_mode !== null) ? String(st.power_mode) : "0";
      document.getElementById("settings-enable-lipo").checked = (st.enable_lipo === 1);
      document.getElementById("settings-is-canary").checked = (st.is_canary === 1);
      document.getElementById("settings-target-version").value = st.target_version || "";
    }

    async function submitAdminLogin() {
      const usernameInput = document.getElementById("admin-username");
      const passwordInput = document.getElementById("admin-password");
      const errBox = document.getElementById("admin-login-error");
      const loginBtn = document.getElementById("admin-login-btn");

      const username = usernameInput ? usernameInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value : "";

      if (!username || !password) {
        if (errBox) {
          errBox.textContent = "Please enter both username and password.";
          errBox.style.display = "block";
        }
        return;
      }

      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerHTML = "<span>⏳ Signing in...</span>";
      }

      try {
        const resp = await fetch(API_BASE + "/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });

        if (resp.ok) {
          const data = await resp.json();
          sessionStorage.setItem("solar_admin_token", data.token);
          sessionStorage.setItem("solar_admin_user", data.username);
          if (passwordInput) passwordInput.value = "";
          showSettingsConfigView();
        } else {
          const data = await resp.json().catch(() => ({}));
          showSettingsLoginView(data.error || "Invalid username or password.");
        }
      } catch (err) {
        showSettingsLoginView("Connection error: " + err.message);
      } finally {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.innerHTML = "<span>🔑 Sign In</span>";
        }
      }
    }

    function logoutAdmin() {
      sessionStorage.removeItem("solar_admin_token");
      sessionStorage.removeItem("solar_admin_user");
      showSettingsLoginView("Signed out successfully.");
    }

    function openSettingsModal() {
      if (!currentStationId || currentStationId === "demo") {
        alert("Please select a live station to configure settings.");
        return;
      }
      const modal = document.getElementById("settingsModal");
      if (!modal) return;

      if (!getAdminToken()) {
        showSettingsLoginView();
      } else {
        showSettingsConfigView();
      }

      modal.classList.add("active");
      document.body.style.overflow = "hidden";
    }

    function closeSettingsModal() {
      const modal = document.getElementById("settingsModal");
      if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "";
      }
    }

    function onSettingsModalBackdropClick(e) {
      if (e.target.id === "settingsModal") closeSettingsModal();
    }

    async function saveStationSettings() {
      if (!currentStationId) return;
      const token = getAdminToken();
      if (!token) {
        showSettingsLoginView("Please log in to save settings.");
        return;
      }

      const location = document.getElementById("settings-location").value.trim();
      const powerMode = parseInt(document.getElementById("settings-power-mode").value, 10);
      const enableLipo = document.getElementById("settings-enable-lipo").checked ? 1 : 0;
      const isCanary = document.getElementById("settings-is-canary").checked ? 1 : 0;
      const targetVersion = document.getElementById("settings-target-version").value.trim() || null;

      try {
        const resp = await fetch(API_BASE + "/api/station/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({
            station_id: currentStationId,
            location,
            power_mode: powerMode,
            enable_lipo: enableLipo,
            is_canary: isCanary,
            target_version: targetVersion
          })
        });

        if (resp.status === 401) {
          logoutAdmin();
          showSettingsLoginView("Session expired or invalid credentials. Please sign in again.");
          return;
        }

        if (!resp.ok) throw new Error("HTTP " + resp.status);
        closeSettingsModal();
        alert("✅ Station settings saved! Station " + currentStationId + " will adopt mode " + powerMode + " on its next check.");
        await loadStations();
      } catch (err) {
        alert("❌ Failed to save settings: " + err.message);
      }
    }

    async function pruneStationTelemetry() {
      if (!currentStationId) return;
      const token = getAdminToken();
      if (!token) {
        showSettingsLoginView("Please log in to prune telemetry data.");
        return;
      }

      const olderThanDays = parseInt(document.getElementById("prune-older-than").value, 10);
      if (!confirm("Are you sure you want to prune telemetry data older than " + olderThanDays + " days for " + currentStationId + "?")) {
        return;
      }
      try {
        const resp = await fetch(API_BASE + "/api/station/prune", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({
            station_id: currentStationId,
            older_than_days: olderThanDays
          })
        });

        if (resp.status === 401) {
          logoutAdmin();
          showSettingsLoginView("Session expired or invalid credentials. Please sign in again.");
          return;
        }

        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const res = await resp.json();
        alert("✅ Pruned " + (res.deleted_measurements ?? 0) + " telemetry points older than " + olderThanDays + " days.");
        loadStationData(currentStationId);
      } catch (err) {
        alert("❌ Failed to prune telemetry: " + err.message);
      }
    }

    async function deleteCurrentStation() {
      if (!currentStationId) return;
      const token = getAdminToken();
      if (!token) {
        showSettingsLoginView("Please log in to delete this station.");
        return;
      }

      if (!confirm("🚨 WARNING: Are you sure you want to PERMANENTLY DELETE station '" + currentStationId + "' and ALL its data? This cannot be undone!")) {
        return;
      }
      try {
        const resp = await fetch(API_BASE + "/api/station/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({ station_id: currentStationId })
        });

        if (resp.status === 401) {
          logoutAdmin();
          showSettingsLoginView("Session expired or invalid credentials. Please sign in again.");
          return;
        }

        if (!resp.ok) throw new Error("HTTP " + resp.status);
        closeSettingsModal();
        alert("✅ Station '" + currentStationId + "' and its measurements were deleted.");
        await loadStations();
      } catch (err) {
        alert("❌ Failed to delete station: " + err.message);
      }
    }

    function openFlashModal() {
      const modal = document.getElementById("flashModal");
      if (modal) {
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
      }
      checkSerialSupport();
      updateFlasherManifest();
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
      document.getElementById("flashTabSmartOTA").style.display = (tab === "smartota") ? "block" : "none";
      document.getElementById("flashTabWebSerial").style.display = (tab === "webserial") ? "block" : "none";
      document.getElementById("flashTabBinaries").style.display = (tab === "binaries") ? "block" : "none";
      document.getElementById("tabBtnSmartOTA").classList.toggle("active", tab === "smartota");
      document.getElementById("tabBtnWebSerial").classList.toggle("active", tab === "webserial");
      document.getElementById("tabBtnBinaries").classList.toggle("active", tab === "binaries");
    }

    function espCrc32(seq) {
      let crc = 0;
      const bytes = [seq & 0xff, (seq >> 8) & 0xff, (seq >> 16) & 0xff, (seq >> 24) & 0xff];
      for (const b of bytes) {
        crc ^= b;
        for (let i = 0; i < 8; i++) {
          crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
        }
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    let otaEsploader = null;
    let otaTransport = null;
    let otaPort = null;
    let otaPartitions = [];
    let otaActiveSlot = 0;
    let otaActiveSeq = 1;
    let otaActiveSector = 0;
    let otaDataOffset = 0xE000;
    let otaSlot0Part = null;
    let otaSlot1Part = null;

    async function connectAndInspect() {
      const statusEl = document.getElementById("otaInspectStatus");
      statusEl.style.display = "block";
      statusEl.className = "serial-status-banner supported";
      statusEl.textContent = "Requesting USB serial port...";

      try {
        if (!("serial" in navigator)) {
          alert("Web Serial is not supported in this browser. Please use Chrome, Edge, Brave, or Opera.");
          return;
        }

        if (!window.ESPLoader || !window.ESPTransport) {
          statusEl.textContent = "Loading esptool engine...";
          const mod = await import("./esptool.bundle.js").catch(() => import("https://unpkg.com/esptool-js@0.7.1/bundle.js"));
          window.ESPLoader = mod.ESPLoader;
          window.ESPTransport = mod.Transport;
        }

        otaPort = await navigator.serial.requestPort();
        statusEl.textContent = "Connecting to ESP32 bootloader (115200 baud)...";
        otaTransport = new window.ESPTransport(otaPort);
        otaEsploader = new window.ESPLoader({
          transport: otaTransport,
          baudrate: 115200,
          romBaudrate: 115200,
          terminal: {
            clean() {},
            writeLine(s) { console.log(s); },
            write(s) { console.log(s); }
          }
        });

        await otaEsploader.main();
        await otaEsploader.flashId();

        statusEl.textContent = "Reading partition scheme and dual-OTA boot status...";

        const chipName = otaEsploader.chip.CHIP_NAME || "ESP32";
        let flashSize = "4MB";
        try { flashSize = await otaEsploader.detectFlashSize(); } catch (e) {}
        let macStr = "-";
        try { macStr = await otaEsploader.chip.readMac(otaEsploader); } catch (e) {}

        document.getElementById("devChipName").textContent = chipName;
        document.getElementById("devFlashSize").textContent = flashSize;
        document.getElementById("devMacAddr").textContent = macStr;

        const partBytes = await otaEsploader.readFlash(0x8000, 3072);
        otaPartitions = [];
        for (let i = 0; i < partBytes.length; i += 32) {
          if (partBytes[i] !== 0xaa || partBytes[i + 1] !== 0x50) break;
          const type = partBytes[i + 2];
          const subtype = partBytes[i + 3];
          const offset = (partBytes[i + 4] | (partBytes[i + 5] << 8) | (partBytes[i + 6] << 16) | (partBytes[i + 7] << 24)) >>> 0;
          const size = (partBytes[i + 8] | (partBytes[i + 9] << 8) | (partBytes[i + 10] << 16) | (partBytes[i + 11] << 24)) >>> 0;
          let label = "";
          for (let j = 12; j < 28; j++) {
            if (partBytes[i + j] === 0) break;
            label += String.fromCharCode(partBytes[i + j]);
          }
          otaPartitions.push({ label, type, subtype, offset, size });
        }

        otaSlot0Part = otaPartitions.find(p => p.label === "app0" || (p.type === 0 && p.subtype === 16));
        otaSlot1Part = otaPartitions.find(p => p.label === "app1" || (p.type === 0 && p.subtype === 17));
        const otadataP = otaPartitions.find(p => p.label === "otadata");
        if (otadataP) otaDataOffset = otadataP.offset;

        const otaBytes = await otaEsploader.readFlash(otaDataOffset, 4096 + 32);
        function parseOtaSec(bytes, off) {
          const seq = (bytes[off] | (bytes[off+1] << 8) | (bytes[off+2] << 16) | (bytes[off+3] << 24)) >>> 0;
          const state = (bytes[off+24] | (bytes[off+25] << 8) | (bytes[off+26] << 16) | (bytes[off+27] << 24)) >>> 0;
          const crc = (bytes[off+28] | (bytes[off+29] << 8) | (bytes[off+30] << 16) | (bytes[off+31] << 24)) >>> 0;
          const valid = (seq !== 0xFFFFFFFF && crc === espCrc32(seq));
          return { seq, state, crc, valid };
        }

        const sec0 = parseOtaSec(otaBytes, 0);
        const sec1 = parseOtaSec(otaBytes, 4096);

        if (sec0.valid && sec1.valid) {
          if (sec0.seq > sec1.seq) { otaActiveSeq = sec0.seq; otaActiveSector = 0; }
          else { otaActiveSeq = sec1.seq; otaActiveSector = 1; }
        } else if (sec0.valid) {
          otaActiveSeq = sec0.seq; otaActiveSector = 0;
        } else if (sec1.valid) {
          otaActiveSeq = sec1.seq; otaActiveSector = 1;
        } else {
          otaActiveSeq = 1; otaActiveSector = 0;
        }

        otaActiveSlot = ((otaActiveSeq - 1) % 2);

        async function readSlotFw(part: any) {
          if (!part) return { ver: "Not Found", desc: "No partition allocated" };
          try {
            const raw = await otaEsploader.readFlash(part.offset, 4096);
            let str = "";
            for (let i = 0; i < raw.length; i++) str += String.fromCharCode(raw[i]);
            const verMatch = str.match(/1\.[0-9]+\.[0-9]+(-canary)?/);
            const ver = verMatch ? ("v" + verMatch[0]) : "Unknown Version";
            let buildInfo = "";
            const magic = (raw[32] | (raw[33] << 8) | (raw[34] << 16) | (raw[35] << 24)) >>> 0;
            if (magic === 0xabcd5432) {
              let date = ""; for (let i = 96; i < 112 && raw[i] !== 0; i++) date += String.fromCharCode(raw[i]);
              let time = ""; for (let i = 80; i < 96 && raw[i] !== 0; i++) time += String.fromCharCode(raw[i]);
              let idf = ""; for (let i = 112; i < 144 && raw[i] !== 0; i++) idf += String.fromCharCode(raw[i]);
              buildInfo = \`Built: \${date} \${time} (IDF \${idf})\`;
            }
            return { ver, desc: buildInfo || "Valid application binary" };
          } catch (e: any) {
            return { ver: "Unreadable / Empty", desc: e.message };
          }
        }

        const info0 = await readSlotFw(otaSlot0Part);
        const info1 = await readSlotFw(otaSlot1Part);

        document.getElementById("otaDeviceInfoCard").style.display = "block";
        document.getElementById("otaSlotsGrid").style.display = "grid";
        document.getElementById("otaFlashActionCard").style.display = "block";
        document.getElementById("otaPartDetails").style.display = "block";
        document.getElementById("btnDisconnectInspect").style.display = "inline-block";
        document.getElementById("btnConnectInspect").textContent = "🔄 Re-scan Device";

        document.getElementById("devActiveSlotBadge").textContent = (otaActiveSlot === 0) ? "Slot 0 (app0)" : "Slot 1 (app1)";

        const isSlot0Active = (otaActiveSlot === 0);
        document.getElementById("badgeSlot0").className = isSlot0Active ? "badge badge-green" : "badge badge-gray";
        document.getElementById("badgeSlot0").textContent = isSlot0Active ? "ACTIVE (Booting)" : "INACTIVE";
        document.getElementById("rangeSlot0").textContent = otaSlot0Part ? \`Offset: 0x\${otaSlot0Part.offset.toString(16)} • Size: \${(otaSlot0Part.size / (1024*1024)).toFixed(2)} MB\` : "Offset: -";
        document.getElementById("fwSlot0").textContent = info0.ver;
        document.getElementById("descSlot0").textContent = info0.desc;
        const btnSw0 = document.getElementById("btnSwitchSlot0");
        btnSw0.disabled = isSlot0Active;
        btnSw0.textContent = isSlot0Active ? "🟢 Currently Booting" : "🔄 Boot from Slot 0 (Revert)";

        const isSlot1Active = (otaActiveSlot === 1);
        document.getElementById("badgeSlot1").className = isSlot1Active ? "badge badge-green" : "badge badge-gray";
        document.getElementById("badgeSlot1").textContent = isSlot1Active ? "ACTIVE (Booting)" : "INACTIVE";
        document.getElementById("rangeSlot1").textContent = otaSlot1Part ? \`Offset: 0x\${otaSlot1Part.offset.toString(16)} • Size: \${(otaSlot1Part.size / (1024*1024)).toFixed(2)} MB\` : "Offset: -";
        document.getElementById("fwSlot1").textContent = info1.ver;
        document.getElementById("descSlot1").textContent = info1.desc;
        const btnSw1 = document.getElementById("btnSwitchSlot1");
        btnSw1.disabled = isSlot1Active;
        btnSw1.textContent = isSlot1Active ? "🟢 Currently Booting" : "🔄 Boot from Slot 1 (Revert)";

        const inactiveSlot = isSlot0Active ? 1 : 0;
        const targetPart = isSlot0Active ? otaSlot1Part : otaSlot0Part;
        document.getElementById("targetSlotLabel").textContent = \`Slot \${inactiveSlot} (\${targetPart ? targetPart.label : (inactiveSlot === 0 ? "app0" : "app1")}) at 0x\${targetPart ? targetPart.offset.toString(16) : "-"}\`;

        const tb = document.getElementById("otaPartTableBody");
        tb.innerHTML = "";
        otaPartitions.forEach((p: any) => {
          const tr = document.createElement("tr");
          tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
          tr.innerHTML = \`
            <td style="padding:0.3rem;"><b>\${p.label}</b></td>
            <td style="padding:0.3rem;">\${p.type === 0 ? "app" : "data"} (0x\${p.subtype.toString(16)})</td>
            <td style="padding:0.3rem;"><code>0x\${p.offset.toString(16)}</code></td>
            <td style="padding:0.3rem;">\${(p.size / 1024).toFixed(0)} KB (\${(p.size / (1024*1024)).toFixed(2)} MB)</td>
          \`;
          tb.appendChild(tr);
        });

        statusEl.className = "serial-status-banner supported";
        statusEl.textContent = \`✅ Successfully investigated \${chipName}. Ready to switch boot slot or flash non-destructive updates.\`;
      } catch (err: any) {
        console.error(err);
        statusEl.className = "serial-status-banner unsupported";
        statusEl.textContent = "Error investigating ESP32: " + (err.message || err);
      }
    }

    async function switchBootSlot(targetSlot: number) {
      if (!otaEsploader) return;
      if (!confirm(\`Switch boot slot to Slot \${targetSlot} and reboot the device?\`)) return;

      const statusEl = document.getElementById("otaInspectStatus");
      statusEl.textContent = \`Writing otadata pointer to boot from Slot \${targetSlot}...\`;

      try {
        const nextSeq = (otaActiveSeq || 1) + 1;
        const nextCrc = espCrc32(nextSeq);
        const writeSector = (otaActiveSector === 0) ? 1 : 0;
        const targetSectorAddr = otaDataOffset + (writeSector * 4096);

        const buf = new Uint8Array(4096).fill(0xff);
        buf[0] = nextSeq & 0xff;
        buf[1] = (nextSeq >> 8) & 0xff;
        buf[2] = (nextSeq >> 16) & 0xff;
        buf[3] = (nextSeq >> 24) & 0xff;
        buf[24] = 0xff; buf[25] = 0xff; buf[26] = 0xff; buf[27] = 0xff;
        buf[28] = nextCrc & 0xff;
        buf[29] = (nextCrc >> 8) & 0xff;
        buf[30] = (nextCrc >> 16) & 0xff;
        buf[31] = (nextCrc >> 24) & 0xff;

        await otaEsploader.writeFlash({
          fileArray: [{ data: buf, address: targetSectorAddr }],
          flashSize: "keep",
          flashMode: "keep",
          flashFreq: "keep",
          eraseAll: false,
          compress: true
        });

        statusEl.textContent = \`✅ Successfully pointed bootloader to Slot \${targetSlot}! Resetting board...\`;
        await otaEsploader.after("hard_reset");
        alert(\`Device is rebooting from Slot \${targetSlot}!\`);
        await disconnectInspector();
      } catch (err: any) {
        console.error(err);
        statusEl.textContent = "Error switching boot slot: " + err.message;
      }
    }

    async function startSmartFlash() {
      if (!otaEsploader) return;
      const ver = (document.getElementById("otaFwSelect") as HTMLSelectElement).value;
      const chip = otaEsploader.chip.CHIP_NAME.toLowerCase().replace(/[^a-z0-9]/g, "");
      const chipFamily = chip.includes("s3") ? "esp32s3" : (chip.includes("c") ? "esp32c5" : "esp32");

      const isSlot0Active = (otaActiveSlot === 0);
      const targetSlot = isSlot0Active ? 1 : 0;
      const targetPart = isSlot0Active ? otaSlot1Part : otaSlot0Part;

      if (!targetPart) {
        alert("Target slot partition was not found in partition table!");
        return;
      }

      if (!confirm(\`Flash firmware v\${ver} into Slot \${targetSlot} (\${targetPart.label} at 0x\${targetPart.offset.toString(16)}) without touching NVS credentials or bootloader?\`)) return;

      const progressWrap = document.getElementById("otaProgressWrapper");
      const progressBar = document.getElementById("otaProgressBar");
      const progressLabel = document.getElementById("otaProgressLabel");
      const progressPercent = document.getElementById("otaProgressPercent");
      progressWrap.style.display = "block";
      progressLabel.textContent = \`Downloading firmware-\${chipFamily}-v\${ver}.bin...\`;
      progressBar.style.width = "10%";

      try {
        const binUrl = \`firmware/firmware-\${chipFamily}-v\${ver}.bin\`;
        const binResp = await fetch(binUrl);
        if (!binResp.ok) throw new Error(\`Failed to download firmware binary (\${binResp.status}): \${binUrl}\`);
        const binBuf = new Uint8Array(await binResp.arrayBuffer());

        if (binBuf.length > targetPart.size) {
          throw new Error(\`Firmware size (\${(binBuf.length / (1024*1024)).toFixed(2)} MB) exceeds partition size (\${(targetPart.size / (1024*1024)).toFixed(2)} MB)!\`);
        }

        progressLabel.textContent = \`Writing firmware into 0x\${targetPart.offset.toString(16)}...\`;

        await otaEsploader.writeFlash({
          fileArray: [{ data: binBuf, address: targetPart.offset }],
          flashSize: "keep",
          flashMode: "keep",
          flashFreq: "keep",
          eraseAll: false,
          compress: true,
          reportProgress: (fileIndex: any, written: number, total: number) => {
            const pct = Math.floor((written / total) * 100);
            progressBar.style.width = pct + "%";
            progressPercent.textContent = pct + "%";
            progressLabel.textContent = \`Writing to Slot \${targetSlot}: \${written} / \${total} bytes\`;
          }
        });

        progressLabel.textContent = \`Updating otadata to boot from Slot \${targetSlot}...\`;
        const nextSeq = (otaActiveSeq || 1) + 1;
        const nextCrc = espCrc32(nextSeq);
        const writeSector = (otaActiveSector === 0) ? 1 : 0;
        const targetSectorAddr = otaDataOffset + (writeSector * 4096);

        const otaBuf = new Uint8Array(4096).fill(0xff);
        otaBuf[0] = nextSeq & 0xff;
        otaBuf[1] = (nextSeq >> 8) & 0xff;
        otaBuf[2] = (nextSeq >> 16) & 0xff;
        otaBuf[3] = (nextSeq >> 24) & 0xff;
        otaBuf[24] = 0xff; otaBuf[25] = 0xff; otaBuf[26] = 0xff; otaBuf[27] = 0xff;
        otaBuf[28] = nextCrc & 0xff;
        otaBuf[29] = (nextCrc >> 8) & 0xff;
        otaBuf[30] = (nextCrc >> 16) & 0xff;
        otaBuf[31] = (nextCrc >> 24) & 0xff;

        await otaEsploader.writeFlash({
          fileArray: [{ data: otaBuf, address: targetSectorAddr }],
          flashSize: "keep",
          flashMode: "keep",
          flashFreq: "keep",
          eraseAll: false,
          compress: true
        });

        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        progressLabel.textContent = "Flashing complete! Resetting board...";

        await otaEsploader.after("hard_reset");
        alert(\`Flashing complete! Board has been rebooted into Slot \${targetSlot} (v\${ver}). Existing working firmware remains safely in Slot \${isSlot0Active ? 0 : 1} and can be reverted anytime!\`);
        await disconnectInspector();
      } catch (err: any) {
        console.error(err);
        alert("Smart flash failed: " + err.message);
        progressLabel.textContent = "Error: " + err.message;
      }
    }

    async function disconnectInspector() {
      try {
        if (otaEsploader && otaEsploader.transport) {
          await otaEsploader.transport.disconnect();
        } else if (otaPort) {
          await otaPort.close();
        }
      } catch (e) {}
      otaEsploader = null;
      otaTransport = null;
      otaPort = null;
      document.getElementById("btnDisconnectInspect").style.display = "none";
      document.getElementById("btnConnectInspect").textContent = "🔍 Connect & Inspect";
      document.getElementById("otaInspectStatus").textContent = "Disconnected from board.";
    }

    let currentFlashMode = "clean";
    function setFlashMode(mode) {
      currentFlashMode = mode;
      document.getElementById("modeCleanLabel").classList.toggle("active", mode === "clean");
      document.getElementById("modeUpdateLabel").classList.toggle("active", mode === "update");
      const notice = document.getElementById("updatePreserveNotice");
      if (notice) notice.style.display = (mode === "update") ? "block" : "none";
      updateFlasherManifest();
    }

    function updateFlasherManifest() {
      const board = document.getElementById("flasherBoardSelect").value;
      const ver = document.getElementById("flasherVerSelect").value;
      const isUpdate = (currentFlashMode === "update");

      const btn = document.getElementById("espWebInstallBtn");
      const manifestFile = isUpdate ? \`manifest-v\${ver}-update.json\` : \`manifest-v\${ver}.json\`;
      btn.manifest = manifestFile;
      btn.setAttribute("manifest", manifestFile);

      const channelLabel = ver.includes("canary") ? "Canary" : "Stable";
      document.getElementById("modal-ver-badge").textContent = \`v\${ver} \${channelLabel} (\${board.toUpperCase()})\`;
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
        allStations = stations || [];

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
        const mock = loadMockData(7);
        cachedHistory = mock;
        document.getElementById("station-subtitle").innerHTML =
          "<div>Station: <b>demo</b> • Location: <b>Demo Mode</b> • <span class='badge badge-amber'>Node FW v1.1.5</span></div>" +
          "<div style='font-size:0.8rem; color:var(--text-muted); margin-top:3px;'>⏱️ Uptime: <b>7 days, 0 hours</b> • <b>1008</b> demo telemetry points recorded</div>";
        updateSummaryCards({ station_id: "demo", location: "Demo Mode", firmware_version: "1.1.5" }, mock[mock.length - 1]);
        renderOverlayChart(mock, activeMetric);
        renderHistoryChart(mock);
        renderTimingChart(mock, benchmarkRange);
        renderBatteryAnalytics(mock);
        const rfSec = document.getElementById("rf-monitor-section");
        if (rfSec) rfSec.style.display = "block";
        renderRfHeatmap(mock);
      }
    }

    function formatUptime(startIso) {
      if (!startIso) return "0 hours";
      const startMs = new Date(startIso).getTime();
      const diffMs = Math.max(0, Date.now() - startMs);
      const days = Math.floor(diffMs / (86400 * 1000));
      const hours = Math.floor((diffMs % (86400 * 1000)) / (3600 * 1000));
      const dayStr = days === 1 ? "1 day" : \`\${days} days\`;
      const hrStr = hours === 1 ? "1 hour" : \`\${hours} hours\`;
      return days > 0 ? \`\${dayStr}, \${hrStr}\` : hrStr;
    }

    function computeVoltageMax(maxV) {
      if (!maxV || maxV <= 0) return 5;
      const target = maxV * 1.08;
      if (target <= 5) return 5;
      if (target <= 6) return 6;
      if (target <= 7) return 7;
      if (target <= 8) return 8;
      return Math.ceil(target);
    }

    function computePowerMax(maxP) {
      if (!maxP || maxP <= 0) return 500;
      const target = maxP * 1.15;
      if (target <= 100) return 100;
      if (target <= 250) return 250;
      if (target <= 500) return 500;
      if (target <= 1000) return 1000;
      if (target <= 2000) return 2000;
      if (target <= 5000) return 5000;
      return Math.ceil(target / 500) * 500;
    }

    function extractPowerMw(r) {
      if (!r) return 0;
      if (r.power_mw != null && !isNaN(r.power_mw)) return Number(r.power_mw);
      if (r.raw_payload) {
        try {
          const raw = typeof r.raw_payload === "string" ? JSON.parse(r.raw_payload) : r.raw_payload;
          if (raw?.power_mw != null && !isNaN(raw.power_mw)) return Number(raw.power_mw);
          if (raw?.ina3221?.ch1_solar?.power_mw != null && !isNaN(raw.ina3221.ch1_solar.power_mw)) return Number(raw.ina3221.ch1_solar.power_mw);
          if (raw?.ina3221?.ch1_solar?.voltage_v != null && raw?.ina3221?.ch1_solar?.current_ma != null) {
            return Number((raw.ina3221.ch1_solar.voltage_v * raw.ina3221.ch1_solar.current_ma).toFixed(1));
          }
        } catch (_) {}
      }
      return 0;
    }

    function toggleBatteryGraph() {
      const collapseEl = document.getElementById("battery-chart-collapse");
      const toggleBtn = document.getElementById("btn-toggle-battery-graph");
      const rangeToggle = document.getElementById("battery-range-toggle");
      if (!collapseEl) return;
      if (collapseEl.style.display === "none" || collapseEl.style.display === "") {
        collapseEl.style.display = "block";
        if (rangeToggle) rangeToggle.style.display = "inline-flex";
        if (toggleBtn) toggleBtn.textContent = "📉 Hide Trend Graph";
        if (cachedHistory && cachedHistory.length > 0) {
          renderBatteryAnalytics(cachedHistory);
        }
      } else {
        collapseEl.style.display = "none";
        if (rangeToggle) rangeToggle.style.display = "none";
        if (toggleBtn) toggleBtn.textContent = "📈 Show Trend Graph";
      }
    }

    async function loadStationData(stationId) {
      document.getElementById("station-subtitle").textContent = "Fetching telemetry for " + stationId + "...";
      try {
        const resp = await fetch(API_BASE + "/api/history?station_id=" + encodeURIComponent(stationId) + "&days=7");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();

        cachedHistory = data.measurements || [];
        currentStationRecord = data.station || null;
        try { updateSummaryCards(data.station, cachedHistory[cachedHistory.length - 1]); } catch(e) { console.error("updateSummaryCards error:", e); }
        try { renderOverlayChart(cachedHistory, activeMetric); } catch(e) { console.error("renderOverlayChart error:", e); }
        try { renderHistoryChart(cachedHistory); } catch(e) { console.error("renderHistoryChart error:", e); }
        try { renderTimingChart(cachedHistory, benchmarkRange); } catch(e) { console.error("renderTimingChart error:", e); }
        try { renderBatteryAnalytics(cachedHistory); } catch(e) { console.error("renderBatteryAnalytics error:", e); }

        const hasRf = cachedHistory.some(r =>
          (r.wifi_channels_json && r.wifi_channels_json !== "null" && r.wifi_channels_json !== "[]") ||
          (r.wifi_max_packets && r.wifi_max_packets > 0) ||
          (r.ble_unique_devices && r.ble_unique_devices > 0)
        ) || (data.station && (data.station.power_mode === 3 || data.station.station_id === "demo"));

        const rfSec = document.getElementById("rf-monitor-section");
        if (rfSec) {
          rfSec.style.display = hasRf ? "block" : "none";
        }
        if (hasRf) {
          try { renderRfHeatmap(cachedHistory); } catch(e) { console.error("renderRfHeatmap error:", e); }
        }

        const nodeFw = (data.station && data.station.firmware_version) ? ("Node FW v" + data.station.firmware_version) : "Node FW v1.1.5";
        const canaryBadge = (data.station && data.station.is_canary) ? " <span class='badge badge-blue'>Canary</span>" : "";
        const uptimeStr = formatUptime(data.station?.created_at || (cachedHistory.length > 0 ? cachedHistory[0].timestamp : null));
        document.getElementById("station-subtitle").innerHTML =
          "<div>Station: <b>" + stationId + "</b> • Location: <b>" + (data.station?.location || "Solar Site") + "</b>" +
          " • <span class='badge badge-amber'>" + nodeFw + "</span>" + canaryBadge + "</div>" +
          "<div style='font-size:0.8rem; color:var(--text-muted); margin-top:3px;'>" +
          "⏱️ Uptime: <b>" + uptimeStr + "</b> • <b>" + cachedHistory.length + "</b> telemetry points recorded</div>";
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
      if (range === "recent" || (days <= 7 && cachedHistory.length >= 10)) {
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
        renderRfHeatmap(mockExt);
      } else {
        renderTimingChart(cachedHistory, range);
        renderRfHeatmap(cachedHistory);
      }
    }

    function updateSummaryCards(station, latest) {
      if (!latest && !station) return;

      // Check if LiPo telemetry is disabled
      const isLipoDisabled = (station && station.enable_lipo === 0 && (!station.battery_mv || station.battery_mv <= 0) && (!latest || !latest.lipo_mv || latest.lipo_mv <= 0));

      const lipoCard = document.getElementById("card-lipo");
      const batteryAnalyticsCard = document.getElementById("battery-analytics-card");
      const lipoToggleBtn = document.querySelector('#overlay-metric-toggle button[data-metric="lipo"]');

      if (isLipoDisabled) {
        if (lipoCard) lipoCard.style.display = "none";
        if (batteryAnalyticsCard) batteryAnalyticsCard.style.display = "none";
        if (lipoToggleBtn) lipoToggleBtn.style.display = "none";
        if (activeMetric === "lipo") {
          activeMetric = "solar";
          document.querySelectorAll("#overlay-metric-toggle button").forEach(b => {
            b.classList.toggle("active", b.dataset.metric === "solar");
          });
        }
      } else {
        if (lipoCard) lipoCard.style.display = "block";
        if (batteryAnalyticsCard) batteryAnalyticsCard.style.display = "block";
        if (lipoToggleBtn) lipoToggleBtn.style.display = "inline-block";
      }

      const solarMv = latest ? latest.solar_mv : (station.solar_mv || 0);
      const lipoMv  = latest ? latest.lipo_mv  : (station.battery_mv || 3800);
      const tempC   = latest ? latest.temp_c   : (station.temp_c || 28.5);

      const solarV = (solarMv / 1000).toFixed(2);
      const lipoV  = (lipoMv / 1000).toFixed(2);

      const solarEl = document.getElementById("solar-val");
      if (solarEl) solarEl.innerHTML = solarV + ' <span class="card-unit">V</span>';

      // Solar Power metric
      const powerMw = extractPowerMw(latest);
      const powerEl = document.getElementById("power-val");
      if (powerEl) {
        if (powerMw >= 1000) {
          powerEl.innerHTML = (powerMw / 1000).toFixed(2) + ' <span class="card-unit">W</span>';
        } else {
          powerEl.innerHTML = Math.round(powerMw) + ' <span class="card-unit">mW</span>';
        }
      }

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

      // Check for INA3221 Telemetry in raw payload (CH1, CH2, CH3)
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

              // Channel 1: Solar Panel
              const ch1 = ina.ch1_solar || ina.ch1;
              const ch1Box = document.getElementById("ina-ch1-box");
              if (ch1 && ch1Box) {
                ch1Box.style.display = "block";
                const pwr = (ch1.power_mw !== undefined) ? ch1.power_mw : ((ch1.voltage_v || 0) * (ch1.current_ma || 0));
                const v = ch1.voltage_v || 0;
                const ma = ch1.current_ma || 0;
                const elPwr = document.getElementById("ina-solar-pwr");
                const elDet = document.getElementById("ina-solar-details");
                if (elPwr) elPwr.textContent = pwr.toFixed(1) + " mW";
                if (elDet) elDet.textContent = \`\${v.toFixed(2)} V • \${ma.toFixed(1)} mA\`;
              } else if (ch1Box) {
                ch1Box.style.display = "none";
              }

              // Channel 2: Battery / Aux (shown whenever CH2 data is submitted)
              const ch2 = ina.ch2_battery || ina.ch2_bat || ina.ch2_lipo || ina.ch2_aux || ina.ch2 || ina.ch2_load;
              const ch2Box = document.getElementById("ina-ch2-box");
              if (ch2Box) {
                if (ch2) {
                  ch2Box.style.display = "block";
                  const pwr = (ch2.power_mw !== undefined) ? ch2.power_mw : ((ch2.voltage_v || 0) * (ch2.current_ma || 0));
                  const v = ch2.voltage_v || 0;
                  const ma = ch2.current_ma || 0;
                  const res = (ch2.resistance_ohm && ch2.resistance_ohm > 0) ? \` • Res: \${ch2.resistance_ohm.toFixed(1)} Ω\` : "";
                  const elPwr = document.getElementById("ina-ch2-pwr");
                  const elDet = document.getElementById("ina-ch2-details");
                  if (elPwr) elPwr.textContent = pwr.toFixed(1) + " mW";
                  if (elDet) elDet.textContent = \`\${v.toFixed(2)} V • \${ma.toFixed(1)} mA\${res}\`;
                } else {
                  ch2Box.style.display = "none";
                }
              }

              // Channel 3: Connected Load
              const ch3 = ina.ch3_load || ina.ch3;
              const ch3Box = document.getElementById("ina-ch3-box");
              if (ch3 && ch3Box) {
                ch3Box.style.display = "block";
                const pwr = (ch3.power_mw !== undefined) ? ch3.power_mw : ((ch3.voltage_v || 0) * (ch3.current_ma || 0));
                const v = ch3.voltage_v || 0;
                const ma = ch3.current_ma || 0;
                const res = (ch3.resistance_ohm && ch3.resistance_ohm > 0) ? \` • Res: \${ch3.resistance_ohm.toFixed(1)} Ω\` : "";
                const elPwr = document.getElementById("ina-load-pwr");
                const elDet = document.getElementById("ina-load-details");
                if (elPwr) elPwr.textContent = pwr.toFixed(1) + " mW";
                if (elDet) elDet.textContent = \`\${v.toFixed(2)} V • \${ma.toFixed(1)} mA\${res}\`;
              } else if (ch3Box) {
                ch3Box.style.display = "none";
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
      const elDrop24 = document.getElementById("est-drop-24h");
      const elRun24  = document.getElementById("est-runtime-24h");
      if (r24h.length >= 2) {
        const first24 = r24h[0];
        const firstMv = first24.lipo_mv || Math.round((first24.lipo_v || 3.8) * 1000);
        const deltaMv = latestMv - firstMv; // positive = net charged, negative = discharged
        if (elDrop24) elDrop24.textContent = \`ΔV: \${deltaMv >= 0 ? "+" : ""}\${deltaMv} mV / 24h\`;

        if (elRun24) {
          if (deltaMv >= 0) {
            elRun24.innerHTML = \`<span style="color:#10b981;">&infin; Days <span style="font-size:0.85rem;font-weight:normal;color:#8b949e;">(Float)</span></span>\`;
          } else {
            const dropPerDay = Math.abs(deltaMv);
            const daysLeft = dropPerDay > 0 ? (headroomMv / dropPerDay).toFixed(1) : "999";
            elRun24.innerHTML = \`\${daysLeft} <span style="font-size:0.85rem;font-weight:normal;color:#8b949e;">Days</span>\`;
          }
        }
      } else {
        if (elRun24) elRun24.innerHTML = \`> 14 <span style="font-size:0.85rem;font-weight:normal;color:#8b949e;">Days</span>\`;
        if (elDrop24) elDrop24.textContent = "Insufficient 24h baseline";
      }

      // 2. 7-Day Trend calculation
      const r7d = records.filter(r => new Date(r.timestamp).getTime() >= cutoff7d);
      const elRun7 = document.getElementById("est-runtime-7d");
      const elDrop7 = document.getElementById("est-drop-7d");
      if (r7d.length >= 2) {
        const first7 = r7d[0];
        const firstMv = first7.lipo_mv || Math.round((first7.lipo_v || 3.8) * 1000);
        const daySpan = Math.max(1, (new Date(latest.timestamp) - new Date(first7.timestamp)) / (24 * 3600 * 1000));
        const avgDailyDrop = (firstMv - latestMv) / daySpan;

        if (avgDailyDrop <= 0) {
          if (elRun7) elRun7.innerHTML = \`<span style="color:#10b981;">&infin; Days <span style="font-size:0.85rem;font-weight:normal;color:#8b949e;">(Stable)</span></span>\`;
          if (elDrop7) elDrop7.textContent = \`Net Gain: +\${Math.abs(avgDailyDrop).toFixed(1)} mV/day\`;
        } else {
          const daysLeft = (headroomMv / avgDailyDrop).toFixed(1);
          if (elRun7) elRun7.innerHTML = \`\${daysLeft} <span style="font-size:0.85rem;font-weight:normal;color:#8b949e;">Days</span>\`;
          if (elDrop7) elDrop7.textContent = \`Avg drop: \${avgDailyDrop.toFixed(1)} mV/day\`;
        }
      } else {
        if (elRun7) elRun7.innerHTML = \`~ 21 <span style="font-size:0.85rem;font-weight:normal;color:#8b949e;">Days</span>\`;
        if (elDrop7) elDrop7.textContent = "Estimated nominal autonomy";
      }

      // 3. 30-Day Autonomy calculation
      const r30d = records.filter(r => new Date(r.timestamp).getTime() >= cutoff30d);
      const elRun30 = document.getElementById("est-runtime-30d");
      const elDrop30 = document.getElementById("est-drop-30d");
      if (r30d.length >= 2) {
        const first30 = r30d[0];
        const firstMv = first30.lipo_mv || Math.round((first30.lipo_v || 3.8) * 1000);
        const daySpan = Math.max(1, (new Date(latest.timestamp) - new Date(first30.timestamp)) / (24 * 3600 * 1000));
        const avgDailyDrop = (firstMv - latestMv) / daySpan;

        if (avgDailyDrop <= 0) {
          if (elRun30) elRun30.innerHTML = \`<span style="color:#10b981;">&infin; Days <span style="font-size:0.85rem;font-weight:normal;color:#8b949e;">(Float)</span></span>\`;
          if (elDrop30) elDrop30.textContent = "Daily Solar Replenishment";
        } else {
          const daysLeft = (headroomMv / avgDailyDrop).toFixed(1);
          if (elRun30) elRun30.innerHTML = \`\${daysLeft} <span style="font-size:0.85rem;font-weight:normal;color:#8b949e;">Days</span>\`;
          if (elDrop30) elDrop30.textContent = \`30d Trend: \${avgDailyDrop.toFixed(1)} mV/day\`;
        }
      } else {
        if (elRun30) elRun30.innerHTML = \`&infin; <span style="font-size:0.85rem;font-weight:normal;color:#8b949e;">Days (Solar)</span>\`;
        if (elDrop30) elDrop30.textContent = "Solar float replenishment";
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
      const minVal = validValues.length ? Math.min(...validValues) : 3.7;
      const maxVal = validValues.length ? Math.max(...validValues) : 4.2;
      const yMin = Math.max(minVal >= 3.0 ? 3.0 : 0, Number((Math.floor(minVal * 10) / 10 - 0.1).toFixed(1)));
      const yMax = Math.max(4.2, Number((Math.ceil(maxVal * 10) / 10 + 0.1).toFixed(1)));

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
          interaction: { mode: "index", intersect: false },
          scales: {
            x: { grid: { color: "#21262d" }, ticks: { maxTicksLimit: 8, color: "#8b949e" } },
            y: { min: yMin, max: yMax, grid: { color: "#21262d" }, ticks: { color: "#8b949e" }, title: { display: true, text: "Battery (V)", color: "#10b981" } }
          },
          plugins: {
            legend: { labels: { color: "#f0f6fc" } },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = ctx.parsed.y;
                  const mv = Math.round(v * 1000);
                  return \`LiPo Voltage: \${v.toFixed(3)} V (\${mv} mV)\`;
                }
              }
            }
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
        else if (metric === "power") val = extractPowerMw(r);
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

      // Dynamic Y-axis limits ensuring auto-scale relative to data shown (last 3 days)
      const maxSolar = Math.max(...records.map(r => r.solar_v || ((r.solar_mv || 0) / 1000.0)), 0);
      const solarYMax = computeVoltageMax(maxSolar);

      const maxPower = Math.max(...records.map(r => extractPowerMw(r)), 0);
      const powerYMax = computePowerMax(maxPower);

      const minTemp = Math.min(...records.map(r => (typeof r.temp_c === "number" ? r.temp_c : 100)), 20);
      const tempYMin = Math.max(0, Math.min(10, Math.floor((minTemp - 5) / 5) * 5));
      const tempYMax = Math.max(35, Math.ceil((maxRecordedTemp + 3) / 5) * 5);

      const metricLabels = {
        solar: { label: "Solar Panel Voltage (V)", unit: "V", yMin: 0, yMax: solarYMax },
        power: { label: "Solar Panel Power (mW)", unit: "mW", yMin: 0, yMax: powerYMax },
        lipo:  { label: "LiPo Battery Voltage (V)", unit: "V", yMin: 3.0, yMax: 4.4 },
        temp:  { label: "Temperature (°C)", unit: "°C", yMin: tempYMin, yMax: tempYMax }
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
      const powerData = records.map(r => extractPowerMw(r));
      const lipoData  = records.map(r => r.lipo_v  || (r.lipo_mv  / 1000.0));
      const tempData  = records.map(r => r.temp_c);

      const maxSolar = Math.max(...solarData.filter(v => typeof v === "number" && !isNaN(v)), 0);
      const maxLipo  = Math.max(...lipoData.filter(v => typeof v === "number" && !isNaN(v)), 0);
      const voltYMax = computeVoltageMax(Math.max(maxSolar, maxLipo));

      const maxPower = Math.max(...powerData.filter(v => typeof v === "number" && !isNaN(v)), 0);
      const powerYMax = computePowerMax(maxPower);

      const maxTemp = Math.max(...tempData.filter(v => typeof v === "number" && !isNaN(v)), 0);
      const minTemp = Math.min(...tempData.filter(v => typeof v === "number" && !isNaN(v)), 20);
      const tempYMin = Math.max(0, Math.min(10, Math.floor((minTemp - 5) / 5) * 5));
      const tempYMax = Math.max(35, Math.ceil((maxTemp + 3) / 5) * 5);

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
              label: "Solar Power (mW)",
              data: powerData,
              borderColor: "#38bdf8",
              backgroundColor: "rgba(56, 189, 248, 0.05)",
              yAxisID: "y2",
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
              max: voltYMax,
              grid: { color: "#21262d" },
              ticks: { color: "#8b949e" },
              title: { display: true, text: "Voltage (V)", color: "#8b949e" }
            },
            y1: {
              position: "right",
              min: tempYMin,
              max: tempYMax,
              grid: { drawOnChartArea: false },
              ticks: { color: "#ef4444" },
              title: { display: true, text: "Temperature (°C)", color: "#ef4444" }
            },
            y2: {
              position: "right",
              min: 0,
              max: powerYMax,
              grid: { drawOnChartArea: false },
              ticks: { color: "#38bdf8" },
              title: { display: true, text: "Power (mW)", color: "#38bdf8" }
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
        const numHours = 168; // 7 days * 24h
        const currentHour = new Date(now);
        currentHour.setMinutes(0, 0, 0, 0);

        const labels = [];
        const measureMs = [];
        const wifiMs = [];
        const ipMs = [];
        const dnsMs = [];
        const tcpMs = [];
        const tlsMs = [];
        const postMs = [];
        const uploadMs = [];
        const timedRecords = [];

        for (let i = numHours - 1; i >= 0; i--) {
          const slotStart = new Date(currentHour.getTime() - i * 3600 * 1000);
          const slotEnd = new Date(slotStart.getTime() + 3600 * 1000);

          const dayName = slotStart.toLocaleDateString([], { weekday: "short" });
          const timeStr = slotStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          labels.push(\`\${dayName} \${timeStr}\`);

          const slotRecs = timed.filter(r => {
            const t = new Date(r.timestamp).getTime();
            return t >= slotStart.getTime() && t < slotEnd.getTime();
          });

          if (slotRecs.length > 0) {
            let worst = slotRecs[0];
            let maxTotal = 0;
            slotRecs.forEach(r => {
              const tot = r.cycle_total_ms || ((r.cycle_measure_ms || 0) + (r.cycle_wifi_ms || 0) + (r.cycle_ip_ms || 0) + (r.cycle_upload_ms || 0));
              if (tot >= maxTotal) {
                maxTotal = tot;
                worst = r;
              }
            });
            measureMs.push(worst.cycle_measure_ms || 0);
            wifiMs.push(worst.cycle_wifi_ms || 0);
            ipMs.push(worst.cycle_ip_ms || 0);
            dnsMs.push(worst.cycle_dns_ms || 0);
            tcpMs.push(worst.cycle_tcp_ms || 0);
            tlsMs.push(worst.cycle_tls_ms || 0);
            postMs.push((worst.cycle_post_ms || 0) + (worst.cycle_server_ms || 0));
            uploadMs.push(worst.cycle_upload_ms || 0);
            timedRecords.push(worst);
          } else {
            measureMs.push(0);
            wifiMs.push(0);
            ipMs.push(0);
            dnsMs.push(0);
            tcpMs.push(0);
            tlsMs.push(0);
            postMs.push(0);
            uploadMs.push(0);
          }
        }

        return { labels, measureMs, wifiMs, ipMs, dnsMs, tcpMs, tlsMs, postMs, uploadMs, timedRecords };
      }

      if (range === "month") {
        const numDays = 30;
        const todayMidnight = new Date(now);
        todayMidnight.setHours(0, 0, 0, 0);

        const labels = [];
        const measureMs = [];
        const wifiMs = [];
        const ipMs = [];
        const dnsMs = [];
        const tcpMs = [];
        const tlsMs = [];
        const postMs = [];
        const uploadMs = [];
        const timedRecords = [];

        for (let i = numDays - 1; i >= 0; i--) {
          const slotStart = new Date(todayMidnight.getTime() - i * 86400 * 1000);
          const slotEnd = new Date(slotStart.getTime() + 86400 * 1000);

          const dateStr = slotStart.toLocaleDateString([], { month: "short", day: "numeric" });
          labels.push(dateStr);

          const dayRecs = timed.filter(r => {
            const t = new Date(r.timestamp).getTime();
            return t >= slotStart.getTime() && t < slotEnd.getTime();
          });

          if (dayRecs.length > 0) {
            const avg = (fn) => Math.round(dayRecs.reduce((a, b) => a + (fn(b) || 0), 0) / dayRecs.length);
            measureMs.push(avg(r => r.cycle_measure_ms));
            wifiMs.push(avg(r => r.cycle_wifi_ms));
            ipMs.push(avg(r => r.cycle_ip_ms));
            dnsMs.push(avg(r => r.cycle_dns_ms));
            tcpMs.push(avg(r => r.cycle_tcp_ms));
            tlsMs.push(avg(r => r.cycle_tls_ms));
            postMs.push(avg(r => (r.cycle_post_ms || 0) + (r.cycle_server_ms || 0)));
            uploadMs.push(avg(r => r.cycle_upload_ms));
            dayRecs.forEach(r => timedRecords.push(r));
          } else {
            measureMs.push(0);
            wifiMs.push(0);
            ipMs.push(0);
            dnsMs.push(0);
            tcpMs.push(0);
            tlsMs.push(0);
            postMs.push(0);
            uploadMs.push(0);
          }
        }

        return { labels, measureMs, wifiMs, ipMs, dnsMs, tcpMs, tlsMs, postMs, uploadMs, timedRecords };
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
          subtitle.textContent = "7-day execution trends (168 hourly peak stage durations)";
        } else if (range === "month") {
          subtitle.textContent = "30-day historical latency (30 daily averaged stage durations)";
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
            x: { stacked: true, grid: { color: "#21262d" }, ticks: { maxTicksLimit: range === "month" ? 15 : (range === "week" ? 14 : 12), color: "#8b949e" } },
            y: { stacked: true, grid: { color: "#21262d" }, ticks: { color: "#8b949e" }, title: { display: true, text: "Active Time (ms)", color: "#8b949e" } }
          },
          plugins: {
            legend: { labels: { color: "#f0f6fc" } }
          }
        }
      });
    }

    function loadMockData(days = 7) {
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
        const mockPower = solarMv > 1000 ? Math.round((solarMv / 1000) * 320.5) : 0;

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
          power_mw: mockPower,
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
            power_mw: mockPower,
            ina3221: {
              ch1_solar: { voltage_v: solarMv / 1000, current_ma: solarMv > 1000 ? 320.5 : 0, power_mw: mockPower },
              ch2_bat: { voltage_v: lipoMv / 1000, current_ma: solarMv > 1000 ? 150.2 : -45.0, power_mw: solarMv > 1000 ? Math.round(lipoMv / 1000 * 150.2) : Math.round(lipoMv / 1000 * -45.0) },
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
        renderRfHeatmap(cachedRfRecords);
      }
    }

    function changeRfPalette(palette) {
      currentRfPalette = palette;
      renderRfHeatmap(cachedRfRecords);
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

    function renderRfHeatmap(records) {
      cachedRfRecords = records || [];
      if (isRfCollapsed) return;

      const canvas = document.getElementById("rfHeatmapCanvas");
      const container = document.getElementById("rf-heatmap-container");
      if (!canvas || !container) return;

      const numRows = 28;
      const numCols = 48; // 48 half-hour slots: 00:00 to 23:30

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayMidnight = today.getTime();

      // Generate the past 7 days info (dayLabels[0] is 6 days ago, dayLabels[6] is Today)
      const dayLabels = [];
      for (let d = 6; d >= 0; d--) {
        const dDate = new Date(todayMidnight - d * 86400 * 1000);
        const dayStr = dDate.toLocaleDateString([], { weekday: "short" });
        dayLabels.push({
          dateMs: dDate.getTime(),
          label: dayStr,
          fullDate: dDate.toLocaleDateString([], { month: "short", day: "numeric" })
        });
      }

      const rowMeta = [];
      // 0..12: Today Wi-Fi channels 1..13
      for (let ch = 1; ch <= 13; ch++) {
        rowMeta.push({ group: 0, label: \`CH \${ch}\`, title: \`Wi-Fi Channel \${ch} (Today)\`, ch: ch, type: "wifi_ch" });
      }
      // 13: Today BLE
      rowMeta.push({ group: 0, label: "BLE", title: "Bluetooth LE Density (Today)", type: "ble_today" });

      // 14..20: 7 Days Most Active Wi-Fi Channel
      for (let i = 0; i < 7; i++) {
        const dl = dayLabels[i];
        rowMeta.push({
          group: 1,
          label: dl.label,
          title: \`Peak Wi-Fi Activity — \${dl.label} (\${dl.fullDate})\`,
          dayIndex: i,
          dateMs: dl.dateMs,
          type: "wifi_7d"
        });
      }

      // 21..27: 7 Days BLE Devices
      for (let i = 0; i < 7; i++) {
        const dl = dayLabels[i];
        rowMeta.push({
          group: 2,
          label: dl.label,
          title: \`BLE Unique Devices — \${dl.label} (\${dl.fullDate})\`,
          dayIndex: i,
          dateMs: dl.dateMs,
          type: "ble_7d"
        });
      }

      // Column labels: 00:00, 00:30, 01:00, ..., 23:30
      const colLabels = [];
      for (let c = 0; c < numCols; c++) {
        const hour = Math.floor(c / 2);
        const min = (c % 2) * 30;
        colLabels.push(\`\${String(hour).padStart(2, "0")}:\${String(min).padStart(2, "0")}\`);
      }

      // Build cell data matrix: cellData[col][row]
      const cellData = [];
      const slotDuration = 30 * 60 * 1000;

      let globalMaxPkts = 0;
      let globalMaxBle = 0;
      const chTotals = new Array(14).fill(0);

      for (let c = 0; c < numCols; c++) {
        cellData[c] = [];
        const slotOffset = c * slotDuration;

        for (let r = 0; r < numRows; r++) {
          const meta = rowMeta[r];
          let maxVal = 0;
          let extraInfo = "";

          if (meta.group === 0) {
            // Today
            const slotStart = todayMidnight + slotOffset;
            const slotEnd = slotStart + slotDuration;
            const slotRecs = cachedRfRecords.filter(rec => {
              const t = new Date(rec.timestamp).getTime();
              return t >= slotStart && t < slotEnd;
            });

            if (meta.type === "wifi_ch") {
              const ch = meta.ch;
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
              chTotals[ch] += maxVal;
              if (maxVal > globalMaxPkts) globalMaxPkts = maxVal;
            } else {
              // BLE today
              slotRecs.forEach(rec => {
                const ble = rec.ble_unique_devices || 0;
                if (ble > maxVal) maxVal = ble;
              });
              if (maxVal > globalMaxBle) globalMaxBle = maxVal;
            }
          } else if (meta.group === 1) {
            // Wi-Fi Peak 7 Days (row 14..20)
            const slotStart = meta.dateMs + slotOffset;
            const slotEnd = slotStart + slotDuration;
            const slotRecs = cachedRfRecords.filter(rec => {
              const t = new Date(rec.timestamp).getTime();
              return t >= slotStart && t < slotEnd;
            });

            let peakCh = 0;
            slotRecs.forEach(rec => {
              const p = rec.wifi_max_packets || 0;
              if (p > maxVal) {
                maxVal = p;
                peakCh = rec.wifi_busiest_channel || 0;
              }
            });
            if (peakCh > 0) extraInfo = \`CH \${peakCh}\`;
            if (maxVal > globalMaxPkts) globalMaxPkts = maxVal;
          } else if (meta.group === 2) {
            // BLE 7 Days (row 21..27)
            const slotStart = meta.dateMs + slotOffset;
            const slotEnd = slotStart + slotDuration;
            const slotRecs = cachedRfRecords.filter(rec => {
              const t = new Date(rec.timestamp).getTime();
              return t >= slotStart && t < slotEnd;
            });

            slotRecs.forEach(rec => {
              const ble = rec.ble_unique_devices || 0;
              if (ble > maxVal) maxVal = ble;
            });
            if (maxVal > globalMaxBle) globalMaxBle = maxVal;
          }

          cellData[c][r] = {
            val: maxVal,
            timeLabel: colLabels[c],
            meta: meta,
            extraInfo: extraInfo
          };
        }
      }

      // Summary KPIs
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
      const height = 560;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";

      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, width, height);

      const margin = { left: 54, right: 16, top: 22, bottom: 26 };
      const bleDivider = 8; // Distance between 13 channels and BLE
      const groupDivider = 22; // Gap before 7-day groups (lowered by one line for headings)
      const totalDividers = bleDivider + 2 * groupDivider;
      const plotWidth = width - margin.left - margin.right;
      const plotHeight = height - margin.top - margin.bottom - totalDividers;

      const gapX = 1.2;
      const gapY = 1.2;
      const cellW = (plotWidth - (numCols - 1) * gapX) / numCols;
      const cellH = (plotHeight - (numRows - 1) * gapY) / numRows;

      // Calculate row Y positions accounting for group dividers
      const rowYPositions = [];
      let currentY = margin.top;
      for (let r = 0; r < numRows; r++) {
        if (r === 13) {
          currentY += bleDivider;
        } else if (r === 14 || r === 21) {
          currentY += groupDivider;
        }
        rowYPositions[r] = currentY;
        currentY += cellH + gapY;
      }

      rfGridMeta = {
        margin,
        cellW,
        cellH,
        gapX,
        gapY,
        numCols,
        numRows,
        cellData,
        rowYPositions,
        rowMeta,
        colLabels,
        width,
        height
      };

      const scaleNorm = Math.max(10, globalMaxPkts, globalMaxBle * 15);

      // Draw Group Section Headings
      ctx.font = "9px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";

      ctx.fillStyle = "#8b949e";
      ctx.fillText("2.4 GHz SPECTRUM (TODAY)", margin.left, margin.top - 5);

      ctx.fillStyle = "#f59e0b";
      ctx.fillText("WI-FI PEAK ACTIVITY (LAST 7 DAYS)", margin.left, rowYPositions[14] - 6);

      ctx.fillStyle = "#38bdf8";
      ctx.fillText("BLE DEVICE DENSITY (LAST 7 DAYS)", margin.left, rowYPositions[21] - 6);

      // Draw Grid Cells
      for (let c = 0; c < numCols; c++) {
        const x = margin.left + c * (cellW + gapX);
        for (let r = 0; r < numRows; r++) {
          const item = cellData[c][r];
          const y = rowYPositions[r];

          if (item.val === 0) {
            ctx.fillStyle = "#161b22";
            ctx.fillRect(x, y, cellW, cellH);
          } else {
            const isBle = (item.meta.type === "ble_today" || item.meta.type === "ble_7d");
            const effectiveVal = isBle ? item.val * 15 : item.val;
            const t = Math.log(1 + effectiveVal) / Math.log(1 + scaleNorm);
            ctx.fillStyle = interpolatePalette(t, currentRfPalette);
            ctx.fillRect(x, y, cellW, cellH);
          }
        }
      }

      // Draw Row Labels
      ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      for (let r = 0; r < numRows; r++) {
        const y = rowYPositions[r] + cellH / 2;
        const meta = rowMeta[r];
        if (meta.group === 0) {
          ctx.fillStyle = (r === 13) ? "#38bdf8" : "#8b949e";
        } else if (meta.group === 1) {
          ctx.fillStyle = "#f59e0b";
        } else {
          ctx.fillStyle = "#38bdf8";
        }
        ctx.fillText(meta.label, margin.left - 6, y);
      }

      // Draw Column Ticks (X-Axis)
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#8b949e";

      for (let c = 0; c < numCols; c += 6) {
        const x = margin.left + c * (cellW + gapX) + cellW / 2;
        ctx.fillText(colLabels[c], x, rowYPositions[numRows - 1] + cellH + 6);
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

        const { margin, cellW, cellH, gapX, numCols, numRows, cellData, rowYPositions } = rfGridMeta;

        if (
          mouseX >= margin.left &&
          mouseX <= margin.left + numCols * (cellW + gapX) &&
          mouseY >= margin.top &&
          mouseY <= rowYPositions[numRows - 1] + cellH
        ) {
          const col = Math.floor((mouseX - margin.left) / (cellW + gapX));
          let row = -1;
          for (let r = 0; r < numRows; r++) {
            if (mouseY >= rowYPositions[r] && mouseY <= rowYPositions[r] + cellH) {
              row = r;
              break;
            }
          }

          if (col >= 0 && col < numCols && row >= 0 && row < numRows) {
            const item = cellData[col][row];
            if (tooltip) {
              const isBle = (item.meta.type === "ble_today" || item.meta.type === "ble_7d");
              const unit = isBle ? "unique devices" : "pkts/s";
              const extra = item.extraInfo ? \` (\${item.extraInfo})\` : "";
              tooltip.innerHTML = \`
                <div style="font-weight:600; color:\${isBle ? '#38bdf8' : '#fbbf24'};">\${item.meta.title}</div>
                <div>Time: \${item.timeLabel}</div>
                <div>Activity: <b>\${item.val}</b> \${unit}\${extra}</div>
              \`;
              tooltip.style.display = "block";
              const ttLeft = Math.min(container.clientWidth - 180, mouseX + 12);
              const ttTop = Math.max(10, mouseY - 45);
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
          renderRfHeatmap(cachedRfRecords);
        }
      });
    }

    window.addEventListener("DOMContentLoaded", init);
  </script>
</body>
</html>
`;
}

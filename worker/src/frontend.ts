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
          <span class="badge badge-blue" style="font-size:0.75rem;vertical-align:middle;margin-left:0.5rem;" title="Web Dashboard Application Version">Web v1.0.2</span>
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
          <span class="badge badge-amber" id="solar-status">Active</span>
        </div>
        <div class="card-value" id="solar-val">-- <span class="card-unit">V</span></div>
        <div class="card-sub" id="solar-mv">-- mV (Divider 1k:1k)</div>
      </div>

      <div class="card">
        <div class="card-label">
          <span>LiPo Battery</span>
          <span class="badge badge-green" id="battery-status">Nominal</span>
        </div>
        <div class="card-value" id="battery-val">-- <span class="card-unit">V</span></div>
        <div class="card-sub" id="battery-mv">-- mV (~--% SoC)</div>
      </div>

      <div class="card">
        <div class="card-label">
          <span>Temperature</span>
          <span class="badge badge-blue" id="temp-badge">Enclosure</span>
        </div>
        <div class="card-value" id="temp-val">-- <span class="card-unit">°C</span></div>
        <div class="card-sub" id="temp-f">-- °F (Sun Range 10-75°C)</div>
      </div>

      <div class="card">
        <div class="card-label">
          <span>Active Cycle Time</span>
          <span class="badge badge-blue">Telemetry</span>
        </div>
        <div class="card-value" id="cycle-total">-- <span class="card-unit">ms</span></div>
        <div class="card-sub" id="cycle-http">HTTP -- &bull; Benchmark</div>
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
          <div class="chart-title">Node Execution Latency &amp; Cycle Benchmarks</div>
          <div class="subtitle">Stage durations: Sensor measurement, Wi-Fi association, DHCP IP, and TLS telemetry upload</div>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="timingChart"></canvas>
      </div>

      <!-- Execution Stage Durations Summary -->
      <div class="bench-grid">
        <div class="bench-item">
          <div class="bench-val" id="bench-measure">-- ms</div>
          <div class="bench-label">Sensor Measurement</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-wifi">-- ms</div>
          <div class="bench-label">Wi-Fi Association</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-ip">-- ms</div>
          <div class="bench-label">IP Address DHCP</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-upload">-- ms</div>
          <div class="bench-label">TLS &amp; HTTP Upload</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-total">-- ms</div>
          <div class="bench-label">Total Active Time</div>
        </div>
      </div>
    </div>

    <footer>
      <p>ESP32 Solar Telemetry Fleet &bull; Minimal SPIFFS &bull; Dual OTA &bull; Cloudflare Edge &amp; D1 Database</p>
      <p>
        <a href="https://github.com/kreier/solar" target="_blank">kreier/solar on GitHub</a> &bull;
        <span>Website v1.0.2</span> &bull;
        <span>Firmware v<span id="fw-version">1.0.2</span> (Stable)</span> &bull;
        <span class="badge badge-amber" style="padding:0.1rem 0.4rem;">v1.1.0 Canary</span> &bull;
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
                <option value="1.1.0-canary">v1.1.0 Canary (Deep Sleep, 1h Batch, INA3221)</option>
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
      const manifestUrl = \`manifest.json?board=\${board}&version=\${ver}&mode=\${currentFlashMode}\`;
      btn.setAttribute("manifest", manifestUrl);

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
          stations.forEach((st, idx) => {
            const opt = document.createElement("option");
            opt.value = st.station_id;
            const fwLabel = st.firmware_version ? \` [FW v\${st.firmware_version}]\` : "";
            opt.textContent = \`\${st.station_id} (\${st.location || "Solar Site"})\${fwLabel}\`;
            select.appendChild(opt);
          });
          currentStationId = stations[0].station_id;
        } else {
          currentStationId = "phumy2";
        }

        loadStationData(currentStationId);
      } catch (err) {
        console.warn("Failed to load stations from edge API, loading demo mode:", err);
        const select = document.getElementById("station-select");
        select.innerHTML = '<option value="phumy2">phumy2 (Demo Mode)</option>';
        currentStationId = "phumy2";
        loadMockData();
      }
    }

    async function loadStationData(stationId) {
      document.getElementById("station-subtitle").textContent = "Fetching telemetry for " + stationId + "...";
      try {
        const resp = await fetch(API_BASE + "/api/history?station_id=" + encodeURIComponent(stationId) + "&days=3");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();

        cachedHistory = data.measurements || [];
        updateSummaryCards(data.station, cachedHistory[cachedHistory.length - 1]);
        renderOverlayChart(cachedHistory, activeMetric);
        renderHistoryChart(cachedHistory);
        renderTimingChart(cachedHistory);
        renderBatteryAnalytics(cachedHistory);

        const nodeFw = (data.station && data.station.firmware_version) ? ("Node FW v" + data.station.firmware_version) : "Node FW v1.0.2";
        const canaryBadge = (data.station && data.station.is_canary) ? " <span class='badge badge-blue'>Canary</span>" : "";
        document.getElementById("station-subtitle").innerHTML =
          "Station: <b>" + stationId + "</b> • Location: <b>" + (data.station?.location || "Solar Site") + "</b>" +
          " • <span class='badge badge-amber'>" + nodeFw + "</span>" + canaryBadge +
          " • " + cachedHistory.length + " telemetry points recorded";
      } catch (err) {
        console.warn("API request failed, generating representative dataset:", err);
        loadMockData();
      }
    }

    async function loadBatteryHistory(stationId, days) {
      if (!stationId) return;
      try {
        const resp = await fetch(API_BASE + "/api/history?station_id=" + encodeURIComponent(stationId) + "&days=" + days);
        if (resp.ok) {
          const data = await resp.json();
          renderBatteryAnalytics(data.measurements || []);
        }
      } catch (e) {
        renderBatteryAnalytics(cachedHistory);
      }
    }

    function updateSummaryCards(station, latest) {
      if (!latest && !station) return;

      const solarMv = latest ? latest.solar_mv : (station.solar_mv || 0);
      const lipoMv  = latest ? latest.lipo_mv  : (station.battery_mv || 3800);
      const tempC   = latest ? latest.temp_c   : (station.temp_c || 28.5);

      const solarV = (solarMv / 1000).toFixed(2);
      const lipoV  = (lipoMv / 1000).toFixed(2);

      document.getElementById("solar-val").innerHTML = solarV + ' <span class="card-unit">V</span>';
      document.getElementById("solar-mv").textContent = solarMv + " mV (Divider 1k:1k)";
      document.getElementById("solar-status").textContent = solarMv > 1000 ? "Charging" : (solarMv > 300 ? "Overcast" : "Night");

      document.getElementById("battery-val").innerHTML = lipoV + ' <span class="card-unit">V</span>';
      const soc = Math.min(100, Math.max(0, Math.round(((lipoMv - 3300) / (4200 - 3300)) * 100)));
      document.getElementById("battery-mv").textContent = lipoMv + " mV (~" + soc + "% SoC)";

      document.getElementById("temp-val").innerHTML = tempC.toFixed(1) + ' <span class="card-unit">°C</span>';
      document.getElementById("temp-f").textContent = ((tempC * 9/5) + 32).toFixed(1) + " °F (Sun Range 10-75°C)";

      // Temperature visual indicator based on sun enclosure heating
      const tempBadge = document.getElementById("temp-badge");
      if (tempBadge) {
        if (tempC >= 50) {
          tempBadge.className = "badge badge-amber";
          tempBadge.textContent = "High (Sun Enclosure)";
        } else if (tempC >= 40) {
          tempBadge.className = "badge badge-amber";
          tempBadge.textContent = "Warm (Sun)";
        } else {
          tempBadge.className = "badge badge-blue";
          tempBadge.textContent = "Nominal";
        }
      }

      if (latest && latest.cycle_total_ms) {
        document.getElementById("cycle-total").innerHTML = latest.cycle_total_ms + ' <span class="card-unit">ms</span>';
        document.getElementById("cycle-http").textContent = "HTTP " + (latest.cycle_http_code || 200);

        document.getElementById("bench-measure").textContent = (latest.cycle_measure_ms || 12) + " ms";
        document.getElementById("bench-wifi").textContent    = (latest.cycle_wifi_ms || 780) + " ms";
        document.getElementById("bench-ip").textContent      = (latest.cycle_ip_ms || 110) + " ms";
        document.getElementById("bench-upload").textContent  = (latest.cycle_upload_ms || 390) + " ms";
        document.getElementById("bench-total").textContent   = latest.cycle_total_ms + " ms";
      }

      // Check for INA3221 Telemetry in raw payload
      if (latest && latest.raw_payload) {
        try {
          const raw = typeof latest.raw_payload === "string" ? JSON.parse(latest.raw_payload) : latest.raw_payload;
          if (raw && raw.ina3221) {
            const ina = raw.ina3221;
            const inaCard = document.getElementById("ina3221-card");
            if (inaCard) {
              inaCard.style.display = "block";
              if (ina.ch1_solar) {
                document.getElementById("ina-solar-pwr").textContent = (ina.ch1_solar.power_mw || 0).toFixed(1) + " mW";
                document.getElementById("ina-solar-details").textContent =
                  \`\${(ina.ch1_solar.voltage_v || 0).toFixed(2)} V • \${(ina.ch1_solar.current_ma || 0).toFixed(1)} mA\`;
              }
              if (ina.ch3_load) {
                document.getElementById("ina-load-pwr").textContent = (ina.ch3_load.power_mw || 0).toFixed(1) + " mW";
                document.getElementById("ina-load-details").textContent =
                  \`\${(ina.ch3_load.voltage_v || 0).toFixed(2)} V • \${(ina.ch3_load.current_ma || 0).toFixed(1)} mA • Res: \${(ina.ch3_load.resistance_ohm || 0).toFixed(1)} Ω\`;
              }
            }
          }
        } catch (e) {
          // No INA3221 in payload
        }
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

      const headroomMv = Math.max(0, latestMv - 3300);

      // 1. 24-Hour calculation
      const r24h = records.filter(r => new Date(r.timestamp).getTime() >= cutoff24h);
      if (r24h.length >= 2) {
        const first24 = r24h[0];
        const firstMv = first24.lipo_mv || Math.round((first24.lipo_v || 3.8) * 1000);
        const deltaMv = latestMv - firstMv;
        document.getElementById("est-drop-24h").textContent = \`ΔV: \${deltaMv >= 0 ? "+" : ""}\${deltaMv} mV / 24h\`;

        if (deltaMv >= 0) {
          document.getElementById("est-runtime-24h").innerHTML = "<span style='color:#10b981;'>Self-Sustaining</span>";
        } else {
          const dropPerDay = Math.abs(deltaMv);
          const daysLeft = (headroomMv / dropPerDay).toFixed(1);
          const hoursLeft = Math.round((headroomMv / dropPerDay) * 24);
          document.getElementById("est-runtime-24h").textContent = \`\${daysLeft} Days (\${hoursLeft}h)\`;
        }
      } else {
        document.getElementById("est-runtime-24h").textContent = "> 14 Days";
      }

      // 2. 7-Day Trend calculation
      const r7d = records.filter(r => new Date(r.timestamp).getTime() >= cutoff7d);
      if (r7d.length >= 2) {
        const first7 = r7d[0];
        const firstMv = first7.lipo_mv || Math.round((first7.lipo_v || 3.8) * 1000);
        const daySpan = Math.max(1, (new Date(latest.timestamp) - new Date(first7.timestamp)) / (24 * 3600 * 1000));
        const avgDailyDrop = (firstMv - latestMv) / daySpan;

        if (avgDailyDrop <= 0) {
          document.getElementById("est-runtime-7d").innerHTML = "<span style='color:#10b981;'>Solar Float / Stable</span>";
          document.getElementById("est-drop-7d").textContent = \`Net Gain: +\${Math.abs(avgDailyDrop).toFixed(1)} mV/day\`;
        } else {
          const daysLeft = (headroomMv / avgDailyDrop).toFixed(1);
          document.getElementById("est-runtime-7d").textContent = \`\${daysLeft} Days Autonomy\`;
          document.getElementById("est-drop-7d").textContent = \`Avg drop: \${avgDailyDrop.toFixed(1)} mV/day\`;
        }
      } else {
        document.getElementById("est-runtime-7d").textContent = "~ 21 Days Autonomy";
      }

      // 3. 30-Day Autonomy calculation
      const r30d = records.filter(r => new Date(r.timestamp).getTime() >= cutoff30d);
      if (r30d.length >= 2) {
        const first30 = r30d[0];
        const firstMv = first30.lipo_mv || Math.round((first30.lipo_v || 3.8) * 1000);
        const daySpan = Math.max(1, (new Date(latest.timestamp) - new Date(first30.timestamp)) / (24 * 3600 * 1000));
        const avgDailyDrop = (firstMv - latestMv) / daySpan;

        if (avgDailyDrop <= 0) {
          document.getElementById("est-runtime-30d").innerHTML = "<span style='color:#10b981;'>Infinite Autonomy</span>";
          document.getElementById("est-drop-30d").textContent = "Daily Solar Replenishment";
        } else {
          const daysLeft = (headroomMv / avgDailyDrop).toFixed(1);
          document.getElementById("est-runtime-30d").textContent = \`\${daysLeft} Days\`;
          document.getElementById("est-drop-30d").textContent = \`30d Trend: \${avgDailyDrop.toFixed(1)} mV/day\`;
        }
      } else {
        document.getElementById("est-runtime-30d").textContent = "Infinite (Solar Float)";
      }

      // Render Battery Timeline Chart
      const ctx = document.getElementById("batteryChart").getContext("2d");
      const labels = records.map(r => {
        const d = new Date(r.timestamp);
        return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      });
      const data = records.map(r => r.lipo_v || (r.lipo_mv / 1000.0));

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
            y: { min: 3.0, max: 4.4, grid: { color: "#21262d" }, ticks: { color: "#8b949e" }, title: { display: true, text: "Battery (V)", color: "#10b981" } }
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

    function renderTimingChart(records) {
      const ctx = document.getElementById("timingChart").getContext("2d");

      const timedRecords = records.filter(r => r.cycle_measure_ms != null).slice(-36);

      const labels = timedRecords.map(r => {
        const d = new Date(r.timestamp);
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      });

      const measureMs = timedRecords.map(r => r.cycle_measure_ms || 0);
      const wifiMs    = timedRecords.map(r => r.cycle_wifi_ms || 0);
      const ipMs      = timedRecords.map(r => r.cycle_ip_ms || 0);
      const uploadMs  = timedRecords.map(r => r.cycle_upload_ms || 0);

      if (timingChart) timingChart.destroy();

      timingChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "ADC Measure", data: measureMs, backgroundColor: "#10b981", stack: "Stack 0" },
            { label: "Wi-Fi Connect", data: wifiMs, backgroundColor: "#f59e0b", stack: "Stack 0" },
            { label: "IP DHCP", data: ipMs, backgroundColor: "#a855f7", stack: "Stack 0" },
            { label: "TLS & Upload", data: uploadMs, backgroundColor: "#38bdf8", stack: "Stack 0" }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, grid: { color: "#21262d" }, ticks: { maxTicksLimit: 10, color: "#8b949e" } },
            y: { stacked: true, grid: { color: "#21262d" }, ticks: { color: "#8b949e" }, title: { display: true, text: "Active Time (ms)", color: "#8b949e" } }
          },
          plugins: {
            legend: { labels: { color: "#f0f6fc" } }
          }
        }
      });
    }

    function loadMockData() {
      const records = [];
      const now = Date.now();
      const points = 3 * 24 * 6;

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
          raw_payload: JSON.stringify({
            ina3221: {
              ch1_solar: { voltage_v: solarMv / 1000, current_ma: solarMv > 1000 ? 320.5 : 0, power_mw: solarMv > 1000 ? (solarMv / 1000 * 320.5) : 0 },
              ch3_load: { voltage_v: 3.3, current_ma: 42.1, power_mw: 138.9, resistance_ohm: 78.4 }
            }
          })
        });
      }

      cachedHistory = records;
      document.getElementById("station-subtitle").innerHTML =
        "Station: <b>phumy2</b> • Location: <b>District 7, HCMC</b> • <span class='badge badge-amber'>Node FW v1.0.2</span> • 432 telemetry points recorded";
      updateSummaryCards({ station_id: "phumy2", location: "District 7, HCMC", firmware_version: "1.0.2" }, records[records.length - 1]);
      renderOverlayChart(records, activeMetric);
      renderHistoryChart(records);
      renderTimingChart(records);
      renderBatteryAnalytics(records);
    }

    window.addEventListener("DOMContentLoaded", init);
  </script>
</body>
</html>`;
}

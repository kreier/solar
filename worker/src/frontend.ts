export function renderDashboardHtml(workerUrl: string = ""): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solar & LiPo Fleet Monitor — ESP32 Telemetry</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>☀️</text></svg>">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js"></script>
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

    .subtitle { color: var(--text-muted); font-size: 0.9rem; }

    .station-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    select, button {
      background: var(--card-bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.5rem 0.8rem;
      font-size: 0.9rem;
      cursor: pointer;
    }

    select:focus, button:focus { outline: 2px solid var(--solar); }

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

    footer {
      text-align: center;
      padding: 2rem 0 1rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      border-top: 1px solid var(--border);
    }
    footer a { color: var(--solar); text-decoration: none; }
    footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-area">
        <h1><span>☀️</span> Solar Telemetry Fleet</h1>
        <div class="subtitle" id="station-subtitle">Connecting to Cloudflare D1 Edge Ingestion...</div>
      </div>
      <div class="station-controls">
        <select id="station-select">
          <option value="">Loading stations...</option>
        </select>
        <button id="refresh-btn">🔄 Refresh</button>
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
          <span class="badge badge-green" id="battery-status">Good</span>
        </div>
        <div class="card-value" id="battery-val">-- <span class="card-unit">V</span></div>
        <div class="card-sub" id="battery-mv">-- mV (~--% SoC)</div>
      </div>

      <div class="card">
        <div class="card-label">
          <span>Temperature</span>
          <span class="badge badge-blue">Local</span>
        </div>
        <div class="card-value" id="temp-val">-- <span class="card-unit">°C</span></div>
        <div class="card-sub" id="temp-f">-- °F (Pin 32)</div>
      </div>

      <div class="card">
        <div class="card-label">
          <span>ESP32 Active Cycle</span>
          <span class="badge badge-green" id="cycle-http">HTTP 200</span>
        </div>
        <div class="card-value" id="cycle-total">-- <span class="card-unit">ms</span></div>
        <div class="card-sub" id="cycle-sub">Sleep Cadence: 10 min</div>
      </div>
    </div>

    <!-- 0:00 to 24:00 Multi-Day Comparison Section -->
    <div class="chart-section">
      <div class="chart-header">
        <div>
          <div class="chart-title">Daily Voltage & Temp Overlay (0:00 – 24:00)</div>
          <div class="subtitle">Comparing diurnal curves across the last 3 days</div>
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

    <!-- Continuous 3-Day History Section -->
    <div class="chart-section">
      <div class="chart-header">
        <div>
          <div class="chart-title">Continuous 72-Hour Telemetry Timeline</div>
          <div class="subtitle">Solar generation, battery discharge, and temperature trend</div>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="historyChart"></canvas>
      </div>
    </div>

    <!-- Cycle Execution Timing Benchmarks Card -->
    <div class="chart-section">
      <div class="chart-header">
        <div>
          <div class="chart-title">ESP32 Cycle Execution Benchmarks</div>
          <div class="subtitle">Stage breakdown from boot to HTTP 200 confirmation</div>
        </div>
      </div>
      <div class="chart-container" style="height: 220px;">
        <canvas id="timingChart"></canvas>
      </div>
      <div class="bench-grid">
        <div class="bench-item">
          <div class="bench-val" id="bench-measure">-- ms</div>
          <div class="bench-label">ADC 100x Multisample</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-wifi">-- ms</div>
          <div class="bench-label">WiFi Connection</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-ip">-- ms</div>
          <div class="bench-label">IP Address DHCP</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-upload">-- ms</div>
          <div class="bench-label">TLS & HTTP Upload</div>
        </div>
        <div class="bench-item">
          <div class="bench-val" id="bench-total">-- ms</div>
          <div class="bench-label">Total Active Time</div>
        </div>
      </div>
    </div>

    <footer>
      <p>ESP32 Solar Telemetry System &bull; Minimal SPIFFS & Dual OTA &bull; Cloudflare Edge & D1 Database</p>
      <p><a href="https://github.com/kreier/solar" target="_blank">kreier/solar on GitHub</a> &bull; Firmware v<span id="fw-version">1.0.0</span></p>
    </footer>
  </div>

  <script>
    const API_BASE = window.location.origin.includes("github.io")
      ? "https://solar.kreier.workers.dev"
      : "";

    let currentStationId = "";
    let cachedHistory = [];
    let activeMetric = "solar";

    let overlayChart = null;
    let historyChart = null;
    let timingChart = null;

    async function init() {
      setupEventListeners();
      await loadStations();
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
    }

    async function loadStations() {
      try {
        const resp = await fetch(API_BASE + "/api/stations");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const stations = await resp.json();

        const select = document.getElementById("station-select");
        select.innerHTML = "";

        if (!stations || stations.length === 0) {
          select.innerHTML = '<option value="phumy2">phumy2 (Sample)</option>';
          currentStationId = "phumy2";
        } else {
          stations.forEach(st => {
            const opt = document.createElement("option");
            opt.value = st.station_id;
            opt.textContent = st.station_id + (st.location ? " (" + st.location + ")" : "");
            select.appendChild(opt);
          });
          currentStationId = stations[0].station_id;
        }

        loadStationData(currentStationId);
      } catch (err) {
        console.warn("Failed to load stations, using phumy2 demo data:", err);
        const select = document.getElementById("station-select");
        select.innerHTML = '<option value="phumy2">phumy2 (Demo Mode)</option>';
        currentStationId = "phumy2";
        loadMockData();
      }
    }

    async function loadStationData(stationId) {
      document.getElementById("station-subtitle").textContent = "Fetching 3-day history for " + stationId + "...";
      try {
        const resp = await fetch(API_BASE + "/api/history?station_id=" + encodeURIComponent(stationId) + "&days=3");
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const data = await resp.json();

        cachedHistory = data.measurements || [];
        updateSummaryCards(data.station, cachedHistory[cachedHistory.length - 1]);
        renderOverlayChart(cachedHistory, activeMetric);
        renderHistoryChart(cachedHistory);
        renderTimingChart(cachedHistory);

        document.getElementById("station-subtitle").textContent =
          "Station: " + stationId + " • " + (data.station?.location || "Solar Site") +
          " • " + cachedHistory.length + " telemetry points recorded";
      } catch (err) {
        console.warn("API request failed, generating representative dataset:", err);
        loadMockData();
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
      document.getElementById("temp-f").textContent = ((tempC * 9/5) + 32).toFixed(1) + " °F (Pin 32)";

      if (latest && latest.cycle_total_ms) {
        document.getElementById("cycle-total").innerHTML = latest.cycle_total_ms + ' <span class="card-unit">ms</span>';
        document.getElementById("cycle-http").textContent = "HTTP " + (latest.cycle_http_code || 200);

        document.getElementById("bench-measure").textContent = (latest.cycle_measure_ms || 12) + " ms";
        document.getElementById("bench-wifi").textContent = (latest.cycle_wifi_ms || 850) + " ms";
        document.getElementById("bench-ip").textContent = (latest.cycle_ip_ms || 120) + " ms";
        document.getElementById("bench-upload").textContent = (latest.cycle_upload_ms || 410) + " ms";
        document.getElementById("bench-total").textContent = latest.cycle_total_ms + " ms";
      }

      if (station && station.firmware_version) {
        document.getElementById("fw-version").textContent = station.firmware_version;
      }
    }

    // Renders the 0:00 to 24:00 3-Day Overlay Chart
    function renderOverlayChart(records, metric) {
      const ctx = document.getElementById("overlayChart").getContext("2d");

      // Separate records into Today, Yesterday, and 2 Days Ago
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const msDay = 24 * 60 * 60 * 1000;

      const dayToday = [];
      const dayYesterday = [];
      const day2Ago = [];

      records.forEach(r => {
        const t = new Date(r.timestamp).getTime();
        const recDayStart = new Date(new Date(r.timestamp).getFullYear(), new Date(r.timestamp).getMonth(), new Date(r.timestamp).getDate()).getTime();
        const diffDays = Math.round((startOfToday - recDayStart) / msDay);

        // Calculate minute of day (0 to 1440) -> convert to decimal hour (0.00 to 24.00)
        const d = new Date(r.timestamp);
        const hourOfDay = d.getHours() + d.getMinutes() / 60;

        let val = 0;
        if (metric === "solar") val = r.solar_v ?? (r.solar_mv / 1000);
        else if (metric === "lipo") val = r.lipo_v ?? (r.lipo_mv / 1000);
        else if (metric === "temp") val = r.temp_c;

        const pt = { x: hourOfDay, y: Number(val.toFixed(2)) };

        if (diffDays === 0) dayToday.push(pt);
        else if (diffDays === 1) dayYesterday.push(pt);
        else if (diffDays === 2) day2Ago.push(pt);
      });

      // Sort points by hour
      [dayToday, dayYesterday, day2Ago].forEach(arr => arr.sort((a, b) => a.x - b.x));

      const metricLabels = {
        solar: { label: "Solar Panel Voltage (V)", unit: "V", yMin: 0, yMax: 6 },
        lipo:  { label: "LiPo Battery Voltage (V)", unit: "V", yMin: 3.0, yMax: 4.4 },
        temp:  { label: "Temperature (°C)", unit: "°C", yMin: 15, yMax: 45 }
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
              backgroundColor: "rgba(59, 130, 246, 0.05)",
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 1
            },
            {
              label: "2 Days Ago",
              data: day2Ago,
              borderColor: "#a855f7",
              backgroundColor: "rgba(168, 85, 247, 0.05)",
              borderWidth: 2,
              borderDash: [4, 4],
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
                  const m = Math.round((val - h) * 60);
                  return (h < 10 ? "0" + h : h) + ":" + (m < 10 ? "0" + m : m);
                },
                label: (ctx) => ctx.dataset.label + ": " + ctx.parsed.y + " " + cfg.unit
              }
            }
          }
        }
      });
    }

    // Renders the Continuous 72-Hour Timeline
    function renderHistoryChart(records) {
      const ctx = document.getElementById("historyChart").getContext("2d");

      const labels = records.map(r => {
        const d = new Date(r.timestamp);
        return (d.getMonth() + 1) + "/" + d.getDate() + " " +
               (d.getHours() < 10 ? "0" + d.getHours() : d.getHours()) + ":" +
               (d.getMinutes() < 10 ? "0" + d.getMinutes() : d.getMinutes());
      });

      const solarData = records.map(r => r.solar_v ?? (r.solar_mv / 1000));
      const lipoData  = records.map(r => r.lipo_v ?? (r.lipo_mv / 1000));
      const tempData  = records.map(r => r.temp_c);

      if (historyChart) historyChart.destroy();

      historyChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "Solar Panel (V)",
              data: solarData,
              borderColor: "#f59e0b",
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
              min: 15,
              max: 45,
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

    // Renders the Cycle Benchmark Chart
    function renderTimingChart(records) {
      const ctx = document.getElementById("timingChart").getContext("2d");
      const recent = records.slice(-30); // Last 30 cycles

      const labels = recent.map((r, i) => "Cycle #" + (r.boot_count || i + 1));
      const measure = recent.map(r => r.cycle_measure_ms || 12);
      const wifi    = recent.map(r => r.cycle_wifi_ms || 850);
      const ip      = recent.map(r => r.cycle_ip_ms || 120);
      const upload  = recent.map(r => r.cycle_upload_ms || 410);

      if (timingChart) timingChart.destroy();

      timingChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            { label: "ADC Multisample (ms)", data: measure, backgroundColor: "#38bdf8" },
            { label: "WiFi Connect (ms)", data: wifi, backgroundColor: "#818cf8" },
            { label: "IP DHCP (ms)", data: ip, backgroundColor: "#c084fc" },
            { label: "HTTP Upload (ms)", data: upload, backgroundColor: "#34d399" }
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

    // Synthetic generator for demo or offline fallback
    function loadMockData() {
      const records = [];
      const now = Date.now();
      const points = 3 * 24 * 6; // 3 days every 10 min

      for (let i = points; i >= 0; i--) {
        const time = new Date(now - i * 10 * 60 * 1000);
        const hour = time.getHours() + time.getMinutes() / 60;

        // Diurnal solar curve (peaks around 12:30 PM, 0 at night)
        let solarMv = 0;
        if (hour >= 6 && hour <= 18) {
          const sunAngle = Math.sin(((hour - 6) / 12) * Math.PI);
          solarMv = Math.max(0, Math.round(sunAngle * 5400 + (Math.random() * 200 - 100)));
        }

        // LiPo curve: charges during day (up to 4.18V), discharges gently at night (down to 3.75V)
        const lipoMv = Math.round(3800 + (solarMv > 1000 ? 350 : -50) + Math.sin((hour / 24) * 2 * Math.PI) * 80);

        // Temperature curve: 24°C night, 34°C afternoon
        const tempC = Number((28 + Math.sin(((hour - 9) / 24) * 2 * Math.PI) * 6 + (Math.random() * 0.4)).toFixed(1));

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
          cycle_http_code: 200
        });
      }

      cachedHistory = records;
      updateSummaryCards({ station_id: "phumy2", location: "District 7, HCMC", firmware_version: "1.0.0" }, records[records.length - 1]);
      renderOverlayChart(records, activeMetric);
      renderHistoryChart(records);
      renderTimingChart(records);
    }

    window.addEventListener("DOMContentLoaded", init);
  </script>
</body>
</html>`;
}

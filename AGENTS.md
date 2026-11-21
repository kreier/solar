# AGENTS.md — AI Agent Guidance & Architectural Reference

This document serves as the primary technical specification and operational playbook for autonomous AI coding agents (such as Antigravity, Cursor, Copilot, Cline, and Claude Dev) working on the `kreier/solar` repository.

---

## 1. System Overview & Architecture

`kreier/solar` is an edge-native, battery-optimized telemetry fleet monitoring system for solar panel performance, LiPo battery charge/discharge cycles, local ambient temperature, and microcontroller execution latency:

```
                      ┌──────────────────────────────────────────────┐
                      │             Deployed ESP32 Nodes             │
                      │       (WEMOS LOLIN32 / ESP32 DevKit)         │
                      └──────────────────────┬───────────────────────┘
                                             │
                   HTTPS Telemetry Cycle     │ Every 10 minutes
                   Bearer Token Auth         ▼ (Light Sleep)
                      ┌──────────────────────────────────────────────┐
                      │          Cloudflare Worker (Edge)            │
                      │          solar.kreier.workers.dev            │
                      ├──────────────────────┬───────────────────────┤
                      │  Telemetry Ingestion │  Streaming OTA Proxy  │
                      │  Token Verification  │  Web Dashboard SSR    │
                      └──────────┬───────────┴──────────┬────────────┘
                                 │                      │
             Indexed SQL Queries │                      │ Releases Fallback
                                 ▼                      ▼
                      ┌──────────────────────┐   ┌───────────────────┐
                      │    Cloudflare D1     │   │  GitHub Releases  │
                      │       solar-db       │   │  (Firmware Bin)   │
                      └──────────────────────┘   └───────────────────┘
                                                        ▲
                                                        │ Automated Static Mirror
                                                 ┌──────┴────────────┐
                                                 │   GitHub Pages    │
                                                 │ kreier.github.io  │
                                                 └───────────────────┘
```

* **Edge Nodes (Firmware)**: ESP32 microcontrollers operating outdoors on solar panels and 1000 mAh LiPo batteries. Every 10 minutes, the node wakes, multisamples ADC channels 100x, associates with Wi-Fi, acquires DHCP IP, uploads telemetry (including prior cycle stage benchmarks) to Cloudflare Worker via HTTPS, and returns to light sleep.
* **Edge Backend (Worker & D1)**: Cloudflare Worker written in TypeScript backed by Cloudflare D1 (serverless SQLite). Handles device registration, bearer token validation, telemetry ingestion, multi-day historical slicing, and zero-redirect OTA streaming proxies.
* **Dual Dashboards (Web)**: Server-rendered dashboard on Cloudflare Worker (`solar.kreier.workers.dev`) and static mirror on GitHub Pages (`kreier.github.io/solar`) featuring 0:00 to 24:00 daily overlays for the last 3 days, 72-hour continuous timelines, and cycle execution latency breakdowns.

---

## 2. Repository Layout & Component Map

```
kreier/solar/
├── .github/
│   └── workflows/
│       ├── build-firmware.yml     # CI: Automated PlatformIO build verification
│       └── deploy-pages.yml       # CD: Deploys ./docs to GitHub Pages
├── docs/
│   ├── index.html                 # 3-Day 0:00-24:00 overlay & telemetry dashboard
│   ├── 404.html                   # SPA routing fallback
│   └── adr/                       # Architectural Decision Records (ADRs 0001–0006)
│       ├── README.md
│       ├── 0001-cloudflare-d1-edge-storage.md
│       ├── 0002-zero-trust-bootstrap-provisioning.md
│       ├── 0003-esp32-adc-nonlinearity-calibration.md
│       ├── 0004-light-sleep-cadence-and-cycle-benchmarking.md
│       ├── 0005-minimal-spiffs-and-dual-ota-partitioning.md
│       └── 0006-four-tier-station-power-and-monitoring-modes.md
├── firmware/
│   ├── platformio.ini             # Unified PlatformIO build configuration (ESP32, ESP32-S3, ESP32-C5)
│   ├── partitions/
│   │   ├── default.csv            # Standard ESP32 4MB: 1.28MB app0/app1, 1.4MB SPIFFS, 64KB coredump
│   │   ├── min_spiffs.csv         # ESP32 4MB Flash: 1.9MB app0/app1, 192KB SPIFFS
│   │   └── s3_16mb.csv            # ESP32-S3 16MB Flash: Dual 4MB OTA partitions, ~8MB LittleFS
│   ├── include/
│   │   ├── adc_reader.h           # 100x multisample & ADC nonlinearity formulas
│   │   ├── ina3221_reader.h       # INA3221 3-channel I2C current & power monitor (0x40)
│   │   ├── cycle_timer.h          # Startup, measure, wifi, ip, upload, http 200 benchmark
│   │   ├── app_config.h           # NVS Preferences, Power Mode, Canary, and hardware pins
│   │   ├── api_client.h           # Registration via MASTER_PHRASE, Bearer upload & batch buffering
│   │   ├── double_reset.h         # Double reset button detection in RTC memory
│   │   ├── portal_manager.h       # Soft-AP captive setup web portal (192.168.4.1)
│   │   ├── ota_manager.h          # Dual-partition OTA check & HTTPUpdate flashing
│   │   └── sleep_manager.h        # Deep Sleep (10-15 µA) and Light Sleep managers
│   ├── src/
│   │   └── main.cpp               # Firmware loop & telemetry coordinator
│   └── solar/
│       └── solar.ino              # Arduino IDE sketch entrypoint
├── worker/
│   ├── wrangler.toml              # Cloudflare Worker configuration & D1 binding
│   ├── package.json               # Node 22+ & Wrangler dependencies
│   ├── tsconfig.json
│   ├── migrations/
│   │   └── 0001_initial_schema.sql # D1 schema: stations, measurements, indices
│   └── src/
│       ├── index.ts               # Worker router & CORS handler
│       ├── types.ts               # Request, response, and database types
│       ├── db.ts                  # D1 query execution layer
│       ├── register.ts            # Station registration & token issuance
│       ├── telemetry.ts           # Ingestion & Bearer authentication
│       ├── ota.ts                 # OTA versioning & binary distribution
│       └── frontend.ts            # SSR web dashboard generator
├── AGENTS.md                      # AI Agent guidance (this document)
├── CHANGELOG.md                   # Keep a Changelog formatted history
├── README.md                      # Comprehensive user documentation
└── .gitignore
```

---

## 3. Hardware Pinout & ADC Calibration

### Pin Assignments
* **Pin 32**: Analog Temperature Sensor (10 mV / °C). Ratio 1:1.
* **Pin 34**: Solar Panel Voltage through 1kΩ : 1kΩ voltage divider (2:1).
* **Pin 35**: LiPo Battery Voltage through 10kΩ : 10kΩ voltage divider (2:1).
* **I2C SDA (Pin 21/4/0) & SCL (Pin 22/5/1)**: INA3221 Precision Current/Power Monitor (0x40):
  * **Channel 1**: Solar Panel Bus Voltage, Shunt Current (mA), and calculated Power (mW).
  * **Channel 3**: Connected Load Bus Voltage, Shunt Current (mA), Power (mW), and Load Resistance (Ω).

### Nonlinearity Calibration Formulas
Because of the ESP32 SAR ADC non-linearity (deadband below ~150 mV and compression at top of range), all channels use 100x multisampling and hardware-calibrated piecewise linear equations:

```cpp
// 1. Temperature: Pin 32 (10 mV / °C)
voltage[0] = int((voltage[0]) * 0.83 + 155);
float temp_c = voltage[0] / 10.0f;

// 2. Solar Panel Voltage: Pin 34 (divider 1k : 1k)
voltage[2] = int((voltage[2]) * 1.64 + 315);
if (voltage[2] == 315 || voltage[2] == 0) voltage[2] = 0; // Guard against offset at 0V
float solar_v = voltage[2] / 1000.0f;

// 3. LiPo Battery Voltage: Pin 35 (divider 10k : 10k)
voltage[3] = int((voltage[3]) * 1.65 + 307);
float lipo_v = voltage[3] / 1000.0f;
```

### Four Station Operational Modes (v1.1.4)
1. **Low Power (`mode 0`)**:
   - Deep Sleep (`esp_deep_sleep_start()`), consuming ~10–15 µA.
   - Wakes every 10 minutes to sample ADC and INA3221 in ~15 ms; writes sample directly into RTC Slow Memory (`RTC_DATA_ATTR`). Classic ESP32 can leverage the ULP coprocessor state machine.
   - Main CPU wakes once per hour (every 6th cycle) to fire an optimized ~1.1-second Wi-Fi burst uploading all 6 batched records and execution latencies.
   - Daily firmware OTA verification (every 144 cycles / 24 hours).
2. **Active (`mode 1`)**:
   - Light Sleep (`esp_light_sleep_start()`), preserving standard SRAM without RTC constraints.
   - Samples sensors every 1 minute into rolling buffers. Every 10 minutes computes arithmetic mean across samples and transmits telemetry.
   - Hourly OTA check.
3. **Verbose (`mode 2`)**:
   - Light Sleep with same 1-min sample / 10-min upload schedule as Active.
   - Active UART serial logging on every 1-minute tick for bench diagnostics and hardware bring-up.
4. **Monitor (`mode 3`)**:
   - Light Sleep with 1-min sampling and 10-min upload cadence.
   - Promiscuous 802.11 RF sniffer sweeps 2.4 GHz channels 1..13 (and 5 GHz on ESP32-C5) with 1.0s dwell time per channel; scans concurrent BLE unique devices.
   - Aggregates channel distribution and max packet metrics, displaying on Web UI interactive Heatmap.

---

## 4. Execution Cycle Timing & Benchmarking

Every cycle measures 8 fine-grained milestone durations in milliseconds:
1. `cycle_boot_ms`: Hardware wake and sensor initialization.
2. `cycle_measure_ms`: Sensor conversion (ADC or INA3221).
3. `cycle_wifi_ms`: Duration from `WiFi.begin()` until `WL_CONNECTED`.
4. `cycle_ip_ms`: Time until valid DHCP IP address is acquired.
5. `cycle_dns_ms`: DNS name resolution for edge worker endpoint.
6. `cycle_tcp_ms`: TCP socket three-way handshake.
7. `cycle_tls_ms`: TLS cryptographic handshake (SNI).
8. `cycle_post_ms` / `cycle_server_ms`: Request serialization and HTTP 200 response ingestion (exact byte reading via `Content-Length`, eliminating idle timeouts).
9. `cycle_total_ms`: Total active duration from wakeup to sleep (~1.1 seconds on static IP / cached BSSID).

### Previous Cycle Payload Handoff
To avoid circular timing dependencies, the complete benchmark of the **preceding cycle** is retained in RTC fast memory (`RTC_DATA_ATTR`) and included in the current cycle's payload:

```json
{
  "station_id": "phumy2",
  "solar_mv": 5120,
  "lipo_mv": 4120,
  "temp_c": 29.4,
  "prev_cycle": {
    "boot_ms": 5,
    "measure_ms": 12,
    "wifi_connect_ms": 820,
    "ip_obtain_ms": 115,
    "upload_ms": 410,
    "total_cycle_ms": 1362,
    "http_code": 200
  },
  "current_cycle": {
    "measure_ms": 12,
    "wifi_connect_ms": 795,
    "ip_obtain_ms": 105
  }
}
```

---

## 5. Zero-Trust Provisioning & Soft-AP Configuration

### Soft-AP Web Configuration Portal
For headless boards lacking physical boot buttons (e.g., WEMOS LOLIN32):
- **Double Reset Detection**: Pressing the physical EN/RST button twice within 2.0 seconds (tracked via `RTC_DATA_ATTR uint32_t rtc_drd_magic`) enters AP configuration mode. It is also entered automatically if no Wi-Fi credentials exist.
- **Access Point**: Broadcasts `Solar-Setup` (or `Solar-<station_id>`) with IP `192.168.4.1`.
- **Soft-AP Password**: Protected by default password `12345678` (printed clearly on the Serial console at boot).
- **Client-Aware Timeout**: 120-second active countdown pauses automatically when a client is connected (`WiFi.softAPgetStationNum() > 0`), ensuring users are never disconnected while entering configuration.
- **Submit & Reboot**: Upon submitting `/save`, the ESP32 writes configuration to NVS, presents a confirmation response, and reboots after 1.0 second.
- **Portal Features**:
  - Live ADC sensor telemetry preview (Temperature, Solar Voltage, LiPo Voltage, raw counts).
  - Configuration form: Station ID, Location, Primary & Backup Wi-Fi credentials, `MASTER_PHRASE`, Worker URL, and dynamic Pin Framework (`pin_temp`, `pin_solar`, `pin_lipo`).
- **Daily OTA Update Checks**: Station performs a daily automatic OTA check against the Cloudflare edge worker (every 144 cycles / 24 hours, plus on boot cycle #1) or via the `OTA` serial command.

### Provisioning Protocol
1. **Bootstrap Phase**:
   - The ESP32 boots without a device token in NVS.
   - It issues `POST https://solar.kreier.workers.dev/api/register` with `{ "station_id": "phumy2", "location": "District 7, HCMC", "bootstrap_secret": "<MASTER_PHRASE>" }`.
   - The worker compares `bootstrap_secret === env.MASTER_PHRASE`.
   - On match, the worker generates a UUIDv4 `device_token`, upserts the station in D1, and returns it.
2. **Purge Phase**:
   - The ESP32 writes `device_token` to NVS.
   - The ESP32 permanently erases `MASTER_PHRASE` from RAM and NVS.
3. **Telemetry Phase**:
   - Every subsequent request includes `Authorization: Bearer <device_token>`.

---

## 6. Build and Deployment Commands

### PlatformIO Firmware Build
```bash
cd firmware
pio run
```

### Cloudflare Worker Deployment
```bash
cd worker
npm install
npx wrangler d1 execute solar-db --file=migrations/0001_initial_schema.sql
npx wrangler secret put MASTER_PHRASE
npx wrangler deploy
```

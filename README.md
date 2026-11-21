# solar — ESP32 Solar, Battery & Temperature Fleet Monitor

Edge-native telemetry fleet monitoring for ESP32 microcontrollers measuring solar panel voltage, LiPo battery charge/discharge cycles, local ambient temperature, and execution cycle latency. Ingested at the Cloudflare edge (`solar.kreier.workers.dev`) and stored in a serverless Cloudflare D1 database.

[![Build Firmware CI](https://github.com/kreier/solar/actions/workflows/build-firmware.yml/badge.svg)](https://github.com/kreier/solar/actions/workflows/build-firmware.yml)
[![Deploy GitHub Pages](https://github.com/kreier/solar/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/kreier/solar/actions/workflows/deploy-pages.yml)
[![Firmware](https://img.shields.io/badge/firmware-v1.1.5-blue.svg)](firmware/)
[![Boards](https://img.shields.io/badge/boards-ESP32%20%7C%20ESP32--S3%20%7C%20ESP32--C5-orange.svg)](firmware/)
[![ADRs](https://img.shields.io/badge/docs-ADRs%20(6)-success.svg)](docs/adr/)

---

## Architecture Overview

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

- **Live Edge Web App**: [solar.kreier.workers.dev](https://solar.kreier.workers.dev)
- **Static GitHub Pages Mirror**: [kreier.github.io/solar](https://kreier.github.io/solar)

---

## Key Features

1. **Precision ADC Nonlinearity Compensation**:
   - 100x multisampling on pins 32, 34, 35.
   - Hardware-calibrated piecewise linear conversions accounting for resistor dividers and ESP32 ADC deadbands.
2. **Cycle Timing Benchmarks**:
   - Measures time from boot, measuring, Wi-Fi association, DHCP IP acquisition, TLS handshake & upload, to HTTP 200 confirmation.
   - Retained in RTC fast memory and automatically delivered in the payload for the **next cycle**.
3. **Power-Optimized Light Sleep Cadence**:
   - Runs every 10 minutes, powers down the Wi-Fi radio, and enters ultra-low-power light sleep.
4. **Zero-Trust Onboarding & Soft-AP Configuration**:
   - Double reset detection (2-second window) enables Soft-AP mode (`Solar-Setup` at `192.168.4.1`) for boards without a boot button (e.g. WEMOS LOLIN32).
   - Password-protected Wi-Fi AP (`12345678`), displayed directly on the serial interface at boot.
   - Smart client timeout: 120-second timer automatically pauses when a client connects, preventing accidental disconnection while entering data.
   - Automatic restart: ESP32 automatically saves settings to NVS and reboots upon form submission.
   - Configuration portal displays live ADC readings and configures Station ID, Location, Wi-Fi credentials, `MASTER_PHRASE`, worker URL, and customizable Pin Framework (`pin_temp`, `pin_solar`, `pin_lipo`).
   - Initial registration exchanges `MASTER_PHRASE` for a unique UUID `device_token`; `MASTER_PHRASE` is immediately purged from NVS.
5. **Standard OTA, Daily Auto-Check & Core Dump Scheme**:
   - Standard 4MB dual OTA partition scheme (`partitions/default.csv`) with two 1.28 MB application slots (`app0` / `app1`), 1.4 MB SPIFFS, and a dedicated 64 KB `coredump` partition (`esp_core_dump_flash` supported).
   - Automatic daily OTA update check (every 144 cycles / 24 hours, plus on boot cycle #1) and serial command `OTA`.
   - Seamless Over-The-Air firmware updates delivered via Cloudflare Worker.
6. **Multi-Day 0:00 to 24:00 Web Dashboard**:
   - Dynamic header displaying Station Name, Location, Uptime (days and hours), Telemetry Count, and running Firmware Version (`v1.1.5`).
   - Daily comparison overlays for the last 3 days showing diurnal curves for solar power, battery charging, and temperature with dynamic auto-scaling.
   - Continuous 72-hour timeline with auto-scaled dual Y-axes and stacked execution latency benchmarks.
   - Multi-channel INA3221 telemetry support (Solar, Battery/Aux, Load) and interactive RF/BLE environment monitor.
7. **Web Serial Firmware Installer**:
   - Built into both the Cloudflare Worker and GitHub Pages sites.
   - **Full Firmware / Clean Install**: Flashes bootloader, partition table, boot_app0, and app with erase device prompt.
   - **Update Only**: Flashes application partition only (0x10000), preserving Wi-Fi credentials, tokens, and settings.

---

## Hardware Pinout & ADC Calibration

| Pin | Channel | Sensor / Circuit | Divider Ratio | Calibration Formula | Physical Unit |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Pin 32** | ADC1_CH4 | Local Temperature | 1:1 | `voltage[0] = int(voltage[0] * 0.83 + 155)` | `mV / 10 = °C` |
| **Pin 34** | ADC1_CH6 | Solar Panel Voltage | 1kΩ : 1kΩ (2:1) | `voltage[2] = int(voltage[2] * 1.64 + 315)` *(0 if 315)* | `mV / 1000 = V` |
| **Pin 35** | ADC1_CH7 | LiPo Battery Voltage | 10kΩ : 10kΩ (2:1) | `voltage[3] = int(voltage[3] * 1.65 + 307)` | `mV / 1000 = V` |

---

## Firmware Compilation & Flashing

### Using PlatformIO (Recommended)
```bash
cd firmware
pio run -t upload
pio device monitor
```

### Using Arduino IDE
1. Open `firmware/solar/solar.ino`.
2. Select **Board**: `ESP32 Dev Module` (or `WEMOS LOLIN32`).
3. Select **Partition Scheme**: `Minimal SPIFFS (1.9MB APP with OTA/190KB SPIFFS)` or configure `partitions/min_spiffs.csv`.
4. Install `ArduinoJson` (v7+) via the Library Manager.
5. Compile and upload.

---

## Cloudflare Worker & D1 Setup

### 1. Initialize Cloudflare D1 Database
```bash
cd worker
npm install
wrangler d1 create solar-db
wrangler d1 execute solar-db --file=migrations/0001_initial_schema.sql
```

### 2. Configure Secrets
```bash
wrangler secret put MASTER_PHRASE
```

### 3. Deploy Worker
```bash
wrangler deploy
```

---

## Repository Architecture & ADRs

This repository is maintained with agentic AI workflows. Detailed architectural decisions are documented in [`docs/adr`](docs/adr/):

- [`AGENTS.md`](AGENTS.md): Operational guide for AI coding assistants.
- [`CHANGELOG.md`](CHANGELOG.md): SemVer release history.
- [ADR 0001](docs/adr/0001-cloudflare-d1-edge-storage.md): Cloudflare D1 Serverless Storage over Git Commits.
- [ADR 0002](docs/adr/0002-zero-trust-bootstrap-provisioning.md): Zero-Trust Per-Device Token Provisioning via Bootstrap Secret.
- [ADR 0003](docs/adr/0003-esp32-adc-nonlinearity-calibration.md): ESP32 ADC Calibration & 100x Multisampling.
- [ADR 0004](docs/adr/0004-light-sleep-cadence-and-cycle-benchmarking.md): 10-Minute Light Sleep & Cycle Benchmarking.
- [ADR 0005](docs/adr/0005-minimal-spiffs-and-dual-ota-partitioning.md): Minimal SPIFFS & Dual OTA Application Slots.
- [ADR 0006](docs/adr/0006-four-tier-station-power-and-monitoring-modes.md): Four-Tier Station Operational Modes (Low Power, Active, Verbose, Monitor).

---

## Related Repositories

- [kreier/wifi](https://github.com/kreier/wifi): Fleet Wi-Fi spectrum and network quality monitoring node.
- [kreier/solarmeter](https://github.com/kreier/solarmeter): Legacy solar monitoring collectors (2020–2021).
- [aisvn-data/solardata](https://github.com/aisvn-data/solardata): Historical solar analysis and visualization.

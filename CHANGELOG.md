# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-11-20

### Fixed & Added
- **TLS Handshake Fix with SNI**:
  - Resolved `[API] TLS handshake to 104.21.95.177 failed` by passing hostname (`secClient.connect(host.c_str(), port)`) instead of raw IP, ensuring Server Name Indication (SNI) is delivered to Cloudflare edge proxy.
- **8-Stage Execution Latency Breakdown Output to Serial**:
  - Serial terminal now prints a dedicated formatted banner with all 8 execution stages:
    1. Sensor Measure (ADC eFuse / INA3221)
    2. Wi-Fi Connect (SSID, Channel, RSSI)
    3. IP Acquisition (DHCP / Static IP)
    4. DNS Lookup (Domain resolution)
    5. TCP 3-Way Handshake (Port 443)
    6. TLS Handshake (mbedTLS with SNI)
    7. HTTP POST Payload Transmission
    8. Edge Server Execution & Response
    (Plus Total Upload Phase and Total Active Cycle duration).
- **30-Second Balanced Mode Cadence**:
  - Adjusted Light Sleep duration from 10 minutes (600s) to 30 seconds in Balanced mode, publishing telemetry and benchmarks every 30 seconds.
- **Multi-Microcontroller Automatic OTA Updates**:
  - Upgraded canary release channel to `v1.1.1-canary` on Cloudflare Worker.
  - Automatic chip detection in `/api/ota` ensuring ESP32-S3 devices download `firmware-esp32s3-v1.1.1-canary.bin`.
  - Added raw GitHub fallback in worker download proxy for instant binary availability upon push.
- **Website v1.1.1 Release**:
  - Bumped dashboard header and footer to `Web v1.1.1`.
  - Updated web installer flasher options and manifests for `v1.1.1 Canary`.
  - Upgraded timing records normalization to extract all 8 latency stages from telemetry payloads and D1 database columns.

## [1.1.0] - 2026-11-20

### Added
- **Website v1.1.0 Release**:
  - Station dropdown streamlined to display clean station names.
  - Clean KPI cards: stripped redundant sub-information from Solar Panel, LiPo Battery, Temperature, and Active Cycle Time cards.
  - Granular Latency Breakdown: Execution benchmarks chart and summary cards now display 8 granular stages: Sensor Measure, Wi-Fi Connect, IP DHCP, DNS Lookup, TCP Handshake, TLS Handshake, POST & Server, and Total Active Time.
  - LiPo battery autonomy calculation refined for real station datasets without NaN/stuck status.
  - Bumped application and footer version badges to `Web v1.1.0`.

- **Firmware v1.1.0-canary Updated Capabilities**:
  - **Internal Temperature Sensor**: Added support for ESP32-S3 internal temperature sensor (`temperatureRead()`), defaulting to internal on ESP32-S3.
  - **Modern eFuse ADC Calibration**: Switched from manual SAR ADC formulas to factory-calibrated `analogReadMilliVolts()` / `adc_cali_raw_to_voltage()`.
  - **Custom Sensor Pins & Calibration Factors**:
    - Selectable input pins for Temperature, Solar Voltage, and LiPo Voltage.
    - Selectable conversion factors: standard `x2.0` (for 1:1 voltage dividers), standard `x0.1` (for 10 mV/°C analog temp), or custom user-specified multipliers.
    - Individual toggles to temporarily disable solar and/or LiPo measurements.
  - **INA3221 Bus Voltage Integration**: When INA3221 is enabled, Solar panel voltage is read directly from INA3221 Channel 1 bus voltage.
  - **Static IP Configuration**: Added optional static IP, gateway, subnet mask, and DNS server settings.
  - **Soft-AP Connection Tester**: Added a "Test Connection" button and `/test-wifi` endpoint in the Soft-AP captive portal to test Wi-Fi network connectivity before rebooting.
  - **Wi-Fi Fast Reconnect**: Removed `WiFi.persistent(false)`, caching BSSID and RF channel in RTC memory and NVS for faster association.
  - **Granular Latency Benchmarking**: Detailed breakdown into DNS lookup, TCP 3-way handshake, TLS handshake (with `setInsecure()` skipping certificate chain verification), HTTP POST transmission, and Cloudflare Worker server execution. Printed to Serial output and reported in telemetry JSON.
  - **Reliable ESP32-S3 Double Reset Detection**: Implemented `RTC_NOINIT_ATTR` with NVS timestamp fallback to ensure double-press on EN/RST button reliably launches Soft-AP setup across `ESP_RST_POWERON` hardware resets.

## [1.1.0-canary] - 2026-11-20

### Added
- **Multi-Microcontroller Board Support**:
  - **ESP32 (Standard 4MB Flash)**: Partition scheme using `min_spiffs.csv` (1.9MB app0, 1.9MB app1, 192KB SPIFFS) to accommodate expanded telemetry features.
  - **ESP32-S3 (16MB Flash)**: New partition scheme `s3_16mb.csv` with dual 4MB OTA application partitions and ~8MB LittleFS storage space.
  - **ESP32-C5 (Dual-Band 2.4/5GHz Wi-Fi 6)**: Added support for next-gen RISC-V SoC with Wi-Fi 6 high-efficiency connectivity.
- **Selectable Power & Energy Modes**:
  - **Minimal Energy Consumption (Mode 0)**:
    - Microcontroller enters true Deep Sleep (`esp_deep_sleep_start()`), consuming ~10–15 µA.
    - Wakes up every 10 minutes, samples ADC and INA3221 sensors in ~15 ms, and records readings into RTC Slow Memory (`RTC_DATA_ATTR`).
    - Connects to Wi-Fi and uploads telemetry **only once an hour** (every 6th cycle) in a single compact batch.
    - Wi-Fi Fast-Connect: Caches BSSID and RF Channel in RTC memory to bypass full scan, achieving sub-second association.
    - Daily OTA check: Runs firmware check once per day (every 144 cycles).
  - **Balanced Mode (Mode 1)**:
    - Measures every 10 minutes and performs immediate telemetry upload with fast BSSID reconnect.
- **INA3221 Precision Power Monitor (I2C 0x40)**:
  - Channel 1: Solar Panel Bus Voltage, Shunt Current (mA), and calculated Power (mW).
  - Channel 3: Connected Load Bus Voltage, Shunt Current (mA), calculated Power (mW), and Load Resistance (Ω).
  - Configurable I2C pins (SDA, SCL), I2C address, and shunt resistor (Ω) in Soft-AP portal and NVS.
- **Dedicated Battery Analytics & Calculated Autonomy**:
  - Dedicated interactive card with timeframes: 1 Day, 7 Days, 30 Days, and 3 Months (90 Days).
  - Calculated 24-hour runtime estimate (detects diurnal solar recharge / self-sustaining status vs discharge rate to 3.3V cutoff).
  - Calculated 7-day trend estimate and 30-day long-term autonomy estimate.
- **Multi-Timeframe Execution Cycle Benchmark Selector**:
  - Added timeframe selector to Node Execution Latency & Cycle Benchmarks: **Recent (30 Cycles)**, **1 Day** (24h active wake history), **1 Week** (hourly averaged stage durations), and **1 Month** (daily averaged latency trends).
  - Automatically calculates and updates mean sensor measurement, Wi-Fi connect, IP DHCP, upload time, and duty cycle efficiency for the chosen timeframe.
- **Canary Release Channel**:
  - Canary versioning (`v1.1.0-canary`) with per-station toggle in Soft-AP setup portal, NVS, and Cloudflare D1 edge database.
  - Stations on the canary channel automatically receive canary OTA updates; stable stations remain on production releases.
- **Web Serial Multi-Board Flasher**:
  - Web flasher modal now provides dropdowns for Board (ESP32, ESP32-S3, ESP32-C5), Channel (v1.0.2 Stable vs v1.1.0 Canary), and Mode (Clean Install vs Update Only).

## [1.0.2] - 2026-11-18

### Added
- **Enclosure Temperature Visual Adjustment**:
  - Extended chart y-axis limits to 10–75°C with dynamic headroom scaling, preventing diurnal temperature clipping when nodes operate inside sun-heated transparent enclosures (reaching 55–65°C+).
  - Dynamic status badge on temperature card ("High (Sun Enclosure)" / "Warm (Sun)" / "Nominal").
- **Explicit Website & Firmware Version Indicators**:
  - Prominently displays Website / UI version (`Web v1.0.2`) in header badge and footer.
  - Displays Node Firmware version (`Node FW v...`) dynamically in station header and footer.
  - Telemetry payload and registration protocol transmit `firmware_version` to Cloudflare D1.
- **Soft-AP Connection Stability & Auto-Reboot**:
  - Automatically pauses configuration timeout while any client device is connected (`WiFi.softAPgetStationNum() > 0`), ensuring users are never disconnected while filling out configuration forms.
  - Automatically reboots ESP32 node 1 second after submitting configuration via the `/save` endpoint.
  - Password-protected Soft-AP Wi-Fi network (`12345678`), clearly printed to the serial interface at boot.
- **Daily Automatic OTA Firmware Check**:
  - Firmware executes an automatic check for newer releases once per day (every 144 cycles / 24 hours, plus on cycle #1).
  - Added serial command `OTA` to trigger an immediate Over-The-Air update check on demand.

## [1.0.1] - 2026-11-18

### Added
- **Double Reset Detection (Soft-AP Configuration)**:
  - Added double reset button detection within a 2-second window using RTC memory (`DoubleResetDetector`), allowing LOLIN32 boards lacking a dedicated boot button to trigger configuration mode.
  - Added Soft-AP setup portal on `192.168.4.1` with a 120-second countdown timer.
  - Interactive setup UI with live ADC readings for local temperature, solar panel voltage, and LiPo battery voltage.
  - Web form for configuring Station Name, Location, primary & backup Wi-Fi credentials, `MASTER_PHRASE`, worker URL, and hardware pins framework (`pin_temp`, `pin_solar`, `pin_lipo`).
- **Standard OTA & Core Dump Partition Table**:
  - Replaced `min_spiffs.csv` with standard ESP32 dual OTA partition layout (`partitions/default.csv`) containing an explicit `coredump` partition (`0x10000` / 64KB at `0x3F0000`).
  - Completely resolves `E (434) esp_core_dump_flash: No core dump partition found!`.
- **Cloudflare Account Migration & Verification**:
  - Bound and migrated `solar-db` to primary `kreier` Cloudflare account (`545c9b44c3df46e24d2ae837aebfa7b6`).
  - Deployed worker to `https://solar.kreier.workers.dev` and verified live D1 ingestion with `MASTER_PHRASE`.
  - Updated Web Serial installer manifests and pre-built binaries to v1.0.1.

## [1.0.0] - 2026-11-18

### Added
- **ESP32 Firmware**:
  - Implemented 100x multisampled analog sensing on Pin 32 (temperature), Pin 34 (solar voltage), Pin 35 (LiPo battery voltage).
  - Implemented empirical ADC non-linearity calibration formulas with zero-offset protection for nighttime readings.
  - Implemented 10-minute light sleep power management with clean Wi-Fi radio power-down.
  - Implemented execution cycle stage timing benchmark (startup, measure, Wi-Fi connection, DHCP IP acquisition, TLS upload, and HTTP 200 confirmation).
  - Implemented prior-cycle RTC benchmark handoff, including the previous cycle's full benchmark in the subsequent upload payload.
  - Implemented zero-trust station onboarding using `MASTER_PHRASE` bootstrap secret and automated token storage in NVS.
  - Prepared partition table (`min_spiffs.csv`) with dual 1.9MB OTA application partitions (`app0` / `app1`) and 192KB SPIFFS.
  - Prepared automated Over-The-Air (OTA) firmware upgrade mechanism via `OtaManager`.
  - Added dual PlatformIO and Arduino IDE project structure.
- **Cloudflare Worker & D1 Ingestion**:
  - Edge ingestion Worker at `https://solar.kreier.workers.dev`.
  - Cloudflare D1 SQL schema and migrations for `stations` and `measurements`.
  - Endpoints: `POST /api/register`, `POST /api/data`, `GET /api/ota`, `GET /api/stations`, `GET /api/history`.
  - Bearer token authentication and per-device isolation.
  - OTA update proxy with GitHub Releases and Cloudflare R2 streaming fallbacks.
- **Web UI & Dashboard**:
  - Multi-day overlay chart comparing 0:00 to 24:00 diurnal curves across the last 3 days for Solar Voltage, LiPo Battery Voltage, and Temperature.
  - Continuous 72-hour chronological telemetry timeline.
  - Interactive cycle latency breakdown charts and stage benchmark indicators.
  - In-browser Web Serial firmware installer powered by ESP Web Tools on both Cloudflare Worker and GitHub Pages.
  - Dual flashing modes: Full Firmware with device erase (`manifest.json` flashing bootloader, partitions, boot_app0, and app), and Update Only (`manifest-update.json` preserving NVS Wi-Fi credentials and device token).
  - Responsive dark-theme dashboard served via Worker SSR and static GitHub Pages mirror.
- **Repository & Agentic Architecture**:
  - `AGENTS.md` specifying AI agent operational guidance, architecture diagrams, and hardware protocols.
  - Architecture Decision Records (`docs/adr/0001` through `0005`) and ADR index.
  - GitHub Actions workflows for automated GitHub Pages deployment (`deploy-pages.yml`) and PlatformIO CI build verification (`build-firmware.yml`).

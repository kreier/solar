# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-11-18

### Added
- **Soft-AP Connection Stability & Auto-Reboot**:
  - Automatically pauses configuration timeout while any client device is connected (`WiFi.softAPgetStationNum() > 0`), ensuring users are never disconnected while filling out configuration forms.
  - Automatically reboots ESP32 node 1 second after submitting configuration via the `/save` endpoint.
  - Password-protected Soft-AP Wi-Fi network (`12345678`), clearly printed to the serial interface at boot.
- **Web UI Station Header & Telemetry Firmware Tracking**:
  - Prominently displays the active station firmware version in the header subtitle badge alongside Station Name and Location.
  - Telemetry payload includes `firmware_version` (`FIRMWARE_VERSION="1.0.2"`), stored in D1 database and reflected in edge API responses.
- **Daily Automatic OTA Firmware Check**:
  - Firmware executes an automatic check for newer releases once per day (every 144 cycles / 24 hours, plus on cycle #1).
  - Added serial command `OTA` to trigger an immediate Over-The-Air update check on demand.
- **Version Bump**:
  - Updated firmware, web dashboards, and Web Serial flasher manifests to v1.0.2.

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

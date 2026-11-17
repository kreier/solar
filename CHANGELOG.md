# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  - Responsive dark-theme dashboard served via Worker SSR and static GitHub Pages mirror.
- **Repository & Agentic Architecture**:
  - `AGENTS.md` specifying AI agent operational guidance, architecture diagrams, and hardware protocols.
  - Architecture Decision Records (`docs/adr/0001` through `0005`) and ADR index.
  - GitHub Actions workflows for automated GitHub Pages deployment (`deploy-pages.yml`) and PlatformIO CI build verification (`build-firmware.yml`).

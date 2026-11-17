# Architecture Decision Records (ADRs)

This directory documents the foundational architectural and design decisions governing `kreier/solar`.

## Index of Records

| ADR | Title | Status | Date | Summary |
| --- | ----- | ------ | ---- | ------- |
| [0001](0001-cloudflare-d1-edge-storage.md) | Use Cloudflare D1 Serverless SQLite Over Git / Spreadsheet Storage | Accepted | 2026-11-18 | Replaces fragile IFTTT quotas and git-commit repository bloat with low-latency edge SQL ingestion. |
| [0002](0002-zero-trust-bootstrap-provisioning.md) | Zero-Trust Bootstrap Secret & Per-Device Bearer Token Provisioning | Accepted | 2026-11-18 | One-time `MASTER_PHRASE` handshake exchanged for unique per-device UUID Bearer token stored in NVS. |
| [0003](0003-esp32-adc-nonlinearity-calibration.md) | ESP32 ADC Nonlinearity Compensation & Multisampling Calibration | Accepted | 2026-11-18 | 100x multisampling and hardware-fitted piecewise linear calibrations for Pin 32 (temp), Pin 34 (solar), Pin 35 (LiPo). |
| [0004](0004-light-sleep-cadence-and-cycle-benchmarking.md) | 10-Minute Light Sleep Cadence with Prior-Cycle Stage Benchmarking | Accepted | 2026-11-18 | Sub-second active wake cycle with stage timestamps saved in RTC memory and uploaded in the subsequent cycle. |
| [0005](0005-minimal-spiffs-and-dual-ota-partitioning.md) | Minimal SPIFFS & Dual 1.9MB Application Slots for OTA Updates | Accepted | 2026-11-18 | Dual OTA partitions (`app0`/`app1`) enabling resilient over-the-air firmware upgrades via Cloudflare edge streaming. |

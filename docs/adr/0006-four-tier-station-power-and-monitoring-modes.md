# ADR 0006: Four-Tier Station Operational Modes (Low Power, Active, Verbose, Monitor)

## Status
Accepted

## Date
2026-11-20

## Context
Solar telemetry nodes operate across diverse operational environments:
- Field nodes on remote battery installations where battery autonomy across weeks of overcast conditions is paramount.
- Bench nodes under active hardware or sensor characterization where real-time continuous feedback is required.
- Diagnostic nodes where serial tracing of internal state transitions is needed.
- Environmental RF monitoring nodes that must track 2.4 GHz channel saturation, packet densities, and nearby BLE device population without interfering with telemetry.

Previously, stations supported only a binary mode: Minimal Energy (Mode 0) and Balanced (Mode 1). A structured four-tier categorization was needed to support all operational profiles with clearly defined sleep cadences, sensor averaging, telemetry burst profiles, and OTA schedules.

## Decision
We define and implement four operational modes configured per-station via Soft-AP (`power_mode`):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FOUR STATION OPERATIONAL MODES                        │
├───────────────┬──────────────┬──────────────┬───────────────┬───────────────┤
│ Mode          │ Sleep Type   │ Sampling     │ Ingestion     │ OTA Check     │
├───────────────┼──────────────┼──────────────┼───────────────┼───────────────┤
│ 0. Low Power  │ Deep Sleep   │ Every 10 min │ 1-Hour Batch  │ Daily (24h)   │
│ 1. Active     │ Light Sleep  │ Every 1 min  │ 10-Min Avg    │ Hourly        │
│ 2. Verbose    │ Light Sleep  │ Every 1 min  │ 10-Min Avg    │ Hourly        │
│ 3. Monitor    │ Light Sleep  │ Every 1 min  │ 10-Min RF/Avg │ Hourly        │
└───────────────┴──────────────┴──────────────┴───────────────┴───────────────┘
```

### 1. Low Power Mode (`mode 0`)
- **Sleep Strategy**: Deep Sleep (`esp_deep_sleep_start()`), consuming ~10–15 µA.
- **Sensor Cadence**: Wakes every 10 minutes to sample ADC and INA3221. Records sample directly into RTC Slow Memory (`RTC_DATA_ATTR`). Classic ESP32 nodes can additionally utilize the Ultra Low Power (ULP) coprocessor state machine to sample ADC channels without waking the main Xtensa core.
- **Telemetry Ingestion**: Every 6th cycle (1 hour), the main CPU activates Wi-Fi in an optimized ~1.1-second burst to transmit all 6 accumulated historical samples and roundtrip latency benchmarks to Cloudflare D1.
- **OTA Verification**: Automatic firmware checks run once daily (every 144 cycles / 24 hours).
- **Web Dashboard**: 1-day timeline presents 24 hourly batch points; 1-week timeline displays 168 time slots.

### 2. Active Mode (`mode 1`)
- **Sleep Strategy**: Light Sleep (`esp_light_sleep_start()`), retaining standard SRAM and digital peripherals.
- **Sensor Cadence**: Wakes every 1 minute to record instantaneous ADC and INA3221 telemetry into rolling SRAM buffers.
- **Telemetry Ingestion**: Every 10 minutes, calculates arithmetic mean over the 10 samples and uploads telemetry to Cloudflare D1.
- **OTA Verification**: Firmware update check executed once every hour.
- **Web Dashboard**: 1-day timeline presents all 144 ten-minute intervals; 1-week timeline uses the peak/worst value for each hourly slot.

### 3. Verbose Mode (`mode 2`)
- **Sleep Strategy**: Light Sleep (`esp_light_sleep_start()`).
- **Operation**: Mirrors Active Mode cadence (1-minute sampling, 10-minute average upload, hourly OTA).
- **Diagnostics**: Keeps Serial UART active, outputting real-time sensor measurements, voltage divider raw counts, I2C bus transactions, and connection timers on every 1-minute tick.

### 4. Monitor Mode (`mode 3`)
- **Sleep Strategy**: Light Sleep (`esp_light_sleep_start()`).
- **RF Passive Sniffing**: Main CPU enters promiscuous mode (`esp_wifi_set_promiscuous(true)`) and sweeps Wi-Fi channels 1 through 13 (and dual-band 5 GHz on ESP32-C5) with a 1.0-second dwell time per channel, counting observed 802.11 MAC packet frames.
- **BLE Device Density**: Concurrently captures unique Bluetooth Low Energy advertisement beacons.
- **Telemetry Ingestion**: Uploads 10-minute sensor averages augmented with channel occupancy distribution (`wifi_channels`), peak packet rate (`wifi_max_packets`), busiest channel (`wifi_busiest_channel`), and unique BLE count (`ble_unique_devices`).
- **OTA Verification**: Hourly check.
- **Web Dashboard**: Dedicated interactive RF Heatmap widget with selectable color schemes (Inferno, Viridis, Turbo/Rainbow, Amber/Solar) mapping 30-minute intervals and 7-day occupancy trends.

## Consequences

### Positive
- Flexible deployment profiles from ultra-low power harvesting nodes (years of battery operation) to rich environmental RF intelligence stations.
- Deterministic payload schemas supported across Cloudflare D1 and dual dashboards.
- Socket idle timeout eliminated (HTTP response body read limited by Content-Length), dropping active transmission burst latency from ~9.2s to ~1.1s.
- SRAM retained across light sleep eliminates RTC attribute restrictions in Modes 1, 2, and 3.

### Negative / Trade-offs
- Monitor mode dwell time (13 channels × 1.0s = 13s) increases active energy consumption during scan cycles, requiring continuous solar power or higher capacity LiPo cells (>= 2000 mAh).

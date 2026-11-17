# ADR 0004: 10-Minute Light Sleep Cadence with Prior-Cycle Stage Benchmarking

## Status
Accepted

## Date
2026-11-18

## Context
Solar field monitors must operate continuously across monsoon seasons and cloudy periods on a 1000 mAh LiPo battery. Active radio transmission consumes ~116 mA (430 mW), whereas sleep states consume a tiny fraction of a milliampere.

In addition, debugging field performance (such as router DHCP delays, DNS lookups, and edge HTTP upload latency) requires high-resolution stage timings. However, measuring the exact end-to-end time of an HTTP upload and its confirmation (HTTP 200) cannot easily be included in the very payload being uploaded without circular timing dependencies.

## Decision
1. **10-Minute Light Sleep Cadence**:
   - Every 10 minutes (600 seconds), the ESP32 wakes up via internal timer.
   - The Wi-Fi radio is cleanly shut down (`WiFi.disconnect(true); WiFi.mode(WIFI_OFF); esp_wifi_stop();`) prior to entering light sleep.
   - Light sleep preserves RAM and CPU state while slashing power consumption from ~40 mA to low microamperes.
2. **Prior-Cycle Stage Benchmarking**:
   - The execution cycle measures six distinct milestone timestamps:
     - `t_startup`: Boot / wake initialization.
     - `t_measure`: 100x multisample ADC conversion.
     - `t_wifi_connect`: Duration to associate with Wi-Fi AP.
     - `t_ip_obtained`: Time until valid DHCP IPv4 lease acquired.
     - `t_upload_start`: Initiation of TLS handshake and HTTP POST.
     - `t_upload_confirm`: Receipt and verification of HTTP 200 OK.
   - The current cycle includes partial timings up to upload start, as well as the **complete benchmark of the preceding cycle** retrieved from `RTC_DATA_ATTR` memory:
     ```json
     "prev_cycle": {
       "boot_ms": 5,
       "measure_ms": 12,
       "wifi_connect_ms": 820,
       "ip_obtain_ms": 115,
       "upload_ms": 410,
       "total_cycle_ms": 1362,
       "http_code": 200
     }
     ```
   - Once HTTP 200 is confirmed, the cycle timer finalizes and persists the current cycle's metrics to RTC memory for transmission in the next cycle.

## Consequences

### Positive
- Battery life extended to months/years even without sunlight.
- Exact millisecond-level visibility into edge network performance, AP association latency, and Cloudflare Worker ingestion times.
- Zero circular timing dependencies.

# ADR 0005: Minimal SPIFFS & Dual 1.9MB Application Slots for OTA Updates

## Status
Accepted

## Date
2026-11-18

## Context
Standard ESP32 partition tables default to a single application slot (1.3 MB) and large SPIFFS partition (1.5 MB), which lacks Over-The-Air (OTA) update capability. When nodes are deployed outdoors (rooftops, exterior poles), physical USB flashing is impractical or dangerous. A dual-OTA partition scheme is required to enable safe, remote updates without bricking field hardware.

## Decision
We configure a custom partition table `firmware/partitions/min_spiffs.csv`:

```csv
# ESP32 4MB Flash - Minimal SPIFFS / Large APP with Dual OTA Partition Table
# Name,   Type, SubType, Offset,   Size,     Flags
nvs,      data, nvs,     0x9000,   0x5000,
otadata,  data, ota,     0xe000,   0x2000,
app0,     app,  ota_0,   0x10000,  0x1E0000,
app1,     app,  ota_1,   0x1F0000, 0x1E0000,
spiffs,   data, spiffs,  0x3D0000, 0x30000,
```

Key features:
1. **Dual 1.9 MB Application Partitions (`app0` & `app1`)**:
   - Ample capacity for modern Arduino ESP32 cores, TLS client stacks (`WiFiClientSecure`), and JSON parsers (`ArduinoJson` v7).
   - Inactive partition receives streaming update; `otadata` swaps boot vector only upon verified successful write.
2. **Minimal SPIFFS (192 KB)**:
   - Sufficient for local offline logging or captive assets without squandering flash space.
3. **Automated Edge Update Delivery**:
   - ESP32 periodically queries `GET /api/ota?station_id=...&version=...`.
   - The Cloudflare Worker streams the target binary (`firmware-esp32-vX.Y.Z.bin`) via `/api/ota/download/...` using R2 storage or proxying GitHub Releases.

## Consequences

### Positive
- Zero risk of bricking during power interruptions: bootloader rolls back if new image fails.
- Generous headroom for TLS and cryptographic libraries.
- Firmware update workflow unified with `kreier/wifi`.

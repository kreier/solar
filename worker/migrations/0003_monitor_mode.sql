-- Migration 0003: RF Monitor Mode (Wi-Fi Channel Occupancy & BLE Unique Devices)
ALTER TABLE measurements ADD COLUMN wifi_max_packets INTEGER DEFAULT 0;
ALTER TABLE measurements ADD COLUMN wifi_busiest_channel INTEGER DEFAULT 0;
ALTER TABLE measurements ADD COLUMN ble_unique_devices INTEGER DEFAULT 0;
ALTER TABLE measurements ADD COLUMN wifi_channels_json TEXT;

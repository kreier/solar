-- D1 Migration: Initial Schema for kreier/solar
-- Supports multi-station solar, LiPo, temperature telemetry, and cycle benchmarks

CREATE TABLE IF NOT EXISTS stations (
  station_id TEXT PRIMARY KEY,
  location TEXT,
  description TEXT,
  device_token TEXT NOT NULL,
  firmware_version TEXT,
  target_version TEXT,
  is_canary INTEGER DEFAULT 0,
  last_seen TEXT,
  created_at TEXT NOT NULL,
  ip_address TEXT,
  battery_mv INTEGER,
  solar_mv INTEGER,
  temp_c REAL
);

CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  solar_mv INTEGER NOT NULL,
  solar_v REAL,
  lipo_mv INTEGER NOT NULL,
  lipo_v REAL,
  temp_c REAL NOT NULL,
  temp_mv INTEGER,
  raw_pin32 INTEGER,
  raw_pin34 INTEGER,
  raw_pin35 INTEGER,
  boot_count INTEGER,
  cycle_boot_ms INTEGER,
  cycle_measure_ms INTEGER,
  cycle_wifi_ms INTEGER,
  cycle_ip_ms INTEGER,
  cycle_upload_ms INTEGER,
  cycle_total_ms INTEGER,
  cycle_http_code INTEGER,
  raw_payload TEXT,
  FOREIGN KEY (station_id) REFERENCES stations(station_id)
);

CREATE INDEX IF NOT EXISTS idx_measurements_station_time
ON measurements (station_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_stations_last_seen
ON stations (last_seen DESC);

-- D1 Migration: Station static ohmic load and uptime metrics
ALTER TABLE stations ADD COLUMN static_load_ohm REAL DEFAULT 48.0;
ALTER TABLE stations ADD COLUMN uptime_s INTEGER DEFAULT 0;
ALTER TABLE measurements ADD COLUMN uptime_s INTEGER DEFAULT NULL;

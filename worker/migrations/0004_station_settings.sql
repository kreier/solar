-- D1 Migration: Station settings (power_mode, enable_lipo)
ALTER TABLE stations ADD COLUMN power_mode INTEGER DEFAULT 0;
ALTER TABLE stations ADD COLUMN enable_lipo INTEGER DEFAULT 0;

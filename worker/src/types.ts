export interface Env {
  DB: D1Database;
  MASTER_PHRASE?: string;
  STABLE_VERSION?: string;
  WORKER_URL?: string;
  R2_BUCKET?: R2Bucket;
}

export interface RegisterRequest {
  station_id: string;
  location?: string;
  description?: string;
  bootstrap_secret: string;
}

export interface CycleMetrics {
  boot_ms?: number;
  measure_ms?: number;
  wifi_connect_ms?: number;
  ip_obtain_ms?: number;
  upload_ms?: number;
  total_cycle_ms?: number;
  http_code?: number;
  valid?: boolean;
}

export interface TelemetryPayload {
  station_id: string;
  location?: string;
  firmware_version?: string;
  boot_count?: number;
  solar_mv: number;
  solar_v?: number;
  lipo_mv: number;
  lipo_v?: number;
  temp_c: number;
  temp_mv?: number;
  raw_adc?: {
    pin32?: number;
    pin34?: number;
    pin35?: number;
  };
  prev_cycle?: CycleMetrics;
  current_cycle?: CycleMetrics;
}

export interface StationRecord {
  station_id: string;
  location: string | null;
  description: string | null;
  device_token: string;
  firmware_version: string | null;
  target_version: string | null;
  is_canary: number;
  last_seen: string | null;
  created_at: string;
  ip_address: string | null;
  battery_mv: number | null;
  solar_mv: number | null;
  temp_c: number | null;
}

export interface MeasurementRecord {
  id: number;
  station_id: string;
  timestamp: string;
  solar_mv: number;
  solar_v: number;
  lipo_mv: number;
  lipo_v: number;
  temp_c: number;
  temp_mv: number;
  raw_pin32: number | null;
  raw_pin34: number | null;
  raw_pin35: number | null;
  boot_count: number | null;
  cycle_boot_ms: number | null;
  cycle_measure_ms: number | null;
  cycle_wifi_ms: number | null;
  cycle_ip_ms: number | null;
  cycle_upload_ms: number | null;
  cycle_total_ms: number | null;
  cycle_http_code: number | null;
}

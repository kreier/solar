export interface Env {
  DB: D1Database;
  MASTER_PHRASE?: string;
  STABLE_VERSION?: string;
  CANARY_VERSION?: string;
  WORKER_URL?: string;
  R2_BUCKET?: R2Bucket;
}

export interface RegisterRequest {
  station_id: string;
  location?: string;
  description?: string;
  bootstrap_secret: string;
  firmware_version?: string;
  is_canary?: number;
}

export interface CycleMetrics {
  boot_ms?: number;
  measure_ms?: number;
  wifi_connect_ms?: number;
  ip_obtain_ms?: number;
  dns_ms?: number;
  tcp_ms?: number;
  tls_ms?: number;
  post_ms?: number;
  server_ms?: number;
  upload_ms?: number;
  total_cycle_ms?: number;
  http_code?: number;
  valid?: boolean;
}

export interface Ina3221Metrics {
  ch1_solar?: {
    voltage_v?: number;
    current_ma?: number;
    power_mw?: number;
  };
  ch3_load?: {
    voltage_v?: number;
    current_ma?: number;
    power_mw?: number;
    resistance_ohm?: number;
  };
}

export interface BufferedBatchSample {
  boot_count?: number;
  solar_mv: number;
  lipo_mv: number;
  temp_c: number;
  ina3221?: Ina3221Metrics;
}

export interface MonitorMetrics {
  wifi_channels?: number[];
  wifi_busiest_channel?: number;
  wifi_max_packets?: number;
  ble_unique_devices?: number;
}

export interface TelemetryPayload {
  station_id: string;
  location?: string;
  firmware_version?: string;
  boot_count?: number;
  power_mode?: number;
  is_canary?: number;
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
  ina3221?: Ina3221Metrics;
  monitor?: MonitorMetrics;
  batch_samples?: BufferedBatchSample[];
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
  cycle_dns_ms?: number | null;
  cycle_tcp_ms?: number | null;
  cycle_tls_ms?: number | null;
  cycle_post_ms?: number | null;
  cycle_server_ms?: number | null;
  cycle_upload_ms: number | null;
  cycle_total_ms: number | null;
  cycle_http_code: number | null;
  wifi_max_packets?: number | null;
  wifi_busiest_channel?: number | null;
  ble_unique_devices?: number | null;
  wifi_channels_json?: string | null;
  raw_payload: string | null;
}

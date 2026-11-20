import { Env, StationRecord, TelemetryPayload, MeasurementRecord } from "./types";

export class Database {
  private db: D1Database;

  constructor(env: Env) {
    this.db = env.DB;
  }

  async upsertStation(
    stationId: string,
    location: string,
    description: string,
    deviceToken: string,
    firmwareVersion?: string,
    isCanary?: number
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO stations (
           station_id, location, description, device_token, firmware_version, is_canary, created_at, last_seen
         ) VALUES (
           ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7
         )
         ON CONFLICT(station_id) DO UPDATE SET
           location = excluded.location,
           description = excluded.description,
           device_token = excluded.device_token,
           firmware_version = COALESCE(excluded.firmware_version, stations.firmware_version),
           is_canary = COALESCE(excluded.is_canary, stations.is_canary),
           last_seen = excluded.last_seen`
      )
      .bind(
        stationId,
        location,
        description,
        deviceToken,
        firmwareVersion || null,
        isCanary !== undefined ? isCanary : 0,
        now
      )
      .run();
  }

  async getStation(stationId: string): Promise<StationRecord | null> {
    return await this.db
      .prepare(`SELECT * FROM stations WHERE station_id = ?1 LIMIT 1`)
      .bind(stationId)
      .first<StationRecord>();
  }

  async getStationByToken(token: string): Promise<StationRecord | null> {
    return await this.db
      .prepare(`SELECT * FROM stations WHERE device_token = ?1 LIMIT 1`)
      .bind(token)
      .first<StationRecord>();
  }

  async listStations(): Promise<StationRecord[]> {
    const result = await this.db
      .prepare(`SELECT * FROM stations ORDER BY last_seen DESC`)
      .all<StationRecord>();
    return result.results || [];
  }

  async insertMeasurement(
    payload: TelemetryPayload,
    clientIp: string | null
  ): Promise<void> {
    const now = new Date().toISOString();
    const nowMs = Date.now();

    // 1. If batch_samples are present (Minimal Energy mode hourly uploads), insert buffered samples first
    if (payload.batch_samples && payload.batch_samples.length > 0) {
      const count = payload.batch_samples.length;
      for (let i = 0; i < count; i++) {
        const sample = payload.batch_samples[i];
        // Calculate timestamp offset: each sample was taken ~10 minutes apart
        const sampleTimeMs = nowMs - (count - i) * 10 * 60 * 1000;
        const sampleTime = new Date(sampleTimeMs).toISOString();

        const sSolarV = sample.solar_mv / 1000.0;
        const sLipoV = sample.lipo_mv / 1000.0;
        const sTempMv = Math.round(sample.temp_c * 10.0);

        await this.db
          .prepare(
            `INSERT INTO measurements (
               station_id, timestamp, solar_mv, solar_v, lipo_mv, lipo_v,
               temp_c, temp_mv, raw_pin32, raw_pin34, raw_pin35, boot_count,
               cycle_boot_ms, cycle_measure_ms, cycle_wifi_ms, cycle_ip_ms,
               cycle_upload_ms, cycle_total_ms, cycle_http_code, raw_payload
             ) VALUES (
               ?1, ?2, ?3, ?4, ?5, ?6,
               ?7, ?8, NULL, NULL, NULL, ?9,
               NULL, NULL, NULL, NULL,
               NULL, NULL, 200, ?10
             )`
          )
          .bind(
            payload.station_id,
            sampleTime,
            sample.solar_mv,
            sSolarV,
            sample.lipo_mv,
            sLipoV,
            sample.temp_c,
            sTempMv,
            sample.boot_count ?? null,
            JSON.stringify(sample)
          )
          .run();
      }
    }

    // 2. Insert current latest cycle measurement
    const solarV = payload.solar_v ?? payload.solar_mv / 1000.0;
    const lipoV = payload.lipo_v ?? payload.lipo_mv / 1000.0;
    const tempMv = payload.temp_mv ?? Math.round(payload.temp_c * 10.0);

    const prev = payload.prev_cycle;
    const cur = payload.current_cycle;

    const bootMs = prev?.boot_ms ?? null;
    const measureMs = prev?.measure_ms ?? cur?.measure_ms ?? null;
    const wifiMs = prev?.wifi_connect_ms ?? cur?.wifi_connect_ms ?? null;
    const ipMs = prev?.ip_obtain_ms ?? cur?.ip_obtain_ms ?? null;
    const dnsMs = prev?.dns_ms ?? cur?.dns_ms ?? null;
    const tcpMs = prev?.tcp_ms ?? cur?.tcp_ms ?? null;
    const tlsMs = prev?.tls_ms ?? cur?.tls_ms ?? null;
    const postMs = prev?.post_ms ?? cur?.post_ms ?? null;
    const serverMs = prev?.server_ms ?? cur?.server_ms ?? null;
    const uploadMs = prev?.upload_ms ?? null;
    const totalMs = prev?.total_cycle_ms ?? (uploadMs && wifiMs && measureMs ? (measureMs + wifiMs + (ipMs || 0) + uploadMs) : null);
    const httpCode = prev?.http_code ?? 200;

    await this.db
      .prepare(
        `INSERT INTO measurements (
           station_id, timestamp, solar_mv, solar_v, lipo_mv, lipo_v,
           temp_c, temp_mv, raw_pin32, raw_pin34, raw_pin35, boot_count,
           cycle_boot_ms, cycle_measure_ms, cycle_wifi_ms, cycle_ip_ms,
           cycle_dns_ms, cycle_tcp_ms, cycle_tls_ms, cycle_post_ms, cycle_server_ms,
           cycle_upload_ms, cycle_total_ms, cycle_http_code, raw_payload
         ) VALUES (
           ?1, ?2, ?3, ?4, ?5, ?6,
           ?7, ?8, ?9, ?10, ?11, ?12,
           ?13, ?14, ?15, ?16,
           ?17, ?18, ?19, ?20, ?21,
           ?22, ?23, ?24, ?25
         )`
      )
      .bind(
        payload.station_id,
        now,
        payload.solar_mv,
        solarV,
        payload.lipo_mv,
        lipoV,
        payload.temp_c,
        tempMv,
        payload.raw_adc?.pin32 ?? null,
        payload.raw_adc?.pin34 ?? null,
        payload.raw_adc?.pin35 ?? null,
        payload.boot_count ?? null,
        bootMs,
        measureMs,
        wifiMs,
        ipMs,
        dnsMs,
        tcpMs,
        tlsMs,
        postMs,
        serverMs,
        uploadMs,
        totalMs,
        httpCode,
        JSON.stringify(payload)
      )
      .run();

    // 3. Update station last_seen, current readings, and canary status
    await this.db
      .prepare(
        `UPDATE stations SET
           last_seen = ?1,
           firmware_version = COALESCE(?2, firmware_version),
           location = COALESCE(?3, location),
           battery_mv = ?4,
           solar_mv = ?5,
           temp_c = ?6,
           ip_address = COALESCE(?7, ip_address),
           is_canary = CASE WHEN ?8 IS NOT NULL THEN ?8 ELSE is_canary END
         WHERE station_id = ?9`
      )
      .bind(
        now,
        payload.firmware_version ?? null,
        payload.location ?? null,
        payload.lipo_mv,
        payload.solar_mv,
        payload.temp_c,
        clientIp,
        payload.is_canary ?? null,
        payload.station_id
      )
      .run();
  }

  async getHistory(
    stationId: string,
    days: number = 3
  ): Promise<MeasurementRecord[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const result = await this.db
      .prepare(
        `SELECT * FROM measurements
         WHERE station_id = ?1 AND timestamp >= ?2
         ORDER BY timestamp ASC`
      )
      .bind(stationId, cutoffDate)
      .all<MeasurementRecord>();

    return result.results || [];
  }
}

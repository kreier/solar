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
    deviceToken: string
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO stations (station_id, location, description, device_token, created_at, last_seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(station_id) DO UPDATE SET
           location = excluded.location,
           description = excluded.description,
           device_token = excluded.device_token,
           last_seen = excluded.last_seen`
      )
      .bind(stationId, location, description, deviceToken, now)
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

    const solarV = payload.solar_v ?? payload.solar_mv / 1000.0;
    const lipoV = payload.lipo_v ?? payload.lipo_mv / 1000.0;
    const tempMv = payload.temp_mv ?? Math.round(payload.temp_c * 10.0);

    const prev = payload.prev_cycle;

    await this.db
      .prepare(
        `INSERT INTO measurements (
           station_id, timestamp, solar_mv, solar_v, lipo_mv, lipo_v,
           temp_c, temp_mv, raw_pin32, raw_pin34, raw_pin35, boot_count,
           cycle_boot_ms, cycle_measure_ms, cycle_wifi_ms, cycle_ip_ms,
           cycle_upload_ms, cycle_total_ms, cycle_http_code, raw_payload
         ) VALUES (
           ?1, ?2, ?3, ?4, ?5, ?6,
           ?7, ?8, ?9, ?10, ?11, ?12,
           ?13, ?14, ?15, ?16,
           ?17, ?18, ?19, ?20
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
        prev?.boot_ms ?? null,
        prev?.measure_ms ?? null,
        prev?.wifi_connect_ms ?? null,
        prev?.ip_obtain_ms ?? null,
        prev?.upload_ms ?? null,
        prev?.total_cycle_ms ?? null,
        prev?.http_code ?? null,
        JSON.stringify(payload)
      )
      .run();

    // Update station last_seen and current readings
    await this.db
      .prepare(
        `UPDATE stations SET
           last_seen = ?1,
           firmware_version = COALESCE(?2, firmware_version),
           location = COALESCE(?3, location),
           battery_mv = ?4,
           solar_mv = ?5,
           temp_c = ?6,
           ip_address = COALESCE(?7, ip_address)
         WHERE station_id = ?8`
      )
      .bind(
        now,
        payload.firmware_version ?? null,
        payload.location ?? null,
        payload.lipo_mv,
        payload.solar_mv,
        payload.temp_c,
        clientIp,
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

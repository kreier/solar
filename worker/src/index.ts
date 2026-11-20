import { Env } from "./types";
import { Database } from "./db";
import { handleRegister } from "./register";
import { handleTelemetry } from "./telemetry";
import { handleOta, handleFirmwareDownload } from "./ota";
import { renderDashboardHtml } from "./frontend";
import { validateAdminCredentials, createAdminToken, checkAdminAuth } from "./auth";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS pre-flight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    // Helper to add CORS headers
    const withCors = (res: Response): Response => {
      const headers = new Headers(res.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers
      });
    };

    try {
      // 1. Station Registration Endpoint
      if (path === "/api/register" || path === "/register") {
        return withCors(await handleRegister(request, env));
      }

      // 2. Telemetry Ingestion Endpoint
      if (path === "/api/data" || path === "/data") {
        return withCors(await handleTelemetry(request, env));
      }

      // 3. OTA Updates & Binary Streaming
      if (path === "/api/ota" || path.startsWith("/api/ota/download/")) {
        return withCors(await handleOta(request, env));
      }

      // Static Firmware Binary Download Endpoint
      if (path.startsWith("/firmware/")) {
        const filename = decodeURIComponent(path.substring("/firmware/".length));
        return withCors(await handleFirmwareDownload(filename, env));
      }

      // ESP Web Tools Manifests for Web Serial Flashing
      if (path === "/manifest.json" || path.startsWith("/manifest-")) {
        const isCanary = path.includes("canary") || url.searchParams.get("version") === "1.1.4-canary";
        const isUpdate = path.includes("update") || url.searchParams.get("mode") === "update";
        const versionStr = isCanary ? (env.CANARY_VERSION || "1.1.4-canary") : (env.STABLE_VERSION || "1.1.4");

        const builds = isUpdate
          ? [
              {
                chipFamily: "ESP32",
                parts: [{ path: `firmware/firmware-esp32-v${versionStr}.bin`, offset: 65536 }]
              },
              {
                chipFamily: "ESP32-S3",
                parts: [{ path: `firmware/firmware-esp32s3-v${versionStr}.bin`, offset: 65536 }]
              },
              {
                chipFamily: "ESP32-C6",
                parts: [{ path: `firmware/firmware-esp32c5-v${versionStr}.bin`, offset: 65536 }]
              }
            ]
          : [
              {
                chipFamily: "ESP32",
                parts: [{ path: `firmware/firmware-esp32-merged-v${versionStr}.bin`, offset: 0 }]
              },
              {
                chipFamily: "ESP32-S3",
                parts: [{ path: `firmware/firmware-esp32s3-merged-v${versionStr}.bin`, offset: 0 }]
              },
              {
                chipFamily: "ESP32-C6",
                parts: [{ path: `firmware/firmware-esp32c5-merged-v${versionStr}.bin`, offset: 0 }]
              }
            ];

        return withCors(
          new Response(
            JSON.stringify({
              name: `Solar Telemetry Fleet (${versionStr}${isUpdate ? " Update" : ""})`,
              version: versionStr,
              funding_url: "https://github.com/kreier/solar",
              new_install_prompt_erase: !isUpdate,
              builds
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" }
            }
          )
        );
      }

      // 4. Stations List API
      if (path === "/api/stations") {
        const db = new Database(env);
        const stations = await db.listStations();
        return withCors(
          new Response(JSON.stringify(stations), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-cache, no-store, must-revalidate"
            }
          })
        );
      }

      // 4a. Admin Authentication Endpoints
      if (path === "/api/auth/login" && request.method === "POST") {
        try {
          const body = await request.json<{ username?: string; password?: string }>();
          if (!body.username || !body.password) {
            return withCors(
              new Response(JSON.stringify({ error: "Username and password required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
              })
            );
          }
          if (validateAdminCredentials(body.username, body.password, env)) {
            const tokenInfo = await createAdminToken(body.username, env);
            return withCors(
              new Response(
                JSON.stringify({
                  success: true,
                  token: tokenInfo.token,
                  expires_at: tokenInfo.expires_at,
                  username: body.username
                }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          } else {
            return withCors(
              new Response(JSON.stringify({ error: "Invalid username or password" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
              })
            );
          }
        } catch {
          return withCors(
            new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
      }

      if (path === "/api/auth/verify") {
        const isAuthed = await checkAdminAuth(request, env);
        if (isAuthed) {
          return withCors(
            new Response(JSON.stringify({ valid: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            })
          );
        } else {
          return withCors(
            new Response(JSON.stringify({ valid: false, error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
      }

      // 4b. Update Station Settings (Mode, Canary, Lipo, Location, Target Version)
      if (path === "/api/station/settings" && request.method === "POST") {
        if (!(await checkAdminAuth(request, env))) {
          return withCors(
            new Response(JSON.stringify({ error: "Unauthorized. Admin credentials required." }), {
              status: 401,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
        const body = await request.json<{
          station_id: string;
          power_mode?: number;
          enable_lipo?: number;
          location?: string;
          is_canary?: number;
          target_version?: string | null;
        }>();
        if (!body.station_id) {
          return withCors(
            new Response(JSON.stringify({ error: "Missing required field: station_id" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
        const db = new Database(env);
        await db.updateStationSettings(body.station_id, body);
        return withCors(
          new Response(
            JSON.stringify({
              success: true,
              station_id: body.station_id,
              settings: body
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // 4c. Legacy Toggle Canary Channel for a Station
      if (path === "/api/station/canary" && request.method === "POST") {
        if (!(await checkAdminAuth(request, env))) {
          return withCors(
            new Response(JSON.stringify({ error: "Unauthorized. Admin credentials required." }), {
              status: 401,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
        const body = await request.json<{ station_id: string; is_canary: number }>();
        if (!body.station_id) {
          return withCors(
            new Response(JSON.stringify({ error: "Missing required field: station_id" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
        const db = new Database(env);
        await env.DB.prepare("UPDATE stations SET is_canary = ?1 WHERE station_id = ?2")
          .bind(body.is_canary ? 1 : 0, body.station_id)
          .run();
        return withCors(
          new Response(
            JSON.stringify({
              success: true,
              station_id: body.station_id,
              is_canary: body.is_canary ? 1 : 0
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // 4d. Delete Station and all associated Telemetry
      if (
        (path === "/api/station" && request.method === "DELETE") ||
        (path === "/api/station/delete" && request.method === "POST")
      ) {
        if (!(await checkAdminAuth(request, env))) {
          return withCors(
            new Response(JSON.stringify({ error: "Unauthorized. Admin credentials required." }), {
              status: 401,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
        let stationId = url.searchParams.get("station_id")?.trim();
        if (!stationId && request.headers.get("Content-Type")?.includes("application/json")) {
          try {
            const body = await request.json<{ station_id: string }>();
            stationId = body.station_id?.trim();
          } catch (_) {}
        }
        if (!stationId) {
          return withCors(
            new Response(JSON.stringify({ error: "Missing required field: station_id" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
        const db = new Database(env);
        const result = await db.deleteStation(stationId);
        return withCors(
          new Response(
            JSON.stringify({
              success: true,
              station_id: stationId,
              ...result
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // 4e. Prune Telemetry Data for Station
      if (path === "/api/station/prune" && request.method === "POST") {
        if (!(await checkAdminAuth(request, env))) {
          return withCors(
            new Response(JSON.stringify({ error: "Unauthorized. Admin credentials required." }), {
              status: 401,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
        const body = await request.json<{ station_id: string; older_than_days: number }>();
        if (!body.station_id || typeof body.older_than_days !== "number") {
          return withCors(
            new Response(JSON.stringify({ error: "Missing required fields: station_id, older_than_days" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            })
          );
        }
        const db = new Database(env);
        const pruned = await db.pruneMeasurements(body.station_id, body.older_than_days);
        return withCors(
          new Response(
            JSON.stringify({
              success: true,
              station_id: body.station_id,
              older_than_days: body.older_than_days,
              deleted_measurements: pruned
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // 5. Historical Telemetry API
      if (path === "/api/history") {
        const stationId = url.searchParams.get("station_id")?.trim();
        const days = parseInt(url.searchParams.get("days") || "3", 10);

        if (!stationId) {
          return withCors(
            new Response(JSON.stringify({ error: "Missing required parameter: station_id" }), {
              status: 400,
              headers: { "Content-Type": "application/json" }
            })
          );
        }

        const db = new Database(env);
        const station = await db.getStation(stationId);
        const measurements = await db.getHistory(stationId, days);

        return withCors(
          new Response(
            JSON.stringify({
              station,
              days,
              measurements
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "Cache-Control": "no-cache, no-store, must-revalidate"
              }
            }
          )
        );
      }

      // 6. Web Dashboard (SSR)
      if (path === "/" || path === "/index.html") {
        const html = renderDashboardHtml(env.WORKER_URL);
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }

      return withCors(
        new Response(JSON.stringify({ error: "Not Found", path }), {
          status: 404,
          headers: { "Content-Type": "application/json" }
        })
      );
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[Worker] Unhandled error:", errMsg);
      return withCors(
        new Response(JSON.stringify({ error: "Internal Server Error", message: errMsg }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        })
      );
    }
  }
};

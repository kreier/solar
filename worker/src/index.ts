import { Env } from "./types";
import { Database } from "./db";
import { handleRegister } from "./register";
import { handleTelemetry } from "./telemetry";
import { handleOta, handleFirmwareDownload } from "./ota";
import { renderDashboardHtml } from "./frontend";

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
        const isCanary = path.includes("canary") || url.searchParams.get("version") === "1.1.0-canary";
        const isUpdate = path.includes("update") || url.searchParams.get("mode") === "update";
        const versionStr = isCanary ? "1.1.0-canary" : "1.0.2";

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

      // 4b. Toggle Canary Channel for a Station
      if (path === "/api/station/canary" && request.method === "POST") {
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

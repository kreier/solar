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
        const board = url.searchParams.get("board") || (path.includes("s3") ? "esp32s3" : (path.includes("c5") ? "esp32c5" : "esp32"));
        const versionParam = url.searchParams.get("version") || (path.includes("canary") ? "1.1.0-canary" : "1.0.2");
        const isUpdate = path.includes("update") || url.searchParams.get("mode") === "update";

        let chipFamily = "ESP32";
        let bootloaderOffset = 4096;
        let partitionOffset = 32768;
        let bootApp0Offset = 57344;
        let appOffset = 65536;

        if (board === "esp32s3") {
          chipFamily = "ESP32-S3";
          bootloaderOffset = 0;
          partitionOffset = 32768;
          bootApp0Offset = 57344;
          appOffset = 65536;
        } else if (board === "esp32c5") {
          chipFamily = "ESP32-C6"; // Compatible flasher family in ESP Web Tools
          bootloaderOffset = 0;
          partitionOffset = 32768;
          bootApp0Offset = 57344;
          appOffset = 65536;
        }

        const binPrefix = board === "esp32" ? "firmware" : `firmware-${board}`;
        const parts = isUpdate
          ? [{ path: `firmware/${binPrefix}.bin`, offset: appOffset }]
          : [
              { path: `firmware/bootloader.bin`, offset: bootloaderOffset },
              { path: `firmware/partitions.bin`, offset: partitionOffset },
              { path: `firmware/boot_app0.bin`, offset: bootApp0Offset },
              { path: `firmware/${binPrefix}.bin`, offset: appOffset }
            ];

        return withCors(
          new Response(
            JSON.stringify({
              name: `Solar Telemetry Fleet (${chipFamily} ${isUpdate ? "Update" : "Full"})`,
              version: versionParam,
              funding_url: "https://github.com/kreier/solar",
              new_install_prompt_erase: !isUpdate,
              builds: [
                {
                  chipFamily: chipFamily,
                  parts: parts
                }
              ]
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
            headers: { "Content-Type": "application/json" }
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
                "Cache-Control": "public, max-age=60"
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

import { Env } from "./types";
import { Database } from "./db";
import { handleRegister } from "./register";
import { handleTelemetry } from "./telemetry";
import { handleOta } from "./ota";
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

import { Env, TelemetryPayload } from "./types";
import { Database } from "./db";

export async function handleTelemetry(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Extract Bearer Token
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: Missing or malformed Bearer token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const deviceToken = authHeader.substring(7).trim();
  const db = new Database(env);
  const station = await db.getStationByToken(deviceToken);

  if (!station) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: Invalid device token" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  let payload: TelemetryPayload;
  try {
    payload = await request.json<TelemetryPayload>();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Safety check: ensure payload station matches token station
  if (payload.station_id && payload.station_id !== station.station_id) {
    return new Response(
      JSON.stringify({ error: "Forbidden: Station ID mismatch for token" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  payload.station_id = station.station_id;
  const clientIp = request.headers.get("CF-Connecting-IP");

  await db.insertMeasurement(payload, clientIp);

  return new Response(
    JSON.stringify({
      success: true,
      station_id: station.station_id,
      timestamp: new Date().toISOString(),
      message: "Measurement recorded successfully"
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
}

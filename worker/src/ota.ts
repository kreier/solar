import { Env, StationRecord } from "./types";
import { Database } from "./db";

function parseSemVer(v: string): [number, number, number] {
  const clean = v.replace(/^v/i, "").split("-")[0].trim();
  const parts = clean.split(".").map(p => parseInt(p, 10) || 0);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function compareSemVer(v1: string, v2: string): number {
  const [maj1, min1, pat1] = parseSemVer(v1);
  const [maj2, min2, pat2] = parseSemVer(v2);
  if (maj1 !== maj2) return maj1 - maj2;
  if (min1 !== min2) return min1 - min2;
  return pat1 - pat2;
}

export async function handleOta(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // 1. Download Endpoint: /api/ota/download/:filename
  if (url.pathname.startsWith("/api/ota/download/")) {
    const filename = decodeURIComponent(url.pathname.substring("/api/ota/download/".length));
    return await handleFirmwareDownload(filename, env);
  }

  // 2. OTA Check Endpoint: GET /api/ota?station_id=...&version=...
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  const stationId = url.searchParams.get("station_id")?.trim();
  const currentVersion = url.searchParams.get("version")?.trim() || "0.0.0";
  let chip = url.searchParams.get("chip")?.trim();

  if (!stationId) {
    return new Response(JSON.stringify({ error: "Missing required query parameter: station_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Auto-detect chip if not explicitly sent by node
  if (!chip) {
    const sIdLower = stationId.toLowerCase();
    if (sIdLower.includes("s3")) {
      chip = "esp32s3";
    } else if (sIdLower.includes("c5") || sIdLower.includes("c6")) {
      chip = "esp32c5";
    } else {
      chip = "esp32";
    }
  }

  const db = new Database(env);
  const station = await db.getStation(stationId);

  // Check if station accepts canary channel
  const isCanary = (station?.is_canary === 1) || (url.searchParams.get("canary") === "1");
  const defaultVersion = isCanary ? (env.CANARY_VERSION || "1.1.11-canary") : (env.STABLE_VERSION || "1.1.5");
  let targetVersion = station?.target_version?.trim() || defaultVersion;

  // Check if station is already on or ahead of target version
  if (compareSemVer(targetVersion, currentVersion) <= 0) {
    return new Response(
      JSON.stringify({
        update_available: false,
        station_id: stationId,
        chip,
        current_version: currentVersion,
        target_version: targetVersion,
        is_canary: isCanary ? 1 : 0,
        power_mode: station?.power_mode ?? 0,
        enable_lipo: station?.enable_lipo ?? 0,
        message: "Firmware is already up to date"
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const filename = `firmware-${chip}-v${targetVersion}.bin`;
  const downloadUrl = `${url.origin}/api/ota/download/${filename}`;

  return new Response(
    JSON.stringify({
      update_available: true,
      station_id: stationId,
      chip,
      current_version: currentVersion,
      target_version: targetVersion,
      is_canary: isCanary ? 1 : 0,
      power_mode: station?.power_mode ?? 0,
      enable_lipo: station?.enable_lipo ?? 0,
      url: downloadUrl
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    }
  );
}

function createBinaryResponse(buffer: ArrayBuffer, filename: string): Response {
  const headers = new Headers();
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Content-Length", buffer.byteLength.toString());
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  return new Response(buffer, { status: 200, headers });
}

export async function handleFirmwareDownload(filename: string, env: Env): Promise<Response> {
  // 1. If R2 bucket is configured, serve directly
  if (env.R2_BUCKET) {
    try {
      const r2Object = await env.R2_BUCKET.get(filename);
      if (r2Object && r2Object.body) {
        const buffer = await r2Object.arrayBuffer();
        return createBinaryResponse(buffer, filename);
      }
    } catch (err) {
      console.warn("[OTA] R2 lookup failed:", err);
    }
  }

  // 2. Try raw GitHub repo main branch (immediately available on push)
  const rawGhUrl = `https://raw.githubusercontent.com/kreier/solar/main/docs/firmware/${filename}`;
  try {
    const rawResponse = await fetch(rawGhUrl, {
      headers: { "User-Agent": "kreier-solar-worker" }
    });
    console.log(`[OTA] rawResponse url: ${rawGhUrl}, status: ${rawResponse.status}`);
    if (rawResponse.ok) {
      const buffer = await rawResponse.arrayBuffer();
      return createBinaryResponse(buffer, filename);
    }
  } catch (err) {
    console.warn("[OTA] Raw GitHub proxy failed:", err);
  }

  // 3. Try GitHub Pages static fallback
  const pagesUrl = `https://kreier.github.io/solar/firmware/${filename}`;
  try {
    const pagesResponse = await fetch(pagesUrl, {
      redirect: "follow",
      headers: { "User-Agent": "kreier-solar-worker" }
    });
    if (pagesResponse.ok) {
      const buffer = await pagesResponse.arrayBuffer();
      return createBinaryResponse(buffer, filename);
    }
  } catch (err) {
    console.warn("[OTA] GitHub Pages proxy failed:", err);
  }

  // 4. Try GitHub Releases
  const match = filename.match(/v(\d+\.\d+\.\d+)/);
  const tag = match ? `v${match[1]}` : `v${env.STABLE_VERSION || "1.0.2"}`;
  const ghUrl = `https://github.com/kreier/solar/releases/download/${tag}/${filename}`;

  try {
    const ghResponse = await fetch(ghUrl, {
      redirect: "follow",
      headers: { "User-Agent": "kreier-solar-worker" }
    });
    if (ghResponse.ok) {
      const buffer = await ghResponse.arrayBuffer();
      return createBinaryResponse(buffer, filename);
    }
  } catch (err) {
    console.warn("[OTA] GitHub Releases proxy failed:", err);
  }

  return Response.redirect(ghUrl, 302);
}

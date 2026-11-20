import { Env } from "./types";

function getSecret(env: Env): string {
  return env.ADMIN_PASSWORD || env.MASTER_PHRASE || "solar-admin-secret-default";
}

async function hmacSha256(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const hashArray = Array.from(new Uint8Array(sig));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export function validateAdminCredentials(username?: string, password?: string, env?: Env): boolean {
  if (!username || !password || !env) return false;
  const expectedUser = env.ADMIN_USERNAME || "admin";
  const expectedPass = env.ADMIN_PASSWORD || env.MASTER_PHRASE || "admin";
  return username === expectedUser && password === expectedPass;
}

export async function createAdminToken(username: string, env: Env): Promise<{ token: string; expires_at: number }> {
  const expires_at = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const payload = JSON.stringify({ u: username, exp: expires_at });
  const payloadB64 = btoa(payload);
  const sig = await hmacSha256(payloadB64, getSecret(env));
  const token = `${payloadB64}.${sig}`;
  return { token, expires_at };
}

export async function verifyAdminToken(token: string, env: Env): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const [payloadB64, providedSig] = token.split(".");
  if (!payloadB64 || !providedSig) return false;

  try {
    const jsonStr = atob(payloadB64);
    const data = JSON.parse(jsonStr) as { u?: string; exp?: number };
    if (!data.exp || data.exp < Date.now()) {
      return false; // Token expired
    }

    const expectedSig = await hmacSha256(payloadB64, getSecret(env));
    return providedSig === expectedSig;
  } catch {
    return false;
  }
}

export async function checkAdminAuth(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;

  // 1. Bearer token check
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (!token) return false;
    // Allow master phrase directly
    if (env.MASTER_PHRASE && token === env.MASTER_PHRASE) return true;
    if (env.ADMIN_PASSWORD && token === env.ADMIN_PASSWORD) return true;
    // Check signed admin session token
    return await verifyAdminToken(token, env);
  }

  // 2. Basic auth check
  if (authHeader.startsWith("Basic ")) {
    try {
      const b64 = authHeader.substring(6).trim();
      const decoded = atob(b64);
      const [u, p] = decoded.split(":");
      return validateAdminCredentials(u, p, env);
    } catch {
      return false;
    }
  }

  return false;
}

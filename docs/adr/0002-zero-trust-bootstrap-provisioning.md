# ADR 0002: Zero-Trust Bootstrap Secret & Per-Device Bearer Token Provisioning

## Status
Accepted

## Date
2026-11-18

## Context
Solar telemetry nodes are deployed outdoors in publicly accessible or semi-private physical locations. Embedding permanent API keys, database credentials, or master secrets into firmware images or flash memory presents significant security risks:
1. Physical device theft or flash dumping could expose administrative secrets.
2. Compromise of a shared API token compromises the entire fleet.
3. Revoking an API key would require simultaneously reflashing every deployed node.

Following the battle-tested pattern established in `kreier/wifi`, stations require an automated, zero-trust onboarding process.

## Decision
We implement a **Two-Stage Zero-Trust Provisioning Protocol** using an ephemeral `MASTER_PHRASE`:

1. **Initial Registration**:
   - Freshly flashed stations boot without a device token.
   - The station connects to Wi-Fi and issues an HTTPS `POST /api/register` with:
     ```json
     {
       "station_id": "phumy2",
       "location": "District 7, HCMC",
       "bootstrap_secret": "<MASTER_PHRASE>"
     }
     ```
   - The Cloudflare Worker validates `bootstrap_secret === env.MASTER_PHRASE`.
   - The Worker generates a unique, cryptographically random UUIDv4 `device_token` and persists it in the `stations` D1 table.
2. **Token Storage & Secret Purge**:
   - The ESP32 receives the `device_token` and saves it to Non-Volatile Storage (NVS Preferences).
   - The ESP32 immediately and permanently erases the `MASTER_PHRASE` from both RAM and NVS.
3. **Authenticated Operation**:
   - All subsequent telemetry submissions authenticate using `Authorization: Bearer <device_token>`.
   - The worker verifies the token against D1 on every upload.
   - Any compromised node can be revoked instantly by modifying or deleting its token in D1.

## Consequences

### Positive
- Master secrets are never stored permanently on deployed microcontrollers.
- Granular per-device revocation and isolation across the entire fleet.
- Seamless automatic onboarding for new field nodes.

### Negative
- Initial registration requires one roundtrip handshake with Cloudflare Worker before telemetry begins.

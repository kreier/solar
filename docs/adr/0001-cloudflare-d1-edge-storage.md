# ADR 0001: Use Cloudflare D1 Serverless SQLite Over Git / Spreadsheet Storage

## Status
Accepted

## Date
2026-11-18

## Context
Earlier telemetry architectures for solar stations (such as `SolarPHUMY2` running from May 2020 to November 2026) relied on third-party webhook relays (e.g. IFTTT webhooks) forwarding measurements to Google Sheets, or direct commits to Git repositories. In November 2026, monthly IFTTT quota exhaustion (1,000 monthly executions) permanently stopped data uploads until the billing cycle reset.

Furthermore, direct Git commits from distributed microcontrollers suffer from write contention, high TLS handshake overhead, repository size bloat (~144 commits per station per day), and lack indexed SQL querying for dashboard visualization.

## Decision
We select **Cloudflare D1** (serverless SQLite at the edge) and **Cloudflare Workers** (`https://solar.kreier.workers.dev`) as the ingestion engine and time-series datastore for all solar field stations.

Key aspects:
1. **Low-Latency Edge Ingestion**: Field ESP32 nodes POST compact JSON telemetry directly to the nearest Cloudflare point of presence.
2. **Relational SQL Queries**: D1 provides sub-50ms indexed queries for multi-day overlays (0:00 to 24:00), continuous time-series, and fleet station status.
3. **Decoupled Architecture**: ESP32 firmware communicates exclusively via clean REST endpoints (`/api/register`, `/api/data`, `/api/ota`), removing dependencies on Google Sheets or IFTTT.

## Consequences

### Positive
- Zero risk of third-party monthly execution quota exhaustion.
- Sub-500ms server response times on ESP32 telemetry uploads, minimizing active radio-on time.
- Highly expressive SQL querying for daily rollups and diurnal overlays.
- Seamless dual-dashboard support (Worker SSR and GitHub Pages static client).

### Negative
- Requires a Cloudflare account with a D1 database binding.

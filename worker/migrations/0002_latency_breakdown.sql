-- Migration 0002: Add latency breakdown columns
-- Supports granular cycle timing: DNS lookup, TCP handshake, TLS handshake, HTTP POST, and server response

ALTER TABLE measurements ADD COLUMN cycle_dns_ms INTEGER;
ALTER TABLE measurements ADD COLUMN cycle_tcp_ms INTEGER;
ALTER TABLE measurements ADD COLUMN cycle_tls_ms INTEGER;
ALTER TABLE measurements ADD COLUMN cycle_post_ms INTEGER;
ALTER TABLE measurements ADD COLUMN cycle_server_ms INTEGER;

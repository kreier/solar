#pragma once

#include <Arduino.h>
#include <esp_rtc_time.h>
#include "soc/rtc.h"

static inline uint32_t getRtcUptimeSeconds() {
    uint64_t us = esp_rtc_get_time_us();
    if (us > 0) {
        return (uint32_t)(us / 1000000ULL);
    }
    return (uint32_t)(esp_timer_get_time() / 1000000ULL);
}

struct CycleBenchmark {
    uint32_t boot_ms;         // Time spent in hardware/sensor init
    uint32_t measure_ms;      // Duration of ADC multisampling
    uint32_t wifi_connect_ms; // Duration from WiFi.begin to WL_CONNECTED
    uint32_t ip_obtain_ms;    // Duration from connection until valid IP address acquired
    uint32_t dns_ms;          // DNS host resolution latency
    uint32_t tcp_ms;          // TCP 3-way handshake duration
    uint32_t tls_ms;          // TLS handshake (mbedTLS, skip cert verify)
    uint32_t post_ms;         // HTTP POST payload transmit duration
    uint32_t server_ms;       // Server execution latency until response header received
    uint32_t upload_ms;       // Total upload duration
    uint32_t total_cycle_ms;  // Total active time from cycle start to sleep entry
    int http_code;            // HTTP response code (e.g. 200)
    bool valid;               // Flag indicating valid prior cycle benchmark data exists
};

// Retained across deep/light sleep or reboots in RTC memory
extern RTC_DATA_ATTR CycleBenchmark rtc_prev_cycle;
extern RTC_DATA_ATTR int rtc_boot_count;

class CycleTimer {
private:
    uint32_t _cycle_start_millis;
    uint32_t _t_measure_start;
    uint32_t _t_measure_end;
    uint32_t _t_wifi_start;
    uint32_t _t_wifi_connected;
    uint32_t _t_ip_obtained;
    uint32_t _t_upload_start;
    uint32_t _t_upload_end;

    uint32_t _dns_ms;
    uint32_t _tcp_ms;
    uint32_t _tls_ms;
    uint32_t _post_ms;
    uint32_t _server_ms;

    int _http_code;

public:
    CycleTimer() : _cycle_start_millis(0), _t_measure_start(0), _t_measure_end(0),
                   _t_wifi_start(0), _t_wifi_connected(0), _t_ip_obtained(0),
                   _t_upload_start(0), _t_upload_end(0),
                   _dns_ms(0), _tcp_ms(0), _tls_ms(0), _post_ms(0), _server_ms(0),
                   _http_code(0) {}

    void startCycle() {
        _cycle_start_millis = millis();
        rtc_boot_count++;
    }

    void markMeasureStart() {
        _t_measure_start = millis();
    }

    void markMeasureEnd() {
        _t_measure_end = millis();
    }

    void markWifiConnectStart() {
        _t_wifi_start = millis();
    }

    void markWifiConnected() {
        _t_wifi_connected = millis();
    }

    void markIpObtained() {
        _t_ip_obtained = millis();
    }

    void markUploadStart() {
        _t_upload_start = millis();
    }

    void setUploadBreakdown(uint32_t dnsMs, uint32_t tcpMs, uint32_t tlsMs, uint32_t postMs, uint32_t serverMs) {
        _dns_ms = dnsMs;
        _tcp_ms = tcpMs;
        _tls_ms = tlsMs;
        _post_ms = postMs;
        _server_ms = serverMs;
    }

    void markUploadEnd(int httpCode) {
        _t_upload_end = millis();
        _http_code = httpCode;
    }

    uint32_t getMeasureDuration() const {
        return (_t_measure_end >= _t_measure_start) ? (_t_measure_end - _t_measure_start) : 0;
    }

    uint32_t getWifiConnectDuration() const {
        return (_t_wifi_connected >= _t_wifi_start) ? (_t_wifi_connected - _t_wifi_start) : 0;
    }

    uint32_t getIpObtainDuration() const {
        return (_t_ip_obtained >= _t_wifi_connected) ? (_t_ip_obtained - _t_wifi_connected) : 0;
    }

    uint32_t getUploadDuration() const {
        return (_t_upload_end >= _t_upload_start) ? (_t_upload_end - _t_upload_start) : 0;
    }

    uint32_t getDnsDuration() const { return _dns_ms; }
    uint32_t getTcpDuration() const { return _tcp_ms; }
    uint32_t getTlsDuration() const { return _tls_ms; }
    uint32_t getPostDuration() const { return _post_ms; }
    uint32_t getServerDuration() const { return _server_ms; }

    uint32_t getTotalActiveDuration() const {
        return (millis() >= _cycle_start_millis) ? (millis() - _cycle_start_millis) : 0;
    }

    int getBootCount() const {
        return rtc_boot_count;
    }

    const CycleBenchmark& getPreviousCycle() const {
        return rtc_prev_cycle;
    }

    // Call before entering sleep to save current cycle metrics into RTC for the NEXT cycle's payload
    void finalizeAndSaveForNextCycle() {
        rtc_prev_cycle.boot_ms = (_t_measure_start >= _cycle_start_millis) ? (_t_measure_start - _cycle_start_millis) : 0;
        rtc_prev_cycle.measure_ms = getMeasureDuration();
        rtc_prev_cycle.wifi_connect_ms = getWifiConnectDuration();
        rtc_prev_cycle.ip_obtain_ms = getIpObtainDuration();
        rtc_prev_cycle.dns_ms = _dns_ms;
        rtc_prev_cycle.tcp_ms = _tcp_ms;
        rtc_prev_cycle.tls_ms = _tls_ms;
        rtc_prev_cycle.post_ms = _post_ms;
        rtc_prev_cycle.server_ms = _server_ms;
        rtc_prev_cycle.upload_ms = getUploadDuration();
        rtc_prev_cycle.total_cycle_ms = getTotalActiveDuration();
        rtc_prev_cycle.http_code = _http_code;
        rtc_prev_cycle.valid = (_http_code == 200 || _http_code == 201);
    }
};

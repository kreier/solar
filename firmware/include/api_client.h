#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "adc_reader.h"
#include "ina3221_reader.h"
#include "cycle_timer.h"
#include "app_config.h"
#include "monitor_manager.h"

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "1.1.7"
#endif

struct BufferedSample {
    uint32_t boot_count;
    int solar_mv;
    int lipo_mv;
    float temp_c;
    float power_mw;
    bool has_ina;
    float ch1_solar_v;
    float ch1_solar_ma;
    float ch1_solar_mw;
    float ch2_bat_v;
    float ch2_bat_ma;
    float ch2_bat_mw;
    float ch3_load_v;
    float ch3_load_ma;
    float ch3_load_mw;
    float ch3_load_res_ohm;
};

class ApiClient {
private:
    static void parseUrl(const String &url, String &host, uint16_t &port, String &path) {
        String u = url;
        port = 443;
        if (u.startsWith("https://")) {
            u = u.substring(8);
            port = 443;
        } else if (u.startsWith("http://")) {
            u = u.substring(7);
            port = 80;
        }

        int slashIdx = u.indexOf('/');
        if (slashIdx != -1) {
            host = u.substring(0, slashIdx);
            path = u.substring(slashIdx);
        } else {
            host = u;
            path = "/";
        }

        int colonIdx = host.indexOf(':');
        if (colonIdx != -1) {
            port = host.substring(colonIdx + 1).toInt();
            host = host.substring(0, colonIdx);
        }
    }

public:
    static bool registerStation(const String &workerUrl, const String &stationId,
                                const String &location, const String &masterPhrase,
                                bool isCanary, String &outDeviceToken) {
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println(F("[API] Cannot register: WiFi not connected"));
            return false;
        }

        String endpoint = workerUrl;
        if (endpoint.endsWith("/")) endpoint.remove(endpoint.length() - 1);
        endpoint += "/api/register";

        Serial.printf("[API] Registering station '%s' at %s...\n", stationId.c_str(), endpoint.c_str());

        WiFiClientSecure client;
        client.setInsecure(); // Cloudflare edge TLS validation: skip certificate chain verification

        HTTPClient http;
        http.setTimeout(10000);

        if (!http.begin(client, endpoint)) {
            Serial.println(F("[API] HTTPS connection failed to begin"));
            return false;
        }

        http.addHeader("Content-Type", "application/json");

        JsonDocument reqDoc;
        reqDoc["station_id"] = stationId;
        reqDoc["location"] = location;
        reqDoc["bootstrap_secret"] = masterPhrase;
        reqDoc["firmware_version"] = FIRMWARE_VERSION;
        reqDoc["is_canary"] = isCanary ? 1 : 0;

        String reqBody;
        serializeJson(reqDoc, reqBody);

        int httpCode = http.POST(reqBody);
        Serial.printf("[API] Register response code: %d\n", httpCode);

        if (httpCode == 200 || httpCode == 201) {
            String respBody = http.getString();
            http.end();

            JsonDocument respDoc;
            DeserializationError err = deserializeJson(respDoc, respBody);
            if (err) {
                Serial.printf("[API] Failed to parse registration JSON: %s\n", err.c_str());
                return false;
            }

            const char *token = respDoc["device_token"];
            if (token && strlen(token) > 0) {
                outDeviceToken = String(token);
                Serial.println(F("[API] Registration SUCCESS! Token stored."));
                return true;
            } else {
                Serial.println(F("[API] Response missing 'device_token'"));
                return false;
            }
        } else {
            String errBody = http.getString();
            Serial.printf("[API] Registration failed (%d): %s\n", httpCode, errBody.c_str());
            http.end();
            return false;
        }
    }

    static void printExecutionLatencyBreakdown(CycleTimer &timer,
                                              uint32_t dns_ms, uint32_t tcp_ms,
                                              uint32_t tls_ms, uint32_t post_ms,
                                              uint32_t server_ms, int httpCode,
                                              const String &host, const IPAddress &serverIp,
                                              size_t payloadBytes) {
        Serial.println(F("\n=================================================="));
        Serial.println(F(" [8-Stage Execution Latency & Benchmark Breakdown]"));
        Serial.println(F("=================================================="));
        Serial.printf("  1. Sensor Measure      : %4lu ms (ADC eFuse / INA3221)\n", (unsigned long)timer.getMeasureDuration());
        Serial.printf("  2. Wi-Fi Connect       : %4lu ms (SSID: '%s', Ch: %d, RSSI: %d dBm)\n", (unsigned long)timer.getWifiConnectDuration(), WiFi.SSID().c_str(), WiFi.channel(), (int)WiFi.RSSI());
        Serial.printf("  3. IP Acquisition      : %4lu ms (%s)\n", (unsigned long)timer.getIpObtainDuration(), WiFi.localIP().toString().c_str());
        Serial.printf("  4. DNS Lookup          : %4lu ms (%s -> %s)\n", (unsigned long)dns_ms, host.c_str(), serverIp.toString().c_str());
        Serial.printf("  5. TCP 3-Way Handshake : %4lu ms (Port 443)\n", (unsigned long)tcp_ms);
        Serial.printf("  6. TLS Handshake       : %4lu ms (mbedTLS SNI, Insecure=1)\n", (unsigned long)tls_ms);
        Serial.printf("  7. HTTP POST Payload   : %4lu ms (%zu bytes)\n", (unsigned long)post_ms, payloadBytes);
        Serial.printf("  8. Edge Server Exec    : %4lu ms (HTTP %d)\n", (unsigned long)server_ms, httpCode);
        Serial.println(F("--------------------------------------------------"));
        Serial.printf("  >> Total Upload Phase  : %4lu ms\n", (unsigned long)(dns_ms + tcp_ms + tls_ms + post_ms + server_ms));
        Serial.printf("  >> Total Active Cycle  : %4lu ms\n", (unsigned long)timer.getTotalActiveDuration());
        Serial.println(F("==================================================\n"));
    }

    static bool uploadTelemetry(const String &workerUrl, const String &deviceToken,
                                const SolarConfig &config, const AdcReadings &readings,
                                const Ina3221Readings &inaReadings, CycleTimer &timer,
                                const BufferedSample *batchSamples = nullptr, uint8_t batchCount = 0,
                                const MonitorMetrics *monitor = nullptr) {
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println(F("[API] Cannot upload: WiFi not connected"));
            return false;
        }

        timer.markUploadStart();

        String host, basePath;
        uint16_t port;
        parseUrl(workerUrl, host, port, basePath);
        String path = basePath;
        if (path.endsWith("/")) path.remove(path.length() - 1);
        path += "/api/data";

        // Step 1: DNS Lookup Benchmark
        uint32_t t_dns_start = millis();
        IPAddress serverIp;
        bool dnsOk = WiFi.hostByName(host.c_str(), serverIp);
        uint32_t dns_ms = millis() - t_dns_start;

        if (!dnsOk) {
            Serial.printf("[API] DNS lookup failed for '%s'\n", host.c_str());
            timer.setUploadBreakdown(dns_ms, 0, 0, 0, 0);
            timer.markUploadEnd(0);
            printExecutionLatencyBreakdown(timer, dns_ms, 0, 0, 0, 0, 0, host, serverIp, 0);
            return false;
        }

        // Step 2: TCP 3-way Handshake Benchmark
        uint32_t t_tcp_start = millis();
        WiFiClient tcpClient;
        tcpClient.setTimeout(3000);
        bool tcpOk = tcpClient.connect(serverIp, port);
        uint32_t tcp_ms = millis() - t_tcp_start;
        tcpClient.stop();

        // Step 3: TLS Handshake (mbedTLS, skip certificate chain verification)
        WiFiClientSecure secClient;
        secClient.setInsecure(); // Skip certificate verification overhead
        secClient.setTimeout(8000);

        uint32_t t_tls_start = millis();
        // Crucial: Must pass host.c_str() for SNI (Server Name Indication) so Cloudflare routes the TLS handshake!
        bool tlsOk = secClient.connect(host.c_str(), port);
        uint32_t tls_ms = millis() - t_tls_start;

        if (!tlsOk) {
            char errBuf[100] = {0};
            secClient.lastError(errBuf, sizeof(errBuf));
            Serial.printf("[API] TLS handshake to %s failed: %s\n", host.c_str(), errBuf);
            timer.setUploadBreakdown(dns_ms, tcp_ms, tls_ms, 0, 0);
            timer.markUploadEnd(0);
            printExecutionLatencyBreakdown(timer, dns_ms, tcp_ms, tls_ms, 0, 0, 0, host, serverIp, 0);
            return false;
        }

        // Build JSON Telemetry Payload
        JsonDocument doc;
        doc["station_id"] = config.station_id;
        doc["location"] = config.location;
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["boot_count"] = timer.getBootCount();
        doc["power_mode"] = config.power_mode;
        doc["is_canary"] = config.is_canary ? 1 : 0;

        // Measurement readings
        doc["solar_mv"] = readings.solar_mv;
        doc["solar_v"]  = readings.solar_v;
        doc["lipo_mv"]  = readings.lipo_mv;
        doc["lipo_v"]   = readings.lipo_v;
        doc["temp_c"]   = readings.temp_c;
        doc["temp_mv"]  = readings.temp_mv;
        float power_mw  = inaReadings.present ? inaReadings.ch1_solar_mw : 0.0f;
        doc["power_mw"] = serialized(String(power_mw, 2));

        // Raw ADC samples
        JsonObject rawObj = doc["raw_adc"].to<JsonObject>();
        rawObj["pin_temp"]  = readings.raw_pin_temp;
        rawObj["pin_solar"] = readings.raw_pin_solar;
        rawObj["pin_lipo"]  = readings.raw_pin_lipo;

        // INA3221 Sensor (CH1 Solar, CH2 Battery, CH3 Load)
        if (inaReadings.present) {
            JsonObject inaObj = doc["ina3221"].to<JsonObject>();

            JsonObject ch1 = inaObj["ch1_solar"].to<JsonObject>();
            ch1["voltage_v"] = serialized(String(inaReadings.ch1_solar_v, 3));
            ch1["current_ma"] = serialized(String(inaReadings.ch1_solar_ma, 2));
            ch1["power_mw"] = serialized(String(inaReadings.ch1_solar_mw, 2));

            JsonObject ch2 = inaObj["ch2_bat"].to<JsonObject>();
            ch2["voltage_v"] = serialized(String(inaReadings.ch2_bat_v, 3));
            ch2["current_ma"] = serialized(String(inaReadings.ch2_bat_ma, 2));
            ch2["power_mw"] = serialized(String(inaReadings.ch2_bat_mw, 2));

            JsonObject ch3 = inaObj["ch3_load"].to<JsonObject>();
            ch3["voltage_v"] = serialized(String(inaReadings.ch3_load_v, 3));
            ch3["current_ma"] = serialized(String(inaReadings.ch3_load_ma, 2));
            ch3["power_mw"] = serialized(String(inaReadings.ch3_load_mw, 2));
            ch3["resistance_ohm"] = serialized(String(inaReadings.ch3_load_res_ohm, 1));
        }

        // RF Monitor Mode (Wi-Fi Channel Occupancy & BLE Unique Count)
        if (monitor != nullptr && monitor->present) {
            JsonObject monObj = doc["monitor"].to<JsonObject>();
            JsonArray chArr = monObj["wifi_channels"].to<JsonArray>();
            for (uint8_t c = 1; c <= 13; c++) {
                chArr.add(monitor->wifi_channels[c]);
            }
            monObj["wifi_busiest_channel"] = monitor->wifi_busiest_channel;
            monObj["wifi_max_packets"] = monitor->wifi_max_packets;
            monObj["ble_unique_devices"] = monitor->ble_unique_count;
        }

        // Batch samples from RTC memory (for Minimal Energy 1-hour upload mode)
        if (batchSamples != nullptr && batchCount > 0) {
            JsonArray batchArr = doc["batch_samples"].to<JsonArray>();
            for (uint8_t i = 0; i < batchCount; i++) {
                JsonObject s = batchArr.add<JsonObject>();
                s["boot_count"] = batchSamples[i].boot_count;
                s["solar_mv"] = batchSamples[i].solar_mv;
                s["lipo_mv"] = batchSamples[i].lipo_mv;
                s["temp_c"] = batchSamples[i].temp_c;
                s["power_mw"] = serialized(String(batchSamples[i].power_mw, 2));

                if (batchSamples[i].has_ina) {
                    JsonObject sIna = s["ina3221"].to<JsonObject>();
                    JsonObject bCh1 = sIna["ch1_solar"].to<JsonObject>();
                    bCh1["voltage_v"] = serialized(String(batchSamples[i].ch1_solar_v, 3));
                    bCh1["current_ma"] = serialized(String(batchSamples[i].ch1_solar_ma, 2));
                    bCh1["power_mw"] = serialized(String(batchSamples[i].ch1_solar_mw, 2));

                    JsonObject bCh2 = sIna["ch2_bat"].to<JsonObject>();
                    bCh2["voltage_v"] = serialized(String(batchSamples[i].ch2_bat_v, 3));
                    bCh2["current_ma"] = serialized(String(batchSamples[i].ch2_bat_ma, 2));
                    bCh2["power_mw"] = serialized(String(batchSamples[i].ch2_bat_mw, 2));

                    JsonObject bCh3 = sIna["ch3_load"].to<JsonObject>();
                    bCh3["voltage_v"] = serialized(String(batchSamples[i].ch3_load_v, 3));
                    bCh3["current_ma"] = serialized(String(batchSamples[i].ch3_load_ma, 2));
                    bCh3["power_mw"] = serialized(String(batchSamples[i].ch3_load_mw, 2));
                    bCh3["resistance_ohm"] = serialized(String(batchSamples[i].ch3_load_res_ohm, 1));
                }
            }
        }

        // Previous cycle benchmark
        const CycleBenchmark &prev = timer.getPreviousCycle();
        if (prev.valid) {
            JsonObject prevObj = doc["prev_cycle"].to<JsonObject>();
            prevObj["boot_ms"] = prev.boot_ms;
            prevObj["measure_ms"] = prev.measure_ms;
            prevObj["wifi_connect_ms"] = prev.wifi_connect_ms;
            prevObj["ip_obtain_ms"] = prev.ip_obtain_ms;
            prevObj["dns_ms"] = prev.dns_ms;
            prevObj["tcp_ms"] = prev.tcp_ms;
            prevObj["tls_ms"] = prev.tls_ms;
            prevObj["post_ms"] = prev.post_ms;
            prevObj["server_ms"] = prev.server_ms;
            prevObj["upload_ms"] = prev.upload_ms;
            prevObj["total_cycle_ms"] = prev.total_cycle_ms;
            prevObj["http_code"] = prev.http_code;
        }

        // Current cycle benchmark (including DNS, TCP, TLS)
        JsonObject currObj = doc["current_cycle"].to<JsonObject>();
        currObj["measure_ms"] = timer.getMeasureDuration();
        currObj["wifi_connect_ms"] = timer.getWifiConnectDuration();
        currObj["ip_obtain_ms"] = timer.getIpObtainDuration();
        currObj["dns_ms"] = dns_ms;
        currObj["tcp_ms"] = tcp_ms;
        currObj["tls_ms"] = tls_ms;

        String jsonPayload;
        serializeJson(doc, jsonPayload);

        // Step 4: HTTP POST Transmission
        uint32_t t_post_start = millis();
        secClient.printf("POST %s HTTP/1.1\r\n", path.c_str());
        secClient.printf("Host: %s\r\n", host.c_str());
        secClient.printf("User-Agent: SolarESP32/%s\r\n", FIRMWARE_VERSION);
        secClient.println("Connection: close");
        secClient.println("Content-Type: application/json");
        secClient.printf("Authorization: Bearer %s\r\n", deviceToken.c_str());
        secClient.printf("Content-Length: %d\r\n\r\n", jsonPayload.length());
        secClient.print(jsonPayload);
        uint32_t post_ms = millis() - t_post_start;

        // Step 5: Server Execution & Response Latency
        uint32_t t_server_start = millis();
        while (secClient.connected() && !secClient.available() && (millis() - t_server_start < 4000)) {
            delay(5);
        }
        uint32_t server_ms = millis() - t_server_start;

        int httpCode = 0;
        String respBody = "";
        if (secClient.available()) {
            String statusLine = secClient.readStringUntil('\n');
            if (statusLine.startsWith("HTTP/1.")) {
                httpCode = statusLine.substring(9, 12).toInt();
            }
            // Parse headers and extract Content-Length
            int contentLength = -1;
            while (secClient.available()) {
                String line = secClient.readStringUntil('\n');
                if (line.startsWith("Content-Length:") || line.startsWith("content-length:")) {
                    contentLength = line.substring(15).toInt();
                }
                if (line == "\r" || line.length() == 0) break;
            }
            // Read response body without timeout delays
            if (contentLength > 0) {
                respBody.reserve(contentLength);
                for (int i = 0; i < contentLength && secClient.connected(); i++) {
                    int c = secClient.read();
                    if (c >= 0) respBody += (char)c;
                }
            } else if (secClient.available()) {
                respBody = secClient.readStringUntil('\n');
            }
        }
        secClient.stop();

        timer.setUploadBreakdown(dns_ms, tcp_ms, tls_ms, post_ms, server_ms);
        timer.markUploadEnd(httpCode);

        // Print Granular Latency Breakdown to Serial
        printExecutionLatencyBreakdown(timer, dns_ms, tcp_ms, tls_ms, post_ms, server_ms, httpCode, host, serverIp, jsonPayload.length());

        if (httpCode == 200 || httpCode == 201) {
            Serial.printf("[API] Telemetry accepted! Response: %s\n", respBody.c_str());
            return true;
        } else {
            Serial.printf("[API] Telemetry upload error (%d): %s\n", httpCode, respBody.c_str());
            return false;
        }
    }
};

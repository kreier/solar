#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "adc_reader.h"
#include "cycle_timer.h"
#include "app_config.h"

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "1.0.2"
#endif

class ApiClient {
public:
    static bool registerStation(const String &workerUrl, const String &stationId,
                                const String &location, const String &masterPhrase,
                                String &outDeviceToken) {
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println(F("[API] Cannot register: WiFi not connected"));
            return false;
        }

        String endpoint = workerUrl;
        if (endpoint.endsWith("/")) endpoint.remove(endpoint.length() - 1);
        endpoint += "/api/register";

        Serial.printf("[API] Registering station '%s' at %s...\n", stationId.c_str(), endpoint.c_str());

        WiFiClientSecure client;
        client.setInsecure(); // Cloudflare edge TLS validation

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

            const char *token = respDoc["device_token"] | "";
            if (strlen(token) > 0) {
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

    static bool uploadTelemetry(const String &workerUrl, const String &deviceToken,
                                const SolarConfig &config, const AdcReadings &readings,
                                CycleTimer &timer) {
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println(F("[API] Cannot upload: WiFi not connected"));
            return false;
        }

        String endpoint = workerUrl;
        if (endpoint.endsWith("/")) endpoint.remove(endpoint.length() - 1);
        endpoint += "/api/data";

        timer.markUploadStart();

        JsonDocument doc;
        doc["station_id"] = config.station_id;
        doc["location"] = config.location;
        doc["firmware_version"] = FIRMWARE_VERSION;
        doc["boot_count"] = timer.getBootCount();

        // Measurement readings
        doc["solar_mv"] = readings.solar_mv;
        doc["solar_v"] = readings.solar_v;
        doc["lipo_mv"] = readings.lipo_mv;
        doc["lipo_v"] = readings.lipo_v;
        doc["temp_c"] = readings.temp_c;
        doc["temp_mv"] = readings.temp_mv;

        // Raw ADC samples
        JsonObject rawObj = doc["raw_adc"].to<JsonObject>();
        rawObj["pin32"] = readings.raw_pin32;
        rawObj["pin34"] = readings.raw_pin34;
        rawObj["pin35"] = readings.raw_pin35;

        // Previous cycle benchmark (measured from last execution cycle)
        const CycleBenchmark &prev = timer.getPreviousCycle();
        if (prev.valid) {
            JsonObject prevObj = doc["prev_cycle"].to<JsonObject>();
            prevObj["boot_ms"] = prev.boot_ms;
            prevObj["measure_ms"] = prev.measure_ms;
            prevObj["wifi_connect_ms"] = prev.wifi_connect_ms;
            prevObj["ip_obtain_ms"] = prev.ip_obtain_ms;
            prevObj["upload_ms"] = prev.upload_ms;
            prevObj["total_cycle_ms"] = prev.total_cycle_ms;
            prevObj["http_code"] = prev.http_code;
        }

        // Current cycle partial benchmark up to upload initiation
        JsonObject currObj = doc["current_cycle"].to<JsonObject>();
        currObj["measure_ms"] = timer.getMeasureDuration();
        currObj["wifi_connect_ms"] = timer.getWifiConnectDuration();
        currObj["ip_obtain_ms"] = timer.getIpObtainDuration();

        String jsonPayload;
        serializeJson(doc, jsonPayload);

        WiFiClientSecure client;
        client.setInsecure();

        HTTPClient http;
        http.setTimeout(15000);

        if (!http.begin(client, endpoint)) {
            Serial.println(F("[API] Failed to begin telemetry HTTPS connection"));
            timer.markUploadEnd(-1);
            return false;
        }

        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", "Bearer " + deviceToken);

        Serial.printf("[API] Uploading telemetry to %s (%u bytes)...\n",
                      endpoint.c_str(), (unsigned)jsonPayload.length());

        int httpCode = http.POST(jsonPayload);
        timer.markUploadEnd(httpCode);

        bool success = (httpCode == 200 || httpCode == 201);
        if (success) {
            Serial.printf("[API] Telemetry accepted (HTTP %d)\n", httpCode);
        } else {
            String errStr = http.getString();
            Serial.printf("[API] Upload failed (HTTP %d): %s\n", httpCode, errStr.c_str());
        }

        http.end();
        return success;
    }
};

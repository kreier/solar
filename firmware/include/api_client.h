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

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "1.1.0-canary"
#endif

struct BufferedSample {
    uint32_t boot_count;
    int solar_mv;
    int lipo_mv;
    float temp_c;
    bool has_ina;
    float ch1_solar_v;
    float ch1_solar_ma;
    float ch1_solar_mw;
    float ch3_load_v;
    float ch3_load_ma;
    float ch3_load_mw;
    float ch3_load_res_ohm;
};

class ApiClient {
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

    static bool uploadTelemetry(const String &workerUrl, const String &deviceToken,
                                const SolarConfig &config, const AdcReadings &readings,
                                const Ina3221Readings &inaReadings, CycleTimer &timer,
                                const BufferedSample *batchSamples = nullptr, uint8_t batchCount = 0) {
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
        doc["power_mode"] = config.power_mode;
        doc["is_canary"] = config.is_canary ? 1 : 0;

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

        // INA3221 Sensor (CH1 Solar, CH3 Load)
        if (inaReadings.present) {
            JsonObject inaObj = doc["ina3221"].to<JsonObject>();

            JsonObject ch1 = inaObj["ch1_solar"].to<JsonObject>();
            ch1["voltage_v"] = serialized(String(inaReadings.ch1_solar_v, 3));
            ch1["current_ma"] = serialized(String(inaReadings.ch1_solar_ma, 2));
            ch1["power_mw"] = serialized(String(inaReadings.ch1_solar_mw, 2));

            JsonObject ch3 = inaObj["ch3_load"].to<JsonObject>();
            ch3["voltage_v"] = serialized(String(inaReadings.ch3_load_v, 3));
            ch3["current_ma"] = serialized(String(inaReadings.ch3_load_ma, 2));
            ch3["power_mw"] = serialized(String(inaReadings.ch3_load_mw, 2));
            ch3["resistance_ohm"] = serialized(String(inaReadings.ch3_load_res_ohm, 1));
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

                if (batchSamples[i].has_ina) {
                    JsonObject sIna = s["ina3221"].to<JsonObject>();
                    JsonObject bCh1 = sIna["ch1_solar"].to<JsonObject>();
                    bCh1["voltage_v"] = serialized(String(batchSamples[i].ch1_solar_v, 3));
                    bCh1["current_ma"] = serialized(String(batchSamples[i].ch1_solar_ma, 2));
                    bCh1["power_mw"] = serialized(String(batchSamples[i].ch1_solar_mw, 2));

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
            prevObj["upload_ms"] = prev.upload_ms;
            prevObj["total_cycle_ms"] = prev.total_cycle_ms;
            prevObj["http_code"] = prev.http_code;
        }

        // Current cycle partial benchmark
        JsonObject currObj = doc["current_cycle"].to<JsonObject>();
        currObj["measure_ms"] = timer.getMeasureDuration();
        currObj["wifi_connect_ms"] = timer.getWifiConnectDuration();
        currObj["ip_obtain_ms"] = timer.getIpObtainDuration();

        String jsonPayload;
        serializeJson(doc, jsonPayload);

        WiFiClientSecure client;
        client.setInsecure(); // Cloudflare edge TLS validation

        HTTPClient http;
        http.setTimeout(12000);

        if (!http.begin(client, endpoint)) {
            Serial.println(F("[API] Telemetry connection failed to begin"));
            timer.markUploadEnd(0);
            return false;
        }

        http.addHeader("Content-Type", "application/json");
        http.addHeader("Authorization", "Bearer " + deviceToken);

        Serial.printf("[API] Uploading telemetry to %s (%d bytes)...\n", endpoint.c_str(), jsonPayload.length());
        int httpCode = http.POST(jsonPayload);

        timer.markUploadEnd(httpCode);

        if (httpCode == 200 || httpCode == 201) {
            Serial.printf("[API] Telemetry accepted! Code: %d, Response: %s\n", httpCode, http.getString().c_str());
            http.end();
            return true;
        } else {
            String respBody = http.getString();
            Serial.printf("[API] Telemetry upload error (%d): %s\n", httpCode, respBody.c_str());
            http.end();
            return false;
        }
    }
};

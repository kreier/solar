#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include "app_config.h"

class OtaManager {
public:
    static bool checkForUpdate(SolarConfig &config, AppConfigManager &configMgr,
                              const String &currentVersion) {
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println(F("[OTA] Cannot check: WiFi not connected"));
            return false;
        }

#if defined(CONFIG_IDF_TARGET_ESP32S3) || defined(ARDUINO_ESP32S3_DEV)
        String chip = "esp32s3";
#elif defined(CONFIG_IDF_TARGET_ESP32C5) || defined(CONFIG_IDF_TARGET_ESP32C6) || defined(ARDUINO_ESP32C5_DEV) || defined(ARDUINO_ESP32C6_DEV)
        String chip = "esp32c5";
#else
        String chip = "esp32";
#endif

        String checkEndpoint = config.worker_url;
        if (checkEndpoint.endsWith("/")) checkEndpoint.remove(checkEndpoint.length() - 1);
        checkEndpoint += "/api/ota?station_id=" + String(config.station_id) + "&version=" + currentVersion + "&chip=" + chip;

        Serial.printf("[OTA] Checking update at: %s\n", checkEndpoint.c_str());

        WiFiClientSecure client;
        client.setInsecure();

        HTTPClient http;
        http.setTimeout(10000);

        if (!http.begin(client, checkEndpoint)) {
            Serial.println(F("[OTA] Failed to begin OTA check request"));
            return false;
        }

        int httpCode = http.GET();
        if (httpCode == 200) {
            String payload = http.getString();
            http.end();

            JsonDocument doc;
            DeserializationError err = deserializeJson(doc, payload);
            if (err) {
                Serial.printf("[OTA] JSON parse error: %s\n", err.c_str());
                return false;
            }

            // Sync dynamic configuration from server
            bool configChanged = false;
            if (doc["power_mode"].is<uint8_t>()) {
                uint8_t serverMode = doc["power_mode"].as<uint8_t>();
                if (serverMode != config.power_mode) {
                    Serial.printf("[OTA] Server updated power_mode: %u -> %u\n", config.power_mode, serverMode);
                    config.power_mode = serverMode;
                    configChanged = true;
                }
            }
            if (doc["enable_lipo"].is<int>()) {
                bool serverLipo = (doc["enable_lipo"].as<int>() == 1);
                if (serverLipo != config.enable_lipo) {
                    Serial.printf("[OTA] Server updated enable_lipo: %d -> %d\n", config.enable_lipo, serverLipo);
                    config.enable_lipo = serverLipo;
                    configChanged = true;
                }
            }
            if (configChanged) {
                configMgr.saveConfig(config);
            }

            bool updateAvailable = doc["update_available"] | false;
            const char *targetVersion = doc["target_version"] | "";
            const char *binUrl = doc["url"] | "";

            if (updateAvailable && strlen(binUrl) > 0) {
                if (compareSemVer(String(targetVersion), currentVersion) <= 0) {
                    Serial.printf("[OTA] Ignoring equal or older version offer (%s <= %s)\n",
                                  targetVersion, currentVersion.c_str());
                    return false;
                }

                Serial.printf("[OTA] New firmware detected! Version: %s, URL: %s\n",
                              targetVersion, binUrl);
                return performUpdate(binUrl);
            } else {
                Serial.printf("[OTA] Firmware is up to date (%s)\n", currentVersion.c_str());
            }
        } else {
            Serial.printf("[OTA] Check response HTTP %d\n", httpCode);
            http.end();
        }

        return false;
    }

    static bool checkForUpdate(const String &workerUrl, const String &stationId,
                              const String &currentVersion) {
        SolarConfig dummy;
        AppConfigManager dummyMgr;
        strlcpy(dummy.worker_url, workerUrl.c_str(), sizeof(dummy.worker_url));
        strlcpy(dummy.station_id, stationId.c_str(), sizeof(dummy.station_id));
        dummy.power_mode = 0;
        dummy.enable_lipo = false;
        return checkForUpdate(dummy, dummyMgr, currentVersion);
    }

    static bool performUpdate(const String &binaryUrl) {
        WiFiClientSecure otaClient;
        otaClient.setInsecure();

        httpUpdate.rebootOnUpdate(true);
        Serial.println(F("[OTA] Downloading and flashing to inactive OTA partition..."));

        t_httpUpdate_return ret = httpUpdate.update(otaClient, binaryUrl);
        switch (ret) {
            case HTTP_UPDATE_FAILED:
                Serial.printf("[OTA] Update failed (%d): %s\n",
                              httpUpdate.getLastError(), httpUpdate.getLastErrorString().c_str());
                return false;
            case HTTP_UPDATE_NO_UPDATES:
                Serial.println(F("[OTA] No updates available"));
                return false;
            case HTTP_UPDATE_OK:
                Serial.println(F("[OTA] Flash SUCCESS! Rebooting into new firmware..."));
                return true;
        }
        return false;
    }

    static int compareSemVer(const String &v1, const String &v2) {
        int maj1 = 0, min1 = 0, pat1 = 0;
        int maj2 = 0, min2 = 0, pat2 = 0;
        const char *s1 = v1.c_str();
        const char *s2 = v2.c_str();
        if (s1[0] == 'v' || s1[0] == 'V') s1++;
        if (s2[0] == 'v' || s2[0] == 'V') s2++;
        sscanf(s1, "%d.%d.%d", &maj1, &min1, &pat1);
        sscanf(s2, "%d.%d.%d", &maj2, &min2, &pat2);
        if (maj1 != maj2) return maj1 - maj2;
        if (min1 != min2) return min1 - min2;
        return pat1 - pat2;
    }
};

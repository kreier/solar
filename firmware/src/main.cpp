#include <Arduino.h>
#include <WiFi.h>
#include "adc_reader.h"
#include "cycle_timer.h"
#include "app_config.h"
#include "api_client.h"
#include "ota_manager.h"
#include "sleep_manager.h"
#include "double_reset.h"
#include "portal_manager.h"

// Define RTC memory variables
RTC_DATA_ATTR CycleBenchmark rtc_prev_cycle = {0, 0, 0, 0, 0, 0, 0, false};
RTC_DATA_ATTR int rtc_boot_count = 0;

AdcReader adc;
AppConfigManager configMgr;
SolarConfig config;
CycleTimer timer;
DoubleResetDetector drd(2000); // 2-second double reset window

// Forward declarations
bool connectToWiFi();
void checkSerialConfiguration();

void setup() {
    Serial.begin(115200);
    delay(300);

    Serial.println();
    Serial.println(F("=================================================="));
    Serial.println(F("   Solar ESP32 Telemetry Monitor v" FIRMWARE_VERSION));
    Serial.println(F("=================================================="));

    adc.begin();
    configMgr.loadConfig(config);

    // 1. Check for Double Reset (reset button pressed twice within 2 seconds)
    bool isDoubleReset = drd.detect();

    // 2. If double reset pressed OR Wi-Fi is completely unconfigured, launch Soft-AP Setup Portal (120s timeout)
    if (isDoubleReset || !config.is_configured || strlen(config.wifi_ssid) == 0) {
        if (isDoubleReset) {
            Serial.println(F("[Boot] Double reset detected: Launching Soft-AP configuration portal..."));
        } else {
            Serial.println(F("[Boot] Wi-Fi not configured: Launching Soft-AP configuration portal..."));
        }
        PortalManager::runPortal(config, configMgr, adc, 120);
    }
}

bool connectToWiFi() {
    if (strlen(config.wifi_ssid) == 0) {
        Serial.println(F("[WiFi] No SSID configured, skipping connection"));
        return false;
    }

    timer.markWifiConnectStart();
    Serial.printf("[WiFi] Connecting to '%s'...\n", config.wifi_ssid);

    WiFi.mode(WIFI_STA);
    WiFi.begin(config.wifi_ssid, config.wifi_pass);

    unsigned long startMs = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < 15000) {
        delay(250);
        Serial.print('.');
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        timer.markWifiConnected();
        Serial.printf("[WiFi] Connected! Waiting for IP...\n");

        unsigned long ipStartMs = millis();
        while (WiFi.localIP() == INADDR_NONE && (millis() - ipStartMs) < 5000) {
            delay(100);
        }
        timer.markIpObtained();

        Serial.printf("[WiFi] IP acquired: %s (RSSI: %d dBm)\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI());
        return true;
    }

    // Try backup network if primary fails
    if (strlen(config.backup_ssid) > 0) {
        Serial.printf("[WiFi] Primary failed. Trying backup '%s'...\n", config.backup_ssid);
        WiFi.disconnect();
        WiFi.begin(config.backup_ssid, config.backup_pass);

        startMs = millis();
        while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < 15000) {
            delay(250);
            Serial.print('.');
        }
        Serial.println();

        if (WiFi.status() == WL_CONNECTED) {
            timer.markWifiConnected();
            while (WiFi.localIP() == INADDR_NONE && (millis() - startMs) < 5000) {
                delay(100);
            }
            timer.markIpObtained();
            Serial.printf("[WiFi] Backup connected! IP: %s\n", WiFi.localIP().toString().c_str());
            return true;
        }
    }

    Serial.println(F("[WiFi] Connection timed out."));
    return false;
}

void checkSerialConfiguration() {
    if (Serial.available()) {
        String line = Serial.readStringUntil('\n');
        line.trim();
        if (line.startsWith("SET ")) {
            int idx;
            if ((idx = line.indexOf("SSID=")) != -1) {
                int endIdx = line.indexOf(' ', idx);
                String val = (endIdx == -1) ? line.substring(idx + 5) : line.substring(idx + 5, endIdx);
                strlcpy(config.wifi_ssid, val.c_str(), sizeof(config.wifi_ssid));
            }
            if ((idx = line.indexOf("PASS=")) != -1) {
                int endIdx = line.indexOf(' ', idx);
                String val = (endIdx == -1) ? line.substring(idx + 5) : line.substring(idx + 5, endIdx);
                strlcpy(config.wifi_pass, val.c_str(), sizeof(config.wifi_pass));
            }
            if ((idx = line.indexOf("STATION=")) != -1) {
                int endIdx = line.indexOf(' ', idx);
                String val = (endIdx == -1) ? line.substring(idx + 8) : line.substring(idx + 8, endIdx);
                strlcpy(config.station_id, val.c_str(), sizeof(config.station_id));
            }
            if ((idx = line.indexOf("LOCATION=")) != -1) {
                int endIdx = line.indexOf(' ', idx);
                String val = (endIdx == -1) ? line.substring(idx + 9) : line.substring(idx + 9, endIdx);
                strlcpy(config.location, val.c_str(), sizeof(config.location));
            }
            if ((idx = line.indexOf("MASTER=")) != -1) {
                int endIdx = line.indexOf(' ', idx);
                String val = (endIdx == -1) ? line.substring(idx + 7) : line.substring(idx + 7, endIdx);
                strlcpy(config.master_phrase, val.c_str(), sizeof(config.master_phrase));
            }
            config.is_configured = true;
            configMgr.saveConfig(config);
            Serial.println(F("[Config] Configuration updated and saved to NVS."));
        } else if (line.equalsIgnoreCase("PORTAL")) {
            Serial.println(F("[Config] Launching Soft-AP configuration portal via serial command..."));
            PortalManager::runPortal(config, configMgr, adc, 120);
        } else if (line.equalsIgnoreCase("STATUS")) {
            Serial.printf("[Status] Station: %s, Location: %s, HasToken: %d, SSID: %s\n",
                          config.station_id, config.location, configMgr.hasDeviceToken(), config.wifi_ssid);
        }
    }
}

void runCycle() {
    timer.startCycle();

    Serial.println(F("\n--------------------------------------------------"));
    Serial.printf("[Cycle #%d] Starting measurement & telemetry cycle\n", timer.getBootCount());
    Serial.println(F("--------------------------------------------------"));

    // 1. Measure ADC sensors with 100x multisampling and nonlinearity compensation
    timer.markMeasureStart();
    AdcReadings readings = adc.readSensors(config.pin_temp, config.pin_solar, config.pin_lipo);
    timer.markMeasureEnd();

    Serial.printf("[Sensors] ADC Samples: Pin%d=%d, Pin%d=%d, Pin%d=%d\n",
                  config.pin_temp, readings.raw_pin32,
                  config.pin_solar, readings.raw_pin34,
                  config.pin_lipo, readings.raw_pin35);
    Serial.printf("[Sensors] Local Temp:  %.1f °C (%d mV)\n", readings.temp_c, readings.temp_mv);
    Serial.printf("[Sensors] Solar Panel: %.2f V (%d mV)\n", readings.solar_v, readings.solar_mv);
    Serial.printf("[Sensors] LiPo Battery:%.2f V (%d mV)\n", readings.lipo_v, readings.lipo_mv);
    Serial.printf("[Benchmark] Measure duration: %u ms\n", timer.getMeasureDuration());

    // Print previous cycle benchmark if present
    const CycleBenchmark &prev = timer.getPreviousCycle();
    if (prev.valid) {
        Serial.printf("[Prev Cycle] Total: %u ms | Measure: %u ms | WiFi: %u ms | IP: %u ms | Upload: %u ms | HTTP: %d\n",
                      prev.total_cycle_ms, prev.measure_ms, prev.wifi_connect_ms,
                      prev.ip_obtain_ms, prev.upload_ms, prev.http_code);
    }

    // Maintain 2-second double reset window
    drd.loop();

    // Check for any serial input before connecting
    checkSerialConfiguration();

    // 2. Connect to Wi-Fi
    bool online = connectToWiFi();

    if (online) {
        // 3. Provisioning: If device token is missing, perform initial registration using MASTER_PHRASE
        if (!configMgr.hasDeviceToken()) {
            Serial.println(F("[Auth] No device token in NVS. Initiating station registration..."));
            if (strlen(config.master_phrase) > 0) {
                String newToken;
                bool ok = ApiClient::registerStation(config.worker_url, config.station_id,
                                                    config.location, config.master_phrase,
                                                    newToken);
                if (ok && newToken.length() > 0) {
                    configMgr.saveDeviceToken(newToken);
                    configMgr.eraseMasterPhrase(config); // Zero-Trust: Master phrase erased
                }
            } else {
                Serial.println(F("[Auth] WARNING: MASTER_PHRASE is empty. Set it via portal or serial."));
            }
        }

        // 4. Telemetry Upload (Authenticated with Bearer device_token)
        if (configMgr.hasDeviceToken()) {
            String token = configMgr.getDeviceToken();
            ApiClient::uploadTelemetry(config.worker_url, token, config, readings, timer);

            // 5. Check for OTA update periodically (e.g. every 6 cycles = ~1 hour)
            if ((timer.getBootCount() % 6) == 1) {
                OtaManager::checkForUpdate(config.worker_url, config.station_id, FIRMWARE_VERSION);
            }
        } else {
            Serial.println(F("[Auth] Station not registered yet, skipping telemetry upload"));
        }
    } else {
        Serial.println(F("[WiFi] Offline this cycle, skipping telemetry upload"));
    }

    // Ensure reset window flag is cleared before sleep
    drd.clear();

    // 6. Record this cycle's benchmark in RTC memory for the NEXT cycle's payload
    timer.finalizeAndSaveForNextCycle();

    // 7. Enter Light Sleep for 10 minutes (600 seconds)
    // Execution will resume after 600 seconds right into loop()
    SleepManager::enterLightSleep(600);
}

void loop() {
    runCycle();
}

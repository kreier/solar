#include <Arduino.h>
#include <WiFi.h>
#include "adc_reader.h"
#include "ina3221_reader.h"
#include "cycle_timer.h"
#include "app_config.h"
#include "api_client.h"
#include "ota_manager.h"
#include "sleep_manager.h"
#include "double_reset.h"
#include "portal_manager.h"

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "1.1.0-canary"
#endif

#ifndef TARGET_BOARD
#define TARGET_BOARD "ESP32"
#endif

// RTC Memory Preserved across Deep Sleep
RTC_DATA_ATTR CycleBenchmark rtc_prev_cycle = {0, 0, 0, 0, 0, 0, 0, false};
RTC_DATA_ATTR int rtc_boot_count = 0;
RTC_DATA_ATTR BufferedSample rtc_samples[6];
RTC_DATA_ATTR uint8_t rtc_sample_count = 0;
RTC_DATA_ATTR uint8_t rtc_bssid[6] = {0};
RTC_DATA_ATTR int32_t rtc_channel = 0;

AdcReader adc;
Ina3221Reader ina;
AppConfigManager configMgr;
SolarConfig config;
CycleTimer timer;
DoubleResetDetector drd(2000); // 2-second double reset window

// Forward declarations
bool connectToWiFi();
void checkSerialConfiguration();

void setup() {
    Serial.begin(115200);
    delay(150);

    Serial.println();
    Serial.println(F("=================================================="));
    Serial.printf("   Solar Telemetry Monitor v%s (%s)\n", FIRMWARE_VERSION, TARGET_BOARD);
    Serial.println(F("=================================================="));

    adc.begin();
    configMgr.loadConfig(config);

    if (config.has_ina3221) {
        bool inaOk = ina.begin(config.pin_sda, config.pin_scl, config.ina_addr, config.ina_r_shunt);
        if (inaOk) {
            Serial.printf("[INA3221] Initialized on SDA:%d SCL:%d (0x%02X, Shunt: %.3f Ohm)\n",
                          config.pin_sda, config.pin_scl, config.ina_addr, config.ina_r_shunt);
        } else {
            Serial.println(F("[INA3221] Device not found on I2C bus"));
        }
    }

    // Check for Double Reset
    bool isDoubleReset = drd.detect();

    // If double reset pressed OR Wi-Fi is completely unconfigured, launch Soft-AP Setup Portal
    if (isDoubleReset || !config.is_configured || strlen(config.wifi_ssid) == 0) {
        if (isDoubleReset) {
            Serial.println(F("[Boot] Double reset detected: Launching Soft-AP configuration portal..."));
        } else {
            Serial.println(F("[Boot] Wi-Fi not configured: Launching Soft-AP configuration portal..."));
        }
        PortalManager::runPortal(config, configMgr, adc, ina, 120);
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

    // Fast Connection Optimization: Use cached BSSID and Channel from RTC memory
    if (rtc_channel > 0 && rtc_bssid[0] != 0) {
        Serial.printf("[WiFi] Fast-connect with cached BSSID (%02X:%02X:%02X:%02X:%02X:%02X, CH %d)\n",
                      rtc_bssid[0], rtc_bssid[1], rtc_bssid[2], rtc_bssid[3], rtc_bssid[4], rtc_bssid[5], rtc_channel);
        WiFi.begin(config.wifi_ssid, config.wifi_pass, rtc_channel, rtc_bssid, true);
    } else {
        WiFi.begin(config.wifi_ssid, config.wifi_pass);
    }

    unsigned long startMs = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < 12000) {
        delay(150);
        Serial.print('.');
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        timer.markWifiConnected();
        Serial.printf("[WiFi] Connected! Waiting for IP...\n");

        unsigned long ipStartMs = millis();
        while (WiFi.localIP() == INADDR_NONE && (millis() - ipStartMs) < 4000) {
            delay(50);
        }
        timer.markIpObtained();

        // Save active Channel and BSSID for next wake-up cycle
        rtc_channel = WiFi.channel();
        const uint8_t *currBssid = WiFi.BSSID();
        if (currBssid) {
            memcpy(rtc_bssid, currBssid, 6);
        }

        Serial.printf("[WiFi] IP acquired: %s (RSSI: %d dBm, Channel: %d)\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI(), rtc_channel);
        return true;
    }

    // Try backup network if primary fails
    if (strlen(config.backup_ssid) > 0) {
        Serial.printf("[WiFi] Primary failed. Trying backup '%s'...\n", config.backup_ssid);
        WiFi.disconnect();
        WiFi.begin(config.backup_ssid, config.backup_pass);

        startMs = millis();
        while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < 12000) {
            delay(150);
            Serial.print('.');
        }
        Serial.println();

        if (WiFi.status() == WL_CONNECTED) {
            timer.markWifiConnected();
            while (WiFi.localIP() == INADDR_NONE && (millis() - startMs) < 4000) {
                delay(50);
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
            if ((idx = line.indexOf("POWER_MODE=")) != -1) {
                int endIdx = line.indexOf(' ', idx);
                String val = (endIdx == -1) ? line.substring(idx + 11) : line.substring(idx + 11, endIdx);
                config.power_mode = val.toInt();
            }
            if ((idx = line.indexOf("CANARY=")) != -1) {
                int endIdx = line.indexOf(' ', idx);
                String val = (endIdx == -1) ? line.substring(idx + 7) : line.substring(idx + 7, endIdx);
                config.is_canary = (val.toInt() != 0);
            }
            config.is_configured = true;
            configMgr.saveConfig(config);
            Serial.println(F("[Config] Configuration updated and saved to NVS."));
        } else if (line.equalsIgnoreCase("PORTAL")) {
            Serial.println(F("[Config] Launching Soft-AP configuration portal via serial command..."));
            PortalManager::runPortal(config, configMgr, adc, ina, 120);
        } else if (line.equalsIgnoreCase("OTA")) {
            Serial.println(F("[OTA] Manual OTA update check requested via serial..."));
            OtaManager::checkForUpdate(config.worker_url, config.station_id, FIRMWARE_VERSION);
        } else if (line.equalsIgnoreCase("STATUS")) {
            Serial.printf("[Status] Station: %s, PowerMode: %d, Canary: %d, SSID: %s, HasToken: %d\n",
                          config.station_id, config.power_mode, config.is_canary, config.wifi_ssid, configMgr.hasDeviceToken());
        }
    }
}

void runCycle() {
    timer.startCycle();

    Serial.println(F("\n--------------------------------------------------"));
    Serial.printf("[Cycle #%d] Starting measurement & telemetry cycle (Mode: %s)\n",
                  timer.getBootCount(), config.power_mode == 0 ? "Minimal Energy (1h Batch)" : "Balanced");
    Serial.println(F("--------------------------------------------------"));

    // 1. Measure ADC sensors with 100x multisampling and configurable calibration
    timer.markMeasureStart();
    AdcReadings readings = adc.readSensors(
        config.pin_temp, config.pin_solar, config.pin_lipo,
        config.cal_temp_factor, config.cal_temp_offset,
        config.cal_solar_factor, config.cal_solar_offset,
        config.cal_lipo_factor, config.cal_lipo_offset
    );

    // Read INA3221 if enabled
    Ina3221Readings inaData;
    memset(&inaData, 0, sizeof(inaData));
    if (config.has_ina3221) {
        inaData = ina.read();
    }
    timer.markMeasureEnd();

    Serial.printf("[Sensors] Local Temp:  %.1f °C (%d mV)\n", readings.temp_c, readings.temp_mv);
    Serial.printf("[Sensors] Solar Panel: %.2f V (%d mV)\n", readings.solar_v, readings.solar_mv);
    Serial.printf("[Sensors] LiPo Battery:%.2f V (%d mV)\n", readings.lipo_v, readings.lipo_mv);
    if (inaData.present) {
        Serial.printf("[INA3221] CH1 Solar: %.3f V, %.1f mA, %.1f mW\n",
                      inaData.ch1_solar_v, inaData.ch1_solar_ma, inaData.ch1_solar_mw);
        Serial.printf("[INA3221] CH3 Load:  %.3f V, %.1f mA, %.1f mW (Res: %.1f Ohm)\n",
                      inaData.ch3_load_v, inaData.ch3_load_ma, inaData.ch3_load_mw, inaData.ch3_load_res_ohm);
    }
    Serial.printf("[Benchmark] Measure duration: %u ms\n", timer.getMeasureDuration());

    // Maintain 2-second double reset window
    drd.loop();
    checkSerialConfiguration();

    // 2. Power Saving Strategy Decision
    // Mode 0: Minimal Energy Consumption (Store reading to RTC, upload only every 6 cycles = 1 hour)
    if (config.power_mode == 0) {
        // Save reading to RTC buffer
        if (rtc_sample_count < 6) {
            rtc_samples[rtc_sample_count].boot_count = timer.getBootCount();
            rtc_samples[rtc_sample_count].solar_mv   = readings.solar_mv;
            rtc_samples[rtc_sample_count].lipo_mv    = readings.lipo_mv;
            rtc_samples[rtc_sample_count].temp_c     = readings.temp_c;
            rtc_samples[rtc_sample_count].has_ina    = inaData.present;
            if (inaData.present) {
                rtc_samples[rtc_sample_count].ch1_solar_v      = inaData.ch1_solar_v;
                rtc_samples[rtc_sample_count].ch1_solar_ma     = inaData.ch1_solar_ma;
                rtc_samples[rtc_sample_count].ch1_solar_mw     = inaData.ch1_solar_mw;
                rtc_samples[rtc_sample_count].ch3_load_v       = inaData.ch3_load_v;
                rtc_samples[rtc_sample_count].ch3_load_ma      = inaData.ch3_load_ma;
                rtc_samples[rtc_sample_count].ch3_load_mw      = inaData.ch3_load_mw;
                rtc_samples[rtc_sample_count].ch3_load_res_ohm = inaData.ch3_load_res_ohm;
            }
            rtc_sample_count++;
        }

        // If less than 6 samples accumulated (1 hour not yet reached), go directly to Deep Sleep!
        if (rtc_sample_count < 6) {
            Serial.printf("[Power] Minimal Energy: Sample #%d recorded in RTC memory. Entering DEEP SLEEP immediately...\n", rtc_sample_count);
            drd.clear();
            timer.finalizeAndSaveForNextCycle();
            SleepManager::enterDeepSleep(600);
            return;
        }

        Serial.println(F("[Power] 1-Hour accumulation reached (6 samples in RTC). Initiating batch telemetry upload..."));
    }

    // 3. Wi-Fi Connection Phase (Hourly in Mode 0, or Every Cycle in Mode 1)
    bool online = connectToWiFi();

    if (online) {
        // Check Zero-Trust Provisioning
        if (!configMgr.hasDeviceToken()) {
            Serial.println(F("[Auth] No device token in NVS. Initiating station registration..."));
            if (strlen(config.master_phrase) > 0) {
                String newToken;
                bool ok = ApiClient::registerStation(config.worker_url, config.station_id,
                                                    config.location, config.master_phrase,
                                                    config.is_canary, newToken);
                if (ok && newToken.length() > 0) {
                    configMgr.saveDeviceToken(newToken);
                    configMgr.eraseMasterPhrase(config); // Zero-Trust: Master phrase erased
                }
            } else {
                Serial.println(F("[Auth] WARNING: MASTER_PHRASE is empty. Set it via portal or serial."));
            }
        }

        // Telemetry Upload (Authenticated with Bearer device_token)
        if (configMgr.hasDeviceToken()) {
            String token = configMgr.getDeviceToken();
            ApiClient::uploadTelemetry(config.worker_url, token, config, readings, inaData, timer,
                                      (config.power_mode == 0) ? rtc_samples : nullptr,
                                      (config.power_mode == 0) ? rtc_sample_count : 0);

            // Daily automatic OTA check (every 144 cycles = ~24 hours, plus 1st cycle)
            if ((timer.getBootCount() % 144) == 1) {
                Serial.println(F("[OTA] Checking for daily firmware update..."));
                OtaManager::checkForUpdate(config.worker_url, config.station_id, FIRMWARE_VERSION);
            }
        } else {
            Serial.println(F("[Auth] Station not registered yet, skipping telemetry upload"));
        }
    } else {
        Serial.println(F("[WiFi] Offline this cycle, telemetry cached in RTC memory"));
    }

    // Reset RTC sample count after upload attempt
    if (config.power_mode == 0) {
        rtc_sample_count = 0;
    }

    drd.clear();
    timer.finalizeAndSaveForNextCycle();

    // 4. Enter Sleep
    if (config.power_mode == 0) {
        Serial.println(F("[Power] Entering DEEP SLEEP for 10 minutes (600s)..."));
        SleepManager::enterDeepSleep(600);
    } else {
        Serial.println(F("[Power] Entering LIGHT SLEEP for 10 minutes (600s)..."));
        SleepManager::enterLightSleep(600);
    }
}

void loop() {
    runCycle();
}

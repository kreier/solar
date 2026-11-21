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
#include "monitor_manager.h"

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "1.1.5"
#endif

#ifndef TARGET_BOARD
#define TARGET_BOARD "ESP32"
#endif

// RTC Memory Preserved across Deep Sleep
RTC_DATA_ATTR CycleBenchmark rtc_prev_cycle = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, false};
RTC_DATA_ATTR int rtc_boot_count = 0;
RTC_DATA_ATTR int rtc_upload_count = 0;
RTC_DATA_ATTR BufferedSample rtc_samples[6];
RTC_DATA_ATTR uint8_t rtc_sample_count = 0;
RTC_DATA_ATTR uint8_t rtc_bssid[6] = {0};
RTC_DATA_ATTR int32_t rtc_channel = 0;

// 10-minute rolling accumulator for Active (1), Verbose (2), and Monitor (3) modes
uint8_t active_sample_count = 0;
float active_temp_sum = 0.0f;
int32_t active_solar_sum = 0;
int32_t active_lipo_sum = 0;
float active_ch1_v_sum = 0.0f;
float active_ch1_ma_sum = 0.0f;
float active_ch1_mw_sum = 0.0f;
float active_ch3_v_sum = 0.0f;
float active_ch3_ma_sum = 0.0f;
float active_ch3_mw_sum = 0.0f;
float active_ch3_res_sum = 0.0f;

AdcReader adc;
Ina3221Reader ina;
AppConfigManager configMgr;
SolarConfig config;
CycleTimer timer;
DoubleResetDetector drd(3500); // 3.5-second double reset window for reliable manual portal entry

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

    // Apply fixed IP if configured
    if (config.use_static_ip && strlen(config.static_ip) > 0) {
        IPAddress ip, gw, sn, dns;
        if (ip.fromString(config.static_ip) && gw.fromString(config.static_gateway) && sn.fromString(config.static_subnet)) {
            dns.fromString(strlen(config.static_dns) > 0 ? config.static_dns : "1.1.1.1");
            WiFi.config(ip, gw, sn, dns);
            Serial.printf("[WiFi] Static IP configured: %s (GW: %s)\n", config.static_ip, config.static_gateway);
        }
    }

    // Fast Connection Optimization: Use cached BSSID and Channel from RTC memory
    if (rtc_channel > 0 && rtc_bssid[0] != 0) {
        Serial.printf("[WiFi] Fast-connect with cached BSSID (%02X:%02X:%02X:%02X:%02X:%02X, CH %ld)\n",
                      rtc_bssid[0], rtc_bssid[1], rtc_bssid[2], rtc_bssid[3], rtc_bssid[4], rtc_bssid[5], (long)rtc_channel);
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

        Serial.printf("[WiFi] IP acquired: %s (RSSI: %d dBm, Channel: %ld)\n",
                      WiFi.localIP().toString().c_str(), WiFi.RSSI(), (long)rtc_channel);
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
            OtaManager::checkForUpdate(config, configMgr, FIRMWARE_VERSION);
        } else if (line.equalsIgnoreCase("STATUS")) {
            Serial.printf("[Status] Station: %s, PowerMode: %d, Canary: %d, SSID: %s, HasToken: %d\n",
                          config.station_id, config.power_mode, config.is_canary, config.wifi_ssid, configMgr.hasDeviceToken());
        }
    }
}

void runCycle() {
    timer.startCycle();

    const char *modeNames[] = {
        "1. Low Power (Deep Sleep)",
        "2. Active (Light Sleep)",
        "3. Verbose",
        "4. Monitor"
    };
    const char *modeStr = (config.power_mode <= 3) ? modeNames[config.power_mode] : "Custom";

    bool isInitialCycle = (timer.getBootCount() == 1 || rtc_upload_count == 0);
    bool isVerbose = (config.power_mode == 2 || config.power_mode == 3 || config.power_mode == 0 || active_sample_count == 0 || isInitialCycle);

    if (isVerbose) {
        Serial.println(F("\n--------------------------------------------------"));
        Serial.printf("[Cycle #%d] Starting measurement cycle (Mode: %s%s)\n",
                      timer.getBootCount(), modeStr, isInitialCycle ? " - Reset Initial" : "");
        Serial.println(F("--------------------------------------------------"));
    }

    // 1. Measure ADC sensors with modern adc_cali_raw_to_voltage and configurable factors
    timer.markMeasureStart();
    AdcReadings readings = adc.readSensors(
        config.pin_temp, config.pin_solar, config.pin_lipo,
        config.temp_source, config.enable_solar, config.enable_lipo,
        config.cal_temp_factor, config.cal_solar_factor, config.cal_lipo_factor
    );

    // Read INA3221 if enabled
    Ina3221Readings inaData;
    memset(&inaData, 0, sizeof(inaData));
    if (config.has_ina3221) {
        inaData = ina.read();
        if (inaData.present && config.enable_solar) {
            readings.solar_v = inaData.ch1_solar_v;
            readings.solar_mv = static_cast<int>(inaData.ch1_solar_v * 1000.0f);
        }
    }
    timer.markMeasureEnd();

    if (isVerbose) {
        Serial.printf("[Sensors] Local Temp:  %.1f °C (%d mV) [%s]\n",
                      readings.temp_c, readings.temp_mv, config.temp_source == 1 ? "Internal Sensor" : "External Pin");
        if (config.enable_solar) {
            Serial.printf("[Sensors] Solar Panel: %.2f V (%d mV) [%s]\n",
                          readings.solar_v, readings.solar_mv, (config.has_ina3221 && inaData.present) ? "INA3221 CH1" : "ADC Pin");
        } else {
            Serial.println(F("[Sensors] Solar Panel: Disabled in configuration"));
        }
        if (config.enable_lipo) {
            Serial.printf("[Sensors] LiPo Battery:%.2f V (%d mV) [Factor x%.2f]\n",
                          readings.lipo_v, readings.lipo_mv, config.cal_lipo_factor);
        } else {
            Serial.println(F("[Sensors] LiPo Battery:Disabled in configuration"));
        }
        if (inaData.present) {
            Serial.printf("[INA3221] CH1 Solar: %.3f V, %.1f mA, %.1f mW\n",
                          inaData.ch1_solar_v, inaData.ch1_solar_ma, inaData.ch1_solar_mw);
            Serial.printf("[INA3221] CH3 Load:  %.3f V, %.1f mA, %.1f mW (Res: %.1f Ohm)\n",
                          inaData.ch3_load_v, inaData.ch3_load_ma, inaData.ch3_load_mw, inaData.ch3_load_res_ohm);
        }
        Serial.printf("[Benchmark] Measure duration: %lu ms\n", (unsigned long)timer.getMeasureDuration());
    }

    // Check serial configuration commands
    checkSerialConfiguration();

    // 2. Power Saving & Operating Mode Decision
    // ==========================================

    // Category 1: Low Power Mode (Deep Sleep, 10m RTC sample, 1h batch upload, 24h OTA)
    if (config.power_mode == 0) {
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

        // If fewer than 6 samples accumulated and not initial cycle after reset, enter Deep Sleep immediately
        if (rtc_sample_count < 6 && !isInitialCycle) {
            Serial.printf("[Power] Low Power: Sample #%d/6 recorded in RTC memory. Entering DEEP SLEEP (10m)...\n", rtc_sample_count);
            timer.finalizeAndSaveForNextCycle();
            SleepManager::enterDeepSleep(600);
            return;
        }

        if (isInitialCycle) {
            Serial.println(F("[Power] Low Power: Initial reset cycle, transmitting immediate telemetry..."));
        } else {
            Serial.println(F("[Power] Low Power: 1-Hour accumulation reached (6 samples in RTC). Initiating batch upload..."));
        }
    }

    // Categories 2, 3, 4: Active (1), Verbose (2), Monitor (3)
    // 1-minute measurements, averaged into a 10-minute slot
    else {
        active_sample_count++;
        active_temp_sum += readings.temp_c;
        active_solar_sum += readings.solar_mv;
        active_lipo_sum += readings.lipo_mv;
        if (inaData.present) {
            active_ch1_v_sum += inaData.ch1_solar_v;
            active_ch1_ma_sum += inaData.ch1_solar_ma;
            active_ch1_mw_sum += inaData.ch1_solar_mw;
            active_ch3_v_sum += inaData.ch3_load_v;
            active_ch3_ma_sum += inaData.ch3_load_ma;
            active_ch3_mw_sum += inaData.ch3_load_mw;
            active_ch3_res_sum += inaData.ch3_load_res_ohm;
        }

        // If fewer than 10 samples (10 minutes not reached) and not initial cycle after reset, return to Light Sleep
        if (active_sample_count < 10 && !isInitialCycle) {
            if (config.power_mode == 2 || config.power_mode == 3) {
                Serial.printf("[Power] %s: Sample #%d/10 recorded (Temp: %.1fC, Sol: %dmV, Bat: %dmV). Sleeping 60s...\n",
                              (config.power_mode == 3) ? "Monitor" : "Verbose",
                              active_sample_count, readings.temp_c, readings.solar_mv, readings.lipo_mv);
            }
            timer.finalizeAndSaveForNextCycle();
            SleepManager::enterLightSleep(60);
            return;
        }

        // 10 samples reached (or initial reset cycle): calculate average
        if (isInitialCycle) {
            Serial.println(F("[Power] Post-reset initial cycle: Submitting current telemetry immediately..."));
        } else {
            Serial.printf("[Power] %s: 10-minute average computed (%d samples). Initiating telemetry upload...\n",
                          modeStr, active_sample_count);
        }

        readings.temp_c = active_temp_sum / (float)active_sample_count;
        readings.temp_mv = static_cast<int>(readings.temp_c * 10.0f);
        readings.solar_mv = active_solar_sum / active_sample_count;
        readings.solar_v = readings.solar_mv / 1000.0f;
        readings.lipo_mv = active_lipo_sum / active_sample_count;
        readings.lipo_v = readings.lipo_mv / 1000.0f;

        if (inaData.present) {
            inaData.ch1_solar_v = active_ch1_v_sum / (float)active_sample_count;
            inaData.ch1_solar_ma = active_ch1_ma_sum / (float)active_sample_count;
            inaData.ch1_solar_mw = active_ch1_mw_sum / (float)active_sample_count;
            inaData.ch3_load_v = active_ch3_v_sum / (float)active_sample_count;
            inaData.ch3_load_ma = active_ch3_ma_sum / (float)active_sample_count;
            inaData.ch3_load_mw = active_ch3_mw_sum / (float)active_sample_count;
            inaData.ch3_load_res_ohm = active_ch3_res_sum / (float)active_sample_count;
        }

        // Reset accumulators
        active_sample_count = 0;
        active_temp_sum = 0.0f;
        active_solar_sum = 0;
        active_lipo_sum = 0;
        active_ch1_v_sum = 0.0f;
        active_ch1_ma_sum = 0.0f;
        active_ch1_mw_sum = 0.0f;
        active_ch3_v_sum = 0.0f;
        active_ch3_ma_sum = 0.0f;
        active_ch3_mw_sum = 0.0f;
        active_ch3_res_sum = 0.0f;
    }

    // Category 4 (Monitor Mode): Run Wi-Fi Channel Occupancy & BLE Scan
    MonitorMetrics monitorMetrics;
    memset(&monitorMetrics, 0, sizeof(monitorMetrics));
    if (config.power_mode == 3) {
        monitorMetrics = MonitorManager::performScan(13);
    }

    // 3. Wi-Fi Connection Phase
    bool online = connectToWiFi();

    if (online) {
        // Zero-Trust Provisioning
        if (!configMgr.hasDeviceToken()) {
            Serial.println(F("[Auth] No device token in NVS. Initiating station registration..."));
            if (strlen(config.master_phrase) > 0) {
                String newToken;
                bool ok = ApiClient::registerStation(config.worker_url, config.station_id,
                                                    config.location, config.master_phrase,
                                                    config.is_canary, newToken);
                if (ok && newToken.length() > 0) {
                    configMgr.saveDeviceToken(newToken);
                    configMgr.eraseMasterPhrase(config);
                }
            } else {
                Serial.println(F("[Auth] WARNING: MASTER_PHRASE is empty. Set it via portal or serial."));
            }
        }

        // Telemetry Upload
        if (configMgr.hasDeviceToken()) {
            String token = configMgr.getDeviceToken();
            ApiClient::uploadTelemetry(config.worker_url, token, config, readings, inaData, timer,
                                      (config.power_mode == 0) ? rtc_samples : nullptr,
                                      (config.power_mode == 0) ? rtc_sample_count : 0,
                                      (config.power_mode == 3) ? &monitorMetrics : nullptr);

            // OTA Check: Immediately after reset, daily in Low Power (every 24 uploads = 24h), hourly in Active/Verbose/Monitor (every 6 uploads = 60m)
            rtc_upload_count++;
            bool doOta = isInitialCycle ||
                (config.power_mode == 0
                    ? ((rtc_upload_count % 24) == 1)
                    : ((rtc_upload_count % 6) == 1));

            if (doOta) {
                Serial.printf("[OTA] Checking for firmware update (Upload #%d, Initial: %d)...\n",
                              rtc_upload_count, isInitialCycle ? 1 : 0);
                OtaManager::checkForUpdate(config, configMgr, FIRMWARE_VERSION);
            }
        } else {
            Serial.println(F("[Auth] Station not registered yet, skipping telemetry upload"));
        }
    } else {
        Serial.println(F("[WiFi] Offline this cycle, telemetry cached in RTC memory"));
    }

    // Reset RTC sample count after upload attempt (Low Power)
    if (config.power_mode == 0) {
        rtc_sample_count = 0;
    }

    timer.finalizeAndSaveForNextCycle();

    // 4. Enter Sleep
    if (config.power_mode == 0) {
        Serial.println(F("[Power] Entering DEEP SLEEP for 10 minutes (600s)..."));
        SleepManager::enterDeepSleep(600);
    } else {
        Serial.println(F("[Power] Entering LIGHT SLEEP for 60 seconds..."));
        SleepManager::enterLightSleep(60);
    }
}

void loop() {
    runCycle();
}

#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include <esp_sleep.h>

#define DRD_MAGIC 0xD0BB1E01

// Retained in RTC memory across warm/software resets and reset button presses
RTC_DATA_ATTR uint32_t rtc_drd_magic = 0;

class DoubleResetDetector {
private:
    bool _doubleResetDetected;
    uint32_t _timeoutMs;

public:
    DoubleResetDetector(uint32_t timeoutMs = 2500)
        : _doubleResetDetected(false), _timeoutMs(timeoutMs) {}

    bool detect() {
        // If waking from Deep Sleep timer, this is an automated telemetry cycle, NOT a human reset.
        if (esp_reset_reason() == ESP_RST_DEEPSLEEP) {
            _doubleResetDetected = false;
            return false;
        }

        // Check both RTC memory and NVS Preferences for magic flag
        Preferences prefs;
        prefs.begin("drd", false);
        uint32_t nvs_magic = prefs.getUInt("magic", 0);

        if (rtc_drd_magic == DRD_MAGIC || nvs_magic == DRD_MAGIC) {
            // Second reset occurred within the detection window!
            _doubleResetDetected = true;
            rtc_drd_magic = 0;
            prefs.putUInt("magic", 0);
            prefs.end();

            Serial.println(F("\n[DRD] =========================================="));
            Serial.println(F("[DRD] *** DOUBLE RESET DETECTED! ***"));
            Serial.println(F("[DRD] Entering Soft-AP Configuration Portal..."));
            Serial.println(F("[DRD] ==========================================\n"));
            return true;
        }

        // First physical reset: arm detection flag in both RTC and NVS
        _doubleResetDetected = false;
        rtc_drd_magic = DRD_MAGIC;
        prefs.putUInt("magic", DRD_MAGIC);
        prefs.end();

        Serial.println(F("[DRD] Reset window active: press reset again within 2.5s for Soft-AP setup"));

        // Wait for double-reset window on physical reset/power-on so user has time to press RST again!
        uint32_t start = millis();
        while (millis() - start < _timeoutMs) {
            delay(10);
        }

        // Window expired without second reset: clear magic flags
        clear();
        Serial.println(F("[DRD] Reset window closed. Normal monitoring continuing."));
        return false;
    }

    void loop() {
        // Maintained for backward compatibility
    }

    void clear() {
        rtc_drd_magic = 0;
        Preferences prefs;
        prefs.begin("drd", false);
        prefs.putUInt("magic", 0);
        prefs.end();
    }

    bool isDoubleReset() const {
        return _doubleResetDetected;
    }
};

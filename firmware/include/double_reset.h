#pragma once

#include <Arduino.h>

#define DRD_MAGIC 0xD0BB1E01

// Retained in RTC memory across warm/software resets and reset button presses
RTC_DATA_ATTR uint32_t rtc_drd_magic = 0;

class DoubleResetDetector {
private:
    bool _doubleResetDetected;
    uint32_t _windowStartMs;
    uint32_t _timeoutMs;
    bool _waiting;

public:
    DoubleResetDetector(uint32_t timeoutMs = 2000)
        : _doubleResetDetected(false), _windowStartMs(0), _timeoutMs(timeoutMs), _waiting(false) {}

    bool detect() {
        if (rtc_drd_magic == DRD_MAGIC) {
            // Second reset occurred within the 2-second detection window!
            _doubleResetDetected = true;
            rtc_drd_magic = 0; // Clear immediately
            _waiting = false;
            Serial.println(F("\n[DRD] =========================================="));
            Serial.println(F("[DRD] *** DOUBLE RESET DETECTED (within 2s)! ***"));
            Serial.println(F("[DRD] Entering Soft-AP Configuration Portal..."));
            Serial.println(F("[DRD] ==========================================\n"));
            return true;
        }

        // First reset (or initial power-on)
        _doubleResetDetected = false;
        rtc_drd_magic = DRD_MAGIC;
        _windowStartMs = millis();
        _waiting = true;
        Serial.println(F("[DRD] Reset window active: press reset again within 2s for Soft-AP setup"));
        return false;
    }

    void loop() {
        if (_waiting && (millis() - _windowStartMs >= _timeoutMs)) {
            // 2 seconds elapsed without a second reset; clear magic flag
            rtc_drd_magic = 0;
            _waiting = false;
            Serial.println(F("[DRD] Reset window closed. Normal monitoring loop continuing."));
        }
    }

    void clear() {
        rtc_drd_magic = 0;
        _waiting = false;
    }

    bool isDoubleReset() const {
        return _doubleResetDetected;
    }
};

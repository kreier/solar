#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>
#include <esp_sleep.h>

class SleepManager {
public:
    static void enterLightSleep(uint32_t sleepDurationSeconds = 30) {
        Serial.printf("[Power] Shutting down WiFi radio before light sleep...\n");
        WiFi.disconnect(true);
        WiFi.mode(WIFI_OFF);
        esp_wifi_stop();
        delay(100);

        uint64_t sleepUs = (uint64_t)sleepDurationSeconds * 1000000ULL;
        if (sleepDurationSeconds >= 60) {
            Serial.printf("[Power] Entering LIGHT SLEEP for %u seconds (%u min)...\n",
                          (unsigned)sleepDurationSeconds, (unsigned)(sleepDurationSeconds / 60));
        } else {
            Serial.printf("[Power] Entering LIGHT SLEEP for %u seconds...\n",
                          (unsigned)sleepDurationSeconds);
        }
        Serial.flush();

        esp_sleep_enable_timer_wakeup(sleepUs);
        esp_light_sleep_start();

        // Execution resumes right here after timer fires!
        Serial.println(F("\n[Power] Woken up from LIGHT SLEEP!"));
    }

    static void enterDeepSleep(uint32_t sleepDurationSeconds = 600) {
        Serial.printf("[Power] Shutting down WiFi radio before deep sleep...\n");
        WiFi.disconnect(true);
        WiFi.mode(WIFI_OFF);
        esp_wifi_stop();
        delay(100);

        uint64_t sleepUs = (uint64_t)sleepDurationSeconds * 1000000ULL;
        Serial.printf("[Power] Entering DEEP SLEEP for %u seconds...\n", (unsigned)sleepDurationSeconds);
        Serial.flush();

        esp_sleep_enable_timer_wakeup(sleepUs);
        esp_deep_sleep_start();
    }
};

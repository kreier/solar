#pragma once

#include <Arduino.h>
#include "soc/soc.h"
#if CONFIG_IDF_TARGET_ESP32
#include "soc/sens_reg.h"
#endif

struct AdcReadings {
    int raw_pin_temp;
    int raw_pin_solar;
    int raw_pin_lipo;

    int pin_temp_mv;
    int pin_solar_mv;
    int pin_lipo_mv;

    int temp_mv;    // Calibrated millivolts
    float temp_c;   // Temperature in Celsius

    int solar_mv;   // Calibrated solar voltage in millivolts
    float solar_v;  // Solar voltage in Volts

    int lipo_mv;    // Calibrated LiPo voltage in millivolts
    float lipo_v;   // LiPo voltage in Volts
};

class AdcReader {
private:
    uint32_t _reg_b;

public:
    AdcReader() : _reg_b(0) {}

    void begin() {
        analogReadResolution(12);
#if CONFIG_IDF_TARGET_ESP32
        // Save ADC2 control register state on classic ESP32 to restore after sleep/Wi-Fi
        _reg_b = READ_PERI_REG(SENS_SAR_READ_CTRL2_REG);
#endif
    }

    AdcReadings readSensors(uint8_t pinTemp, uint8_t pinSolar, uint8_t pinLipo,
                            uint8_t tempSource = 0, bool enableSolar = true, bool enableLipo = true,
                            float tempFactor = 0.1f, float solarFactor = 2.0f, float lipoFactor = 2.0f) {
#if CONFIG_IDF_TARGET_ESP32
        // Restore ADC register state after sleep on classic ESP32 to prevent inverted/corrupted readings
        if (_reg_b != 0) {
            WRITE_PERI_REG(SENS_SAR_READ_CTRL2_REG, _reg_b);
            SET_PERI_REG_MASK(SENS_SAR_READ_CTRL2_REG, SENS_SAR2_DATA_INV);
        }
#endif

        AdcReadings readings;
        memset(&readings, 0, sizeof(readings));

        // 1. Temperature Measurement
        if (tempSource == 1) {
            // Internal on-chip ESP32 / ESP32-S3 temperature sensor
            float internalTemp = temperatureRead();
            if (!isnan(internalTemp) && internalTemp > -50.0f && internalTemp < 150.0f) {
                readings.temp_c = internalTemp;
            } else {
                readings.temp_c = 25.0f; // fallback nominal
            }
            readings.temp_mv = static_cast<int>(readings.temp_c * 10.0f);
            readings.raw_pin_temp = 0;
            readings.pin_temp_mv = readings.temp_mv;
        } else {
            // External Analog Temperature Sensor on pinTemp using factory-calibrated analogReadMilliVolts
            // Multisample 100x to reduce noise (~1 ms total)
            long rawSum = 0;
            long mvSum = 0;
            for (int i = 0; i < 100; i++) {
                rawSum += analogRead(pinTemp);
                mvSum  += analogReadMilliVolts(pinTemp);
                delayMicroseconds(20);
            }
            readings.raw_pin_temp = rawSum / 100;
            readings.pin_temp_mv = mvSum / 100;
            readings.temp_mv = readings.pin_temp_mv;
            readings.temp_c = readings.pin_temp_mv * tempFactor;
        }

        // 2. Solar Voltage Measurement
        if (enableSolar) {
            long rawSum = 0;
            long mvSum = 0;
            for (int i = 0; i < 100; i++) {
                rawSum += analogRead(pinSolar);
                mvSum  += analogReadMilliVolts(pinSolar);
                delayMicroseconds(20);
            }
            readings.raw_pin_solar = rawSum / 100;
            readings.pin_solar_mv = mvSum / 100;

            // ESP32 ADC deadband filter (< ~150 mV offset produces 0.284V at raw=0 with 2:1 divider)
            if (readings.raw_pin_solar == 0 || readings.pin_solar_mv <= 145) {
                readings.pin_solar_mv = 0;
                readings.solar_mv = 0;
                readings.solar_v = 0.0f;
            } else {
                // Apply conversion factor (standard x2.0 for 1k:1k voltage divider)
                readings.solar_mv = static_cast<int>(readings.pin_solar_mv * solarFactor);
                readings.solar_v = readings.solar_mv / 1000.0f;
            }
        } else {
            readings.raw_pin_solar = 0;
            readings.pin_solar_mv = 0;
            readings.solar_mv = 0;
            readings.solar_v = 0.0f;
        }

        // 3. LiPo Battery Voltage Measurement
        if (enableLipo) {
            long rawSum = 0;
            long mvSum = 0;
            for (int i = 0; i < 100; i++) {
                rawSum += analogRead(pinLipo);
                mvSum  += analogReadMilliVolts(pinLipo);
                delayMicroseconds(20);
            }
            readings.raw_pin_lipo = rawSum / 100;
            readings.pin_lipo_mv = mvSum / 100;

            if (readings.raw_pin_lipo == 0) {
                readings.pin_lipo_mv = 0;
                readings.lipo_mv = 0;
                readings.lipo_v = 0.0f;
            } else {
                // Apply conversion factor (standard x2.0 for 10k:10k voltage divider)
                readings.lipo_mv = static_cast<int>(readings.pin_lipo_mv * lipoFactor);
                readings.lipo_v = readings.lipo_mv / 1000.0f;
            }
        } else {
            readings.raw_pin_lipo = 0;
            readings.pin_lipo_mv = 0;
            readings.lipo_mv = 0;
            readings.lipo_v = 0.0f;
        }

        return readings;
    }
};

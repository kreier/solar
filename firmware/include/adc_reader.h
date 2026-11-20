#pragma once

#include <Arduino.h>

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
public:
    AdcReader() {}

    void begin() {
        analogReadResolution(12);
    }

    AdcReadings readSensors(uint8_t pinTemp, uint8_t pinSolar, uint8_t pinLipo,
                            uint8_t tempSource = 0, bool enableSolar = true, bool enableLipo = true,
                            float tempFactor = 0.1f, float solarFactor = 2.0f, float lipoFactor = 2.0f) {
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
            // External Analog Temperature Sensor on pinTemp using factory-calibrated adc_cali_raw_to_voltage
            long rawSum = 0;
            long mvSum = 0;
            for (int i = 0; i < 50; i++) {
                rawSum += analogRead(pinTemp);
                mvSum  += analogReadMilliVolts(pinTemp);
                delayMicroseconds(25);
            }
            readings.raw_pin_temp = rawSum / 50;
            readings.pin_temp_mv = mvSum / 50;
            readings.temp_mv = readings.pin_temp_mv;
            readings.temp_c = readings.pin_temp_mv * tempFactor;
        }

        // 2. Solar Voltage Measurement
        if (enableSolar) {
            long rawSum = 0;
            long mvSum = 0;
            for (int i = 0; i < 50; i++) {
                rawSum += analogRead(pinSolar);
                mvSum  += analogReadMilliVolts(pinSolar);
                delayMicroseconds(25);
            }
            readings.raw_pin_solar = rawSum / 50;
            readings.pin_solar_mv = mvSum / 50;

            // Apply conversion factor (standard x2.0 for 1k:1k voltage divider)
            readings.solar_mv = static_cast<int>(readings.pin_solar_mv * solarFactor);
            readings.solar_v = readings.solar_mv / 1000.0f;
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
            for (int i = 0; i < 50; i++) {
                rawSum += analogRead(pinLipo);
                mvSum  += analogReadMilliVolts(pinLipo);
                delayMicroseconds(25);
            }
            readings.raw_pin_lipo = rawSum / 50;
            readings.pin_lipo_mv = mvSum / 50;

            // Apply conversion factor (standard x2.0 for 10k:10k voltage divider)
            readings.lipo_mv = static_cast<int>(readings.pin_lipo_mv * lipoFactor);
            readings.lipo_v = readings.lipo_mv / 1000.0f;
        } else {
            readings.raw_pin_lipo = 0;
            readings.pin_lipo_mv = 0;
            readings.lipo_mv = 0;
            readings.lipo_v = 0.0f;
        }

        return readings;
    }
};

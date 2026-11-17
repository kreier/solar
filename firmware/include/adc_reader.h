#pragma once

#include <Arduino.h>
#include "soc/soc.h"
#include "soc/sens_reg.h"

// Pin definitions
#define PIN_TEMP_ADC32  32  // Temperature sensor (10 mV/°C)
#define PIN_SOLAR_ADC34 34  // Solar panel voltage (divider 1k : 1k)
#define PIN_LIPO_ADC35  35  // LiPo battery voltage (divider 10k : 10k)

struct AdcReadings {
    int raw_pin32;
    int raw_pin34;
    int raw_pin35;

    int temp_mv;    // Calibrated millivolts
    float temp_c;   // Temperature in Celsius (temp_mv / 10.0)

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
        // Save ADC2 control register state if needed
        _reg_b = READ_PERI_REG(SENS_SAR_READ_CTRL2_REG);
    }

    AdcReadings readSensors() {
        // Restore ADC register state after sleep
        if (_reg_b != 0) {
            WRITE_PERI_REG(SENS_SAR_READ_CTRL2_REG, _reg_b);
            SET_PERI_REG_MASK(SENS_SAR_READ_CTRL2_REG, SENS_SAR2_DATA_INV);
        }

        const int pins[3] = {PIN_TEMP_ADC32, PIN_SOLAR_ADC34, PIN_LIPO_ADC35};
        long rawSum[3] = {0, 0, 0};

        // Multisample 100x to reduce ADC noise (~9.5 us * 100 = ~1 ms per pin)
        for (int m = 0; m < 100; m++) {
            for (int i = 0; i < 3; i++) {
                rawSum[i] += analogRead(pins[i]);
            }
            delayMicroseconds(20);
        }

        AdcReadings readings;
        readings.raw_pin32 = rawSum[0] / 100;
        readings.raw_pin34 = rawSum[1] / 100;
        readings.raw_pin35 = rawSum[2] / 100;

        // Nonlinearity calibration formulas for ESP32 ADC:
        // pin 32: temp -> voltage[0] = int(voltage[0] * 0.83 + 155)
        // pin 34: solar -> voltage[2] = int(voltage[2] * 1.64 + 315); if (voltage[2] == 315) voltage[2] = 0;
        // pin 35: lipo  -> voltage[3] = int(voltage[3] * 1.65 + 307);

        readings.temp_mv = static_cast<int>(readings.raw_pin32 * 0.83f + 155.0f);
        readings.temp_c  = readings.temp_mv / 10.0f;

        int solar_calc = static_cast<int>(readings.raw_pin34 * 1.64f + 315.0f);
        if (solar_calc == 315 || readings.raw_pin34 == 0) {
            solar_calc = 0;
        }
        readings.solar_mv = solar_calc;
        readings.solar_v  = readings.solar_mv / 1000.0f;

        readings.lipo_mv = static_cast<int>(readings.raw_pin35 * 1.65f + 307.0f);
        readings.lipo_v  = readings.lipo_mv / 1000.0f;

        return readings;
    }
};

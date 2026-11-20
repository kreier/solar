#pragma once

#include <Arduino.h>
#include "soc/soc.h"
#if CONFIG_IDF_TARGET_ESP32
#include "soc/sens_reg.h"
#endif

// Default Pin definitions
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
#if CONFIG_IDF_TARGET_ESP32
        // Save ADC2 control register state if needed on classic ESP32
        _reg_b = READ_PERI_REG(SENS_SAR_READ_CTRL2_REG);
#endif
    }

    AdcReadings readSensors(uint8_t pinTemp = PIN_TEMP_ADC32,
                            uint8_t pinSolar = PIN_SOLAR_ADC34,
                            uint8_t pinLipo = PIN_LIPO_ADC35,
                            float calTempFactor = 0.83f, float calTempOffset = 155.0f,
                            float calSolarFactor = 1.64f, float calSolarOffset = 315.0f,
                            float calLipoFactor = 1.65f, float calLipoOffset = 307.0f) {
#if CONFIG_IDF_TARGET_ESP32
        // Restore ADC register state after sleep on classic ESP32
        if (_reg_b != 0) {
            WRITE_PERI_REG(SENS_SAR_READ_CTRL2_REG, _reg_b);
            SET_PERI_REG_MASK(SENS_SAR_READ_CTRL2_REG, SENS_SAR2_DATA_INV);
        }
#endif

        const int pins[3] = {pinTemp, pinSolar, pinLipo};
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

        // Nonlinearity calibration with configurable scaling factors and offsets
        readings.temp_mv = static_cast<int>(readings.raw_pin32 * calTempFactor + calTempOffset);
        readings.temp_c  = readings.temp_mv / 10.0f;

        int solar_calc = static_cast<int>(readings.raw_pin34 * calSolarFactor + calSolarOffset);
        if (solar_calc == (int)calSolarOffset || readings.raw_pin34 == 0) {
            solar_calc = 0;
        }
        readings.solar_mv = solar_calc;
        readings.solar_v  = readings.solar_mv / 1000.0f;

        int lipo_calc = static_cast<int>(readings.raw_pin35 * calLipoFactor + calLipoOffset);
        if (readings.raw_pin35 == 0) {
            lipo_calc = 0;
        }
        readings.lipo_mv = lipo_calc;
        readings.lipo_v  = readings.lipo_mv / 1000.0f;

        return readings;
    }
};

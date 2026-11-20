#pragma once

#include <Arduino.h>
#include <Wire.h>

#define INA3221_DEFAULT_ADDR 0x40

#define INA3221_REG_CONFIG       0x00
#define INA3221_REG_CH1_SHUNT    0x01
#define INA3221_REG_CH1_BUS      0x02
#define INA3221_REG_CH2_SHUNT    0x03
#define INA3221_REG_CH2_BUS      0x04
#define INA3221_REG_CH3_SHUNT    0x05
#define INA3221_REG_CH3_BUS      0x06
#define INA3221_REG_MANUF_ID     0xFE
#define INA3221_REG_DIE_ID       0xFF

struct Ina3221Readings {
    bool present;

    // Channel 1: Solar Panel
    float ch1_solar_v;       // Bus voltage in Volts
    float ch1_solar_ma;      // Current in mA
    float ch1_solar_mw;      // Power in mW (V * mA)

    // Channel 3: Load
    float ch3_load_v;        // Bus voltage in Volts
    float ch3_load_ma;       // Current in mA
    float ch3_load_mw;       // Power in mW (V * mA)
    float ch3_load_res_ohm;  // Load resistance (V / I) in Ohms
};

class Ina3221Reader {
private:
    uint8_t _addr;
    float _r_shunt; // in Ohms (typically 0.100 Ohm)
    bool _initialized;

    int16_t readRegister16(uint8_t reg) {
        Wire.beginTransmission(_addr);
        Wire.write(reg);
        if (Wire.endTransmission(false) != 0) {
            return 0;
        }

        if (Wire.requestFrom((int)_addr, 2) != 2) {
            return 0;
        }

        uint8_t msb = Wire.read();
        uint8_t lsb = Wire.read();
        return (int16_t)((msb << 8) | lsb);
    }

public:
    Ina3221Reader() : _addr(INA3221_DEFAULT_ADDR), _r_shunt(0.100f), _initialized(false) {}

    bool begin(uint8_t sdaPin, uint8_t sclPin, uint8_t addr = INA3221_DEFAULT_ADDR, float rShunt = 0.100f) {
        _addr = addr;
        _r_shunt = (rShunt > 0.001f) ? rShunt : 0.100f;

        Wire.begin(sdaPin, sclPin);
        Wire.setClock(100000); // 100 kHz standard I2C

        // Test communication
        Wire.beginTransmission(_addr);
        if (Wire.endTransmission() != 0) {
            _initialized = false;
            return false;
        }

        // Configure INA3221: continuous shunt & bus measurement on all enabled channels
        Wire.beginTransmission(_addr);
        Wire.write(INA3221_REG_CONFIG);
        Wire.write(0x71); // Enable CH1, CH2, CH3, 12-bit / 1.1ms conversion
        Wire.write(0x27); // Shunt and bus continuous
        Wire.endTransmission();

        _initialized = true;
        return true;
    }

    bool isPresent() const {
        return _initialized;
    }

    Ina3221Readings read() {
        Ina3221Readings res;
        memset(&res, 0, sizeof(res));

        if (!_initialized) {
            return res;
        }

        res.present = true;

        // 1. Channel 1: Solar Panel
        int16_t ch1BusRaw = readRegister16(INA3221_REG_CH1_BUS);
        int16_t ch1ShuntRaw = readRegister16(INA3221_REG_CH1_SHUNT);

        // Bus voltage: 8 mV per LSB (bits 15:3)
        res.ch1_solar_v = ((ch1BusRaw >> 3) * 0.008f);
        if (res.ch1_solar_v < 0.0f) res.ch1_solar_v = 0.0f;

        // Shunt voltage: 40 uV (0.04 mV) per LSB (bits 15:3)
        float ch1ShuntMv = (ch1ShuntRaw >> 3) * 0.040f;
        res.ch1_solar_ma = ch1ShuntMv / _r_shunt;
        if (res.ch1_solar_ma < 0.0f) res.ch1_solar_ma = 0.0f;
        res.ch1_solar_mw = res.ch1_solar_v * res.ch1_solar_ma;

        // 2. Channel 3: Connected Load
        int16_t ch3BusRaw = readRegister16(INA3221_REG_CH3_BUS);
        int16_t ch3ShuntRaw = readRegister16(INA3221_REG_CH3_SHUNT);

        res.ch3_load_v = ((ch3BusRaw >> 3) * 0.008f);
        if (res.ch3_load_v < 0.0f) res.ch3_load_v = 0.0f;

        float ch3ShuntMv = (ch3ShuntRaw >> 3) * 0.040f;
        res.ch3_load_ma = ch3ShuntMv / _r_shunt;
        if (res.ch3_load_ma < 0.0f) res.ch3_load_ma = 0.0f;
        res.ch3_load_mw = res.ch3_load_v * res.ch3_load_ma;

        // Resistance R = V / I (Ohms)
        if (res.ch3_load_ma > 0.5f) {
            res.ch3_load_res_ohm = (res.ch3_load_v * 1000.0f) / res.ch3_load_ma;
        } else {
            res.ch3_load_res_ohm = 0.0f;
        }

        return res;
    }
};

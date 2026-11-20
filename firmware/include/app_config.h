#pragma once

#include <Arduino.h>
#include <Preferences.h>

#define NVS_NAMESPACE       "solar_mon"
#define NVS_KEY_TOKEN       "dev_token"
#define DEFAULT_WORKER_URL  "https://solar.kreier.workers.dev"
#define DEFAULT_STATION_ID  "phumy2"
#define DEFAULT_LOCATION    "District 7, HCMC"
#define DEFAULT_MASTER      "solar-fleet-bootstrap-2026"

#if defined(CONFIG_IDF_TARGET_ESP32S3) || defined(ARDUINO_ESP32S3_DEV)
#define DEFAULT_PIN_TEMP    1   // ADC1 CH0 (GPIO1)
#define DEFAULT_PIN_SOLAR   2   // ADC1 CH1 (GPIO2)
#define DEFAULT_PIN_LIPO    3   // ADC1 CH2 (GPIO3)
#define DEFAULT_PIN_SDA     4   // I2C SDA (GPIO4)
#define DEFAULT_PIN_SCL     5   // I2C SCL (GPIO5)
#elif defined(CONFIG_IDF_TARGET_ESP32C5) || defined(CONFIG_IDF_TARGET_ESP32C6) || defined(ARDUINO_ESP32C5_DEV) || defined(ARDUINO_ESP32C6_DEV)
#define DEFAULT_PIN_TEMP    1   // ADC1 CH1 (GPIO1)
#define DEFAULT_PIN_SOLAR   2   // ADC1 CH2 (GPIO2)
#define DEFAULT_PIN_LIPO    3   // ADC1 CH3 (GPIO3)
#define DEFAULT_PIN_SDA     0   // I2C SDA (GPIO0)
#define DEFAULT_PIN_SCL     1   // I2C SCL (GPIO1)
#else
// Classic ESP32
#define DEFAULT_PIN_TEMP    32
#define DEFAULT_PIN_SOLAR   34
#define DEFAULT_PIN_LIPO    35
#define DEFAULT_PIN_SDA     21
#define DEFAULT_PIN_SCL     22
#endif

#define DEFAULT_CAL_TEMP_FACTOR   0.83f
#define DEFAULT_CAL_TEMP_OFFSET   155.0f
#define DEFAULT_CAL_SOLAR_FACTOR  1.64f
#define DEFAULT_CAL_SOLAR_OFFSET  315.0f
#define DEFAULT_CAL_LIPO_FACTOR   1.65f
#define DEFAULT_CAL_LIPO_OFFSET   307.0f

struct SolarConfig {
    char station_id[32];
    char location[64];
    char worker_url[128];
    char master_phrase[64];
    char wifi_ssid[32];
    char wifi_pass[64];
    char backup_ssid[32];
    char backup_pass[64];

    // Hardware Pins framework
    uint8_t pin_temp;
    uint8_t pin_solar;
    uint8_t pin_lipo;
    uint8_t pin_sda;
    uint8_t pin_scl;

    // Calibration factors and offsets
    float cal_temp_factor;
    float cal_temp_offset;
    float cal_solar_factor;
    float cal_solar_offset;
    float cal_lipo_factor;
    float cal_lipo_offset;

    // Power saving and operational modes
    // 0: Minimal Energy Consumption (Deep Sleep, 10-min measure to RTC, 1-hour batch upload, fast BSSID)
    // 1: Balanced Mode (Light/Deep Sleep, 10-min measure & immediate upload)
    uint8_t power_mode;

    // Canary firmware channel acceptance
    bool is_canary;

    // INA3221 Sensor (I2C address 0x40, CH1 Solar, CH3 Load)
    bool has_ina3221;
    uint8_t ina_addr;
    float ina_r_shunt; // Ohms (typically 0.100 Ohm)

    bool is_configured;
};

class AppConfigManager {
public:
    AppConfigManager() {}

    bool loadConfig(SolarConfig &config) {
        Preferences prefs;
        if (!prefs.begin(NVS_NAMESPACE, true)) {
            Serial.println(F("[Config] No NVS configuration found, using defaults"));
            loadDefaults(config);
            return false;
        }

        String stId = prefs.getString("st_id", DEFAULT_STATION_ID);
        strlcpy(config.station_id, stId.c_str(), sizeof(config.station_id));

        String loc = prefs.getString("location", DEFAULT_LOCATION);
        strlcpy(config.location, loc.c_str(), sizeof(config.location));

        String url = prefs.getString("worker_url", DEFAULT_WORKER_URL);
        strlcpy(config.worker_url, url.c_str(), sizeof(config.worker_url));

        String master = prefs.getString("master", DEFAULT_MASTER);
        strlcpy(config.master_phrase, master.c_str(), sizeof(config.master_phrase));

        String ssid = prefs.getString("wifi_ssid", "");
        strlcpy(config.wifi_ssid, ssid.c_str(), sizeof(config.wifi_ssid));

        String pass = prefs.getString("wifi_pass", "");
        strlcpy(config.wifi_pass, pass.c_str(), sizeof(config.wifi_pass));

        String bSsid = prefs.getString("bkp_ssid", "");
        strlcpy(config.backup_ssid, bSsid.c_str(), sizeof(config.backup_ssid));

        String bPass = prefs.getString("bkp_pass", "");
        strlcpy(config.backup_pass, bPass.c_str(), sizeof(config.backup_pass));

        config.pin_temp  = prefs.getUChar("pin_tmp", DEFAULT_PIN_TEMP);
        config.pin_solar = prefs.getUChar("pin_sol", DEFAULT_PIN_SOLAR);
        config.pin_lipo  = prefs.getUChar("pin_lip", DEFAULT_PIN_LIPO);
        config.pin_sda   = prefs.getUChar("pin_sda", DEFAULT_PIN_SDA);
        config.pin_scl   = prefs.getUChar("pin_scl", DEFAULT_PIN_SCL);

        config.cal_temp_factor  = prefs.getFloat("c_tmp_f", DEFAULT_CAL_TEMP_FACTOR);
        config.cal_temp_offset  = prefs.getFloat("c_tmp_o", DEFAULT_CAL_TEMP_OFFSET);
        config.cal_solar_factor = prefs.getFloat("c_sol_f", DEFAULT_CAL_SOLAR_FACTOR);
        config.cal_solar_offset = prefs.getFloat("c_sol_o", DEFAULT_CAL_SOLAR_OFFSET);
        config.cal_lipo_factor  = prefs.getFloat("c_lip_f", DEFAULT_CAL_LIPO_FACTOR);
        config.cal_lipo_offset  = prefs.getFloat("c_lip_o", DEFAULT_CAL_LIPO_OFFSET);

        config.power_mode = prefs.getUChar("pwr_mod", 0); // Default to minimal energy consumption
        config.is_canary   = prefs.getBool("is_can", false);

        config.has_ina3221 = prefs.getBool("has_ina", false);
        config.ina_addr    = prefs.getUChar("ina_adr", 0x40);
        config.ina_r_shunt = prefs.getFloat("ina_rsh", 0.100f);

        config.is_configured = prefs.getBool("is_cfg", (strlen(config.wifi_ssid) > 0));
        prefs.end();

        return true;
    }

    void loadDefaults(SolarConfig &config) {
        strlcpy(config.station_id, DEFAULT_STATION_ID, sizeof(config.station_id));
        strlcpy(config.location, DEFAULT_LOCATION, sizeof(config.location));
        strlcpy(config.worker_url, DEFAULT_WORKER_URL, sizeof(config.worker_url));
        strlcpy(config.master_phrase, DEFAULT_MASTER, sizeof(config.master_phrase));
        config.wifi_ssid[0] = '\0';
        config.wifi_pass[0] = '\0';
        config.backup_ssid[0] = '\0';
        config.backup_pass[0] = '\0';

        config.pin_temp  = DEFAULT_PIN_TEMP;
        config.pin_solar = DEFAULT_PIN_SOLAR;
        config.pin_lipo  = DEFAULT_PIN_LIPO;
        config.pin_sda   = DEFAULT_PIN_SDA;
        config.pin_scl   = DEFAULT_PIN_SCL;

        config.cal_temp_factor  = DEFAULT_CAL_TEMP_FACTOR;
        config.cal_temp_offset  = DEFAULT_CAL_TEMP_OFFSET;
        config.cal_solar_factor = DEFAULT_CAL_SOLAR_FACTOR;
        config.cal_solar_offset = DEFAULT_CAL_SOLAR_OFFSET;
        config.cal_lipo_factor  = DEFAULT_CAL_LIPO_FACTOR;
        config.cal_lipo_offset  = DEFAULT_CAL_LIPO_OFFSET;

        config.power_mode = 0; // Minimal Energy
        config.is_canary = false;

        config.has_ina3221 = false;
        config.ina_addr = 0x40;
        config.ina_r_shunt = 0.100f;

        config.is_configured = false;
    }

    bool saveConfig(const SolarConfig &config) {
        Preferences prefs;
        if (!prefs.begin(NVS_NAMESPACE, false)) {
            Serial.println(F("[Config] Failed to open NVS for writing"));
            return false;
        }

        prefs.putString("st_id", config.station_id);
        prefs.putString("location", config.location);
        prefs.putString("worker_url", config.worker_url);

        if (strlen(config.master_phrase) > 0) {
            prefs.putString("master", config.master_phrase);
        } else {
            prefs.remove("master");
        }

        prefs.putString("wifi_ssid", config.wifi_ssid);
        prefs.putString("wifi_pass", config.wifi_pass);
        prefs.putString("bkp_ssid", config.backup_ssid);
        prefs.putString("bkp_pass", config.backup_pass);

        prefs.putUChar("pin_tmp", config.pin_temp);
        prefs.putUChar("pin_sol", config.pin_solar);
        prefs.putUChar("pin_lip", config.pin_lipo);
        prefs.putUChar("pin_sda", config.pin_sda);
        prefs.putUChar("pin_scl", config.pin_scl);

        prefs.putFloat("c_tmp_f", config.cal_temp_factor);
        prefs.putFloat("c_tmp_o", config.cal_temp_offset);
        prefs.putFloat("c_sol_f", config.cal_solar_factor);
        prefs.putFloat("c_sol_o", config.cal_solar_offset);
        prefs.putFloat("c_lip_f", config.cal_lipo_factor);
        prefs.putFloat("c_lip_o", config.cal_lipo_offset);

        prefs.putUChar("pwr_mod", config.power_mode);
        prefs.putBool("is_can", config.is_canary);

        prefs.putBool("has_ina", config.has_ina3221);
        prefs.putUChar("ina_adr", config.ina_addr);
        prefs.putFloat("ina_rsh", config.ina_r_shunt);

        prefs.putBool("is_cfg", config.is_configured);
        prefs.end();

        Serial.println(F("[Config] Saved configuration to NVS"));
        return true;
    }

    bool saveDeviceToken(const String &token) {
        Preferences prefs;
        if (!prefs.begin(NVS_NAMESPACE, false)) {
            Serial.println(F("[NVS] Failed to open NVS for device token"));
            return false;
        }
        size_t written = prefs.putString(NVS_KEY_TOKEN, token);
        prefs.end();
        return written > 0;
    }

    String getDeviceToken() {
        Preferences prefs;
        if (!prefs.begin(NVS_NAMESPACE, true)) {
            return String();
        }
        String token = prefs.getString(NVS_KEY_TOKEN, "");
        prefs.end();
        return token;
    }

    bool hasDeviceToken() {
        return getDeviceToken().length() > 0;
    }

    bool eraseMasterPhrase(SolarConfig &config) {
        memset(config.master_phrase, 0, sizeof(config.master_phrase));
        Preferences prefs;
        if (prefs.begin(NVS_NAMESPACE, false)) {
            prefs.remove("master");
            prefs.end();
            Serial.println(F("[Config] Zero-Trust: MASTER_PHRASE erased from NVS"));
            return true;
        }
        return false;
    }
};

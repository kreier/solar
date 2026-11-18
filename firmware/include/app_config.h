#pragma once

#include <Arduino.h>
#include <Preferences.h>

#define NVS_NAMESPACE       "solar_mon"
#define NVS_KEY_TOKEN       "dev_token"
#define DEFAULT_WORKER_URL  "https://solar.kreier.workers.dev"
#define DEFAULT_STATION_ID  "phumy2"
#define DEFAULT_LOCATION    "District 7, HCMC"
#define DEFAULT_MASTER      "solar-fleet-bootstrap-2026"

#define DEFAULT_PIN_TEMP    32
#define DEFAULT_PIN_SOLAR   34
#define DEFAULT_PIN_LIPO    35

struct SolarConfig {
    char station_id[32];
    char location[64];
    char worker_url[128];
    char master_phrase[64];
    char wifi_ssid[32];
    char wifi_pass[64];
    char backup_ssid[32];
    char backup_pass[64];

    // Hardware Pins framework for future stations
    uint8_t pin_temp;
    uint8_t pin_solar;
    uint8_t pin_lipo;

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

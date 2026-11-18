#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include "app_config.h"
#include "adc_reader.h"

class PortalManager {
public:
    static bool runPortal(SolarConfig &config, AppConfigManager &configMgr, AdcReader &adc, uint32_t timeoutSeconds = 120) {
        WiFi.disconnect(true);
        WiFi.mode(WIFI_AP);

        String apName = "Solar-Setup";
        if (strlen(config.station_id) > 0) {
            apName = "Solar-" + String(config.station_id);
        }

        const char *apPass = "12345678";
        bool apOk = WiFi.softAP(apName.c_str(), apPass);
        IPAddress apIp = WiFi.softAPIP();

        Serial.println(F("\n=================================================="));
        Serial.println(F("   STARTING SOFT-AP CONFIGURATION PORTAL"));
        Serial.println(F("=================================================="));
        Serial.printf("[Portal] Soft-AP SSID     : %s\n", apName.c_str());
        Serial.printf("[Portal] Soft-AP Password : %s\n", apPass);
        Serial.printf("[Portal] Web Setup URL    : http://%s\n", apIp.toString().c_str());
        Serial.printf("[Portal] Initial Timeout  : %u seconds (pauses when client connects)\n", timeoutSeconds);
        Serial.println(F("==================================================\n"));

        WebServer server(80);
        bool configSaved = false;
        uint32_t remainingMs = timeoutSeconds * 1000;
        uint32_t lastTickMs = millis();

        server.on("/", HTTP_GET, [&]() {
            AdcReadings readings = adc.readSensors(config.pin_temp, config.pin_solar, config.pin_lipo);
            int clientCount = WiFi.softAPgetStationNum();
            uint32_t remainingSec = remainingMs / 1000;

            String html = F("<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>");
            html += F("<title>Solar ESP32 Setup</title><style>");
            html += F(":root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#f0f6fc;--muted:#8b949e;--solar:#f59e0b;--bat:#10b981;--blue:#38bdf8;}");
            html += F("*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,sans-serif;background:var(--bg);color:var(--text);padding:1rem;line-height:1.5;}");
            html += F(".wrap{max-width:540px;margin:0 auto;}header{text-align:center;margin-bottom:1.25rem;}h1{font-size:1.4rem;color:var(--solar);display:flex;align-items:center;justify-content:center;gap:0.4rem;}");
            html += F(".card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1.2rem;margin-bottom:1rem;}");
            html += F(".live-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;text-align:center;margin-top:0.5rem;}");
            html += F(".val-box{background:#0d1117;padding:0.6rem 0.3rem;border-radius:6px;border:1px solid var(--border);}");
            html += F(".val-num{font-size:1.15rem;font-weight:700;color:var(--solar);}");
            html += F(".val-lbl{font-size:0.75rem;color:var(--muted);margin-top:0.2rem;}");
            html += F(".timer-badge{display:inline-block;padding:0.25rem 0.6rem;border-radius:999px;font-size:0.8rem;margin-top:0.4rem;font-weight:600;}");
            html += F("label{display:block;font-size:0.85rem;font-weight:600;margin:0.7rem 0 0.25rem;color:var(--text);}");
            html += F("input{width:100%;padding:0.6rem;background:#0d1117;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:0.95rem;}");
            html += F("input:focus{outline:2px solid var(--solar);}.row{display:flex;gap:0.5rem;}.row>div{flex:1;}");
            html += F(".btn{width:100%;padding:0.85rem;margin-top:1.25rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;border:none;border-radius:8px;font-size:1.05rem;font-weight:700;cursor:pointer;}");
            html += F(".sub-title{font-size:0.85rem;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin-bottom:0.4rem;}");
            html += F("</style></head><body><div class='wrap'><header>");
            html += F("<h1><span>&#9728;&#65039;</span> Solar Telemetry Setup</h1>");
            if (clientCount > 0) {
                html += F("<div class='timer-badge' style='background:rgba(16,185,129,0.15);color:#10b981;'>&#128994; Client connected &bull; Timeout paused</div></header>");
            } else {
                html += "<div class='timer-badge' style='background:rgba(245,158,11,0.15);color:var(--solar);'>&#9203; Soft-AP closes in: " + String(remainingSec) + "s (pauses on connect)</div></header>";
            }

            // Live Sensor Readings Card
            html += F("<div class='card'><div class='sub-title'>Live ADC Sensor Readings</div><div class='live-grid'>");
            html += "<div class='val-box'><div class='val-num' style='color:#ef4444;'>" + String(readings.temp_c, 1) + "&deg;C</div><div class='val-lbl'>Temp (Pin " + String(config.pin_temp) + ")</div></div>";
            html += "<div class='val-box'><div class='val-num' style='color:#f59e0b;'>" + String(readings.solar_v, 2) + "V</div><div class='val-lbl'>Solar (Pin " + String(config.pin_solar) + ")</div></div>";
            html += "<div class='val-box'><div class='val-num' style='color:#10b981;'>" + String(readings.lipo_v, 2) + "V</div><div class='val-lbl'>LiPo (Pin " + String(config.pin_lipo) + ")</div></div>";
            html += F("</div></div>");

            // Setup Form
            html += F("<form method='POST' action='/save'><div class='card'>");
            html += F("<div class='sub-title'>Station &amp; Cloudflare Provisioning</div>");

            html += F("<label>Station Name (ID)</label>");
            html += "<input type='text' name='st_id' value='" + String(config.station_id) + "' required>";

            html += F("<label>Physical Location</label>");
            html += "<input type='text' name='location' value='" + String(config.location) + "' required>";

            html += F("<label>Cloudflare MASTER_PHRASE</label>");
            html += "<input type='password' name='master_phrase' value='" + String(config.master_phrase) + "' placeholder='solar-fleet-bootstrap-2026' required>";

            html += F("<label>Cloudflare Worker URL</label>");
            html += "<input type='text' name='worker_url' value='" + String(config.worker_url) + "' required>";

            html += F("</div><div class='card'><div class='sub-title'>Wi-Fi Connectivity</div>");

            html += F("<label>Primary Wi-Fi SSID</label>");
            html += "<input type='text' name='wifi_ssid' value='" + String(config.wifi_ssid) + "' required>";

            html += F("<label>Primary Wi-Fi Password</label>");
            html += "<input type='password' name='wifi_pass' value='" + String(config.wifi_pass) + "'>";

            html += F("<label>Backup Wi-Fi SSID (Optional)</label>");
            html += "<input type='text' name='bkp_ssid' value='" + String(config.backup_ssid) + "'>";

            html += F("<label>Backup Wi-Fi Password</label>");
            html += "<input type='password' name='bkp_pass' value='" + String(config.backup_pass) + "'>";

            html += F("</div><div class='card'><div class='sub-title'>Hardware Pin Framework</div><div class='row'>");
            html += "<div><label>Temp Pin</label><input type='number' name='pin_temp' value='" + String(config.pin_temp) + "'></div>";
            html += "<div><label>Solar Pin</label><input type='number' name='pin_solar' value='" + String(config.pin_solar) + "'></div>";
            html += "<div><label>LiPo Pin</label><input type='number' name='pin_lipo' value='" + String(config.pin_lipo) + "'></div>";
            html += F("</div></div>");

            html += F("<button type='submit' class='btn'>&#128190; Save Configuration &amp; Reboot</button>");
            html += F("</form></div></body></html>");

            server.send(200, "text/html", html);
        });

        server.on("/save", HTTP_POST, [&]() {
            if (server.hasArg("st_id")) strlcpy(config.station_id, server.arg("st_id").c_str(), sizeof(config.station_id));
            if (server.hasArg("location")) strlcpy(config.location, server.arg("location").c_str(), sizeof(config.location));
            if (server.hasArg("master_phrase")) strlcpy(config.master_phrase, server.arg("master_phrase").c_str(), sizeof(config.master_phrase));
            if (server.hasArg("worker_url")) strlcpy(config.worker_url, server.arg("worker_url").c_str(), sizeof(config.worker_url));
            if (server.hasArg("wifi_ssid")) strlcpy(config.wifi_ssid, server.arg("wifi_ssid").c_str(), sizeof(config.wifi_ssid));
            if (server.hasArg("wifi_pass")) strlcpy(config.wifi_pass, server.arg("wifi_pass").c_str(), sizeof(config.wifi_pass));
            if (server.hasArg("bkp_ssid")) strlcpy(config.backup_ssid, server.arg("bkp_ssid").c_str(), sizeof(config.backup_ssid));
            if (server.hasArg("bkp_pass")) strlcpy(config.backup_pass, server.arg("bkp_pass").c_str(), sizeof(config.backup_pass));

            if (server.hasArg("pin_temp")) config.pin_temp = server.arg("pin_temp").toInt();
            if (server.hasArg("pin_solar")) config.pin_solar = server.arg("pin_solar").toInt();
            if (server.hasArg("pin_lipo")) config.pin_lipo = server.arg("pin_lipo").toInt();

            config.is_configured = (strlen(config.wifi_ssid) > 0);
            configMgr.saveConfig(config);

            String resp = F("<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>");
            resp += F("<style>body{background:#0d1117;color:#f0f6fc;font-family:-apple-system,sans-serif;text-align:center;padding:2rem;}");
            resp += F(".box{max-width:420px;margin:3rem auto;background:#161b22;padding:2rem;border-radius:12px;border:1px solid #30363d;}");
            resp += F("h2{color:#10b981;margin-bottom:0.75rem;}");
            resp += F(".loader{border:4px solid #30363d;border-top:4px solid #f59e0b;border-radius:50%;width:36px;height:36px;animation:spin 1s linear infinite;margin:1.5rem auto 1rem;}");
            resp += F("@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}");
            resp += F(".info{color:#8b949e;font-size:0.9rem;}");
            resp += F("</style></head><body>");
            resp += F("<div class='box'><h2>&#9989; Configuration Saved!</h2>");
            resp += F("<p>Settings successfully written to NVS storage.</p>");
            resp += F("<div class='loader'></div>");
            resp += F("<p class='info'>Rebooting ESP32 node to connect to Wi-Fi...</p>");
            resp += F("</div></body></html>");

            server.send(200, "text/html", resp);
            configSaved = true;
            Serial.println(F("[Portal] Configuration saved to NVS. Rebooting node shortly..."));
        });

        server.on("/api/sensors", HTTP_GET, [&]() {
            AdcReadings r = adc.readSensors(config.pin_temp, config.pin_solar, config.pin_lipo);
            String json = "{";
            json += "\"temp_c\":" + String(r.temp_c, 1) + ",";
            json += "\"temp_mv\":" + String(r.temp_mv) + ",";
            json += "\"solar_v\":" + String(r.solar_v, 2) + ",";
            json += "\"solar_mv\":" + String(r.solar_mv) + ",";
            json += "\"lipo_v\":" + String(r.lipo_v, 2) + ",";
            json += "\"lipo_mv\":" + String(r.lipo_mv) + ",";
            json += "\"raw\":{\"pin32\":" + String(r.raw_pin32) + ",\"pin34\":" + String(r.raw_pin34) + ",\"pin35\":" + String(r.raw_pin35) + "}";
            json += "}";
            server.send(200, "application/json", json);
        });

        server.begin();

        uint32_t lastPrintSec = 0;
        while (remainingMs > 0 && !configSaved) {
            server.handleClient();
            delay(10);

            uint32_t nowMs = millis();
            uint32_t deltaMs = nowMs - lastTickMs;
            lastTickMs = nowMs;

            int clientCount = WiFi.softAPgetStationNum();
            if (clientCount > 0) {
                // Client is connected: pause timeout from elapsing
                remainingMs = timeoutSeconds * 1000;
            } else {
                if (remainingMs > deltaMs) {
                    remainingMs -= deltaMs;
                } else {
                    remainingMs = 0;
                }
            }

            uint32_t remainingSec = remainingMs / 1000;
            if (remainingSec % 15 == 0 && remainingSec != lastPrintSec) {
                lastPrintSec = remainingSec;
                if (clientCount > 0) {
                    Serial.printf("[Portal] Client active (%d connected). Timeout paused at http://%s\n",
                                  clientCount, apIp.toString().c_str());
                } else {
                    Serial.printf("[Portal] Waiting for client at http://%s (%u s remaining)...\n",
                                  apIp.toString().c_str(), remainingSec);
                }
            }
        }

        server.stop();
        WiFi.softAPdisconnect(true);
        WiFi.mode(WIFI_OFF);
        delay(300);

        if (configSaved) {
            Serial.println(F("[Portal] Setup complete. Rebooting ESP32 node now..."));
            delay(1000);
            ESP.restart();
            return true;
        } else {
            Serial.println(F("[Portal] Timeout reached without changes. Exiting Soft-AP mode."));
            return false;
        }
    }
};

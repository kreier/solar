#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include "app_config.h"
#include "adc_reader.h"
#include "ina3221_reader.h"

class PortalManager {
public:
    static bool runPortal(SolarConfig &config, AppConfigManager &configMgr, AdcReader &adc,
                          Ina3221Reader &ina, uint32_t timeoutSeconds = 120) {
        WiFi.disconnect(true);
        WiFi.mode(WIFI_AP_STA);

        String apName = "Solar Phy My Hung";

        const char *apPass = "12345678";
        bool apOk = WiFi.softAP(apName.c_str(), apPass);
        (void)apOk;
        IPAddress apIp = WiFi.softAPIP();

        // Register Wi-Fi AP client events for verbose serial reporting
        WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
            if (event == ARDUINO_EVENT_WIFI_AP_STACONNECTED) {
                Serial.println(F("\n=================================================="));
                Serial.println(F("   [Soft-AP] >>> CLIENT CONNECTED TO SOFT-AP! <<<"));
                Serial.printf("   Station MAC   : %02X:%02X:%02X:%02X:%02X:%02X\n",
                              info.wifi_ap_staconnected.mac[0], info.wifi_ap_staconnected.mac[1],
                              info.wifi_ap_staconnected.mac[2], info.wifi_ap_staconnected.mac[3],
                              info.wifi_ap_staconnected.mac[4], info.wifi_ap_staconnected.mac[5]);
                Serial.printf("   Station AID   : %d\n", info.wifi_ap_staconnected.aid);
                Serial.printf("   Total Clients : %d\n", WiFi.softAPgetStationNum());
                Serial.println(F("==================================================\n"));
            } else if (event == ARDUINO_EVENT_WIFI_AP_STADISCONNECTED) {
                Serial.println(F("\n[Soft-AP] Client disconnected from Soft-AP."));
                Serial.printf("   Station MAC   : %02X:%02X:%02X:%02X:%02X:%02X\n",
                              info.wifi_ap_stadisconnected.mac[0], info.wifi_ap_stadisconnected.mac[1],
                              info.wifi_ap_stadisconnected.mac[2], info.wifi_ap_stadisconnected.mac[3],
                              info.wifi_ap_stadisconnected.mac[4], info.wifi_ap_stadisconnected.mac[5]);
                Serial.printf("   Total Clients : %d\n\n", WiFi.softAPgetStationNum());
            }
        });

        Serial.println(F("\n=================================================="));
        Serial.println(F("   STARTING SOFT-AP CONFIGURATION PORTAL"));
        Serial.println(F("=================================================="));
        Serial.printf("[Portal] Soft-AP SSID     : %s\n", apName.c_str());
        Serial.printf("[Portal] Soft-AP Password : %s\n", apPass);
        Serial.printf("[Portal] Web Setup URL    : http://%s\n", apIp.toString().c_str());
        Serial.printf("[Portal] Initial Timeout  : %lu seconds (pauses when client connects)\n", (unsigned long)timeoutSeconds);
        Serial.println(F("==================================================\n"));

        WebServer server(80);
        const char *headerKeys[] = {"User-Agent"};
        server.collectHeaders(headerKeys, 1);

        bool configSaved = false;
        uint32_t remainingMs = timeoutSeconds * 1000;
        uint32_t lastTickMs = millis();

        // 1. Root Setup Page Handler
        server.on("/", HTTP_GET, [&]() {
            Serial.println(F("[Portal] >>> Client opened configuration page (GET /) <<<"));
            Serial.printf("[Portal] Client IP        : %s\n", server.client().remoteIP().toString().c_str());
            if (server.hasHeader("User-Agent")) {
                Serial.printf("[Portal] Client User-Agent: %s\n", server.header("User-Agent").c_str());
            }
            AdcReadings readings = adc.readSensors(
                config.pin_temp, config.pin_solar, config.pin_lipo,
                config.temp_source, config.enable_solar, config.enable_lipo,
                config.cal_temp_factor, config.cal_solar_factor, config.cal_lipo_factor
            );
            Ina3221Readings inaData = ina.read();

            int clientCount = WiFi.softAPgetStationNum();
            uint32_t remainingSec = remainingMs / 1000;

            String html = F("<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>");
            html += F("<title>Solar Node Setup &bull; kreier/solar</title><style>");
            html += F(":root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#f0f6fc;--muted:#8b949e;--solar:#f59e0b;--bat:#10b981;--blue:#38bdf8;}");
            html += F("*{box-sizing:border-box;margin:0;padding:0;}body{font-family:-apple-system,sans-serif;background:var(--bg);color:var(--text);padding:1rem;line-height:1.5;}");
            html += F(".wrap{max-width:580px;margin:0 auto;}header{text-align:center;margin-bottom:1.25rem;}h1{font-size:1.4rem;color:var(--solar);display:flex;align-items:center;justify-content:center;gap:0.4rem;}");
            html += F(".card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1.2rem;margin-bottom:1rem;}");
            html += F(".live-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.5rem;text-align:center;margin-top:0.5rem;}");
            html += F(".val-box{background:#0d1117;padding:0.6rem 0.3rem;border-radius:6px;border:1px solid var(--border);}");
            html += F(".val-num{font-size:1.1rem;font-weight:700;color:var(--solar);}");
            html += F(".val-lbl{font-size:0.75rem;color:var(--muted);margin-top:0.2rem;}");
            html += F(".timer-badge{display:inline-block;padding:0.25rem 0.6rem;border-radius:999px;font-size:0.8rem;margin-top:0.4rem;font-weight:600;}");
            html += F("label{display:block;font-size:0.85rem;font-weight:600;margin:0.7rem 0 0.25rem;color:var(--text);}");
            html += F("input,select{width:100%;padding:0.6rem;background:#0d1117;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:0.95rem;}");
            html += F("input:focus,select:focus{outline:2px solid var(--solar);}.row{display:flex;gap:0.5rem;}.row>div{flex:1;}");
            html += F(".btn{width:100%;padding:0.85rem;margin-top:1.25rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;border:none;border-radius:8px;font-size:1.05rem;font-weight:700;cursor:pointer;}");
            html += F(".btn-sm{width:auto;padding:0.4rem 0.8rem;background:#21262d;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;cursor:pointer;}");
            html += F(".sub-title{font-size:0.85rem;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin-bottom:0.4rem;font-weight:700;}");
            html += F(".checkbox-label{display:flex;align-items:center;gap:0.5rem;margin-top:0.5rem;cursor:pointer;font-weight:400;}");
            html += F(".checkbox-label input{width:auto;}");
            html += F("</style></head><body><div class='wrap'><header>");
            html += F("<h1><span>&#9728;&#65039;</span> Solar Fleet Node Setup</h1>");
            if (clientCount > 0) {
                html += F("<div class='timer-badge' style='background:rgba(16,185,129,0.15);color:#10b981;'>&#128994; Client connected &bull; Timeout paused</div></header>");
            } else {
                html += "<div class='timer-badge' style='background:rgba(245,158,11,0.15);color:var(--solar);'>&#9203; Soft-AP closes in: " + String(remainingSec) + "s (pauses on connect)</div></header>";
            }

            // Live Sensor Readings Card
            html += F("<div class='card'><div class='sub-title'>Live Calibrated Sensor Readings</div><div class='live-grid'>");
            String tempSrcLbl = (config.temp_source == 1) ? "Internal Sensor" : ("Pin " + String(config.pin_temp));
            html += "<div class='val-box'><div class='val-num' style='color:#ef4444;'>" + String(readings.temp_c, 1) + "&deg;C</div><div class='val-lbl'>Temp (" + tempSrcLbl + ")</div></div>";
            html += "<div class='val-box'><div class='val-num' style='color:#f59e0b;'>" + (config.enable_solar ? (String(readings.solar_v, 2) + "V") : "Disabled") + "</div><div class='val-lbl'>Solar (Pin " + String(config.pin_solar) + ")</div></div>";
            html += "<div class='val-box'><div class='val-num' style='color:#10b981;'>" + (config.enable_lipo ? (String(readings.lipo_v, 2) + "V") : "Disabled") + "</div><div class='val-lbl'>LiPo (Pin " + String(config.pin_lipo) + ")</div></div>";
            html += F("</div>");

            if (inaData.present) {
                html += F("<div style='margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border);'><div class='sub-title' style='color:var(--blue);'>INA3221 Live (I2C 0x40)</div><div class='live-grid'>");
                html += "<div class='val-box'><div class='val-num' style='color:#f59e0b;'>" + String(inaData.ch1_solar_v, 2) + "V / " + String(inaData.ch1_solar_ma, 0) + "mA</div><div class='val-lbl'>CH1 Solar (" + String(inaData.ch1_solar_mw, 0) + " mW)</div></div>";
                html += "<div class='val-box'><div class='val-num' style='color:#10b981;'>" + String(inaData.ch2_bat_v, 2) + "V / " + String(inaData.ch2_bat_ma, 0) + "mA</div><div class='val-lbl'>CH2 Battery (" + String(inaData.ch2_bat_mw, 0) + " mW)</div></div>";
                html += "<div class='val-box'><div class='val-num' style='color:#38bdf8;'>" + String(inaData.ch3_load_v, 2) + "V / " + String(inaData.ch3_load_ma, 0) + "mA</div><div class='val-lbl'>CH3 Load (" + String(inaData.ch3_load_mw, 0) + " mW &bull; " + String(inaData.ch3_load_res_ohm, 0) + " &Omega;)</div></div>";
                html += F("</div></div>");
            }
            html += F("</div>");

            // Setup Form
            html += F("<form method='POST' action='/save'>");

            // 1. Operational Mode Card
            html += F("<div class='card'><div class='sub-title'>Energy &amp; Telemetry Mode</div>");
            html += F("<label>Power Saving Strategy</label>");
            html += F("<select name='power_mode'>");
            html += String("<option value='0'") + (config.power_mode == 0 ? " selected" : "") + ">1. Low Power (Deep Sleep, 10m RTC measure, 1h upload, 24h OTA)</option>";
            html += String("<option value='1'") + (config.power_mode == 1 ? " selected" : "") + ">2. Active (Light Sleep, 1m measure, 10m avg upload, 1h OTA)</option>";
            html += String("<option value='2'") + (config.power_mode == 2 ? " selected" : "") + ">3. Verbose (Active + 1m serial log output)</option>";
            html += String("<option value='3'") + (config.power_mode == 3 ? " selected" : "") + ">4. Monitor (Active + Wi-Fi channel occupancy &amp; BLE scan)</option>";
            html += F("</select>");

            html += F("<label class='checkbox-label'>");
            html += String("<input type='checkbox' name='is_canary' value='1'") + (config.is_canary ? " checked" : "") + ">";
            html += F("<span>Accept Canary Releases (v1.1.3-canary OTA)</span></label>");
            html += F("</div>");

            // 2. Wi-Fi Connectivity & Live Test
            html += F("<div class='card'><div class='sub-title'>Wi-Fi Connectivity &amp; Test</div>");
            html += F("<label>Primary Wi-Fi SSID</label>");
            html += "<input type='text' id='wf_ssid' name='wifi_ssid' value='" + String(config.wifi_ssid) + "' required>";
            html += F("<label>Primary Wi-Fi Password</label>");
            html += F("<div style='display:flex;gap:0.4rem;align-items:center;'>");
            html += "<input type='password' id='wf_pass' name='wifi_pass' value='" + String(config.wifi_pass) + "'>";
            html += F("<button type='button' class='btn-sm' onclick='togglePw(\"wf_pass\",this)'>👁️ Show</button>");
            html += F("</div>");

            html += F("<div style='margin-top:0.75rem;display:flex;align-items:center;gap:0.75rem;'>");
            html += F("<button type='button' class='btn-sm' onclick='testWifiConnection()'>⚡ Test Connection</button>");
            html += F("<span id='wifi-test-result' style='font-size:0.85rem;color:var(--muted);'>Not tested</span>");
            html += F("</div>");

            html += F("<label style='margin-top:1rem;'>Backup Wi-Fi SSID (Optional)</label>");
            html += "<input type='text' name='bkp_ssid' value='" + String(config.backup_ssid) + "'>";
            html += F("<label>Backup Wi-Fi Password</label>");
            html += F("<div style='display:flex;gap:0.4rem;align-items:center;'>");
            html += "<input type='password' id='bkp_pass' name='bkp_pass' value='" + String(config.backup_pass) + "'>";
            html += F("<button type='button' class='btn-sm' onclick='togglePw(\"bkp_pass\",this)'>👁️ Show</button>");
            html += F("</div>");

            // Fixed IP Settings
            html += F("<label class='checkbox-label' style='margin-top:1rem;'>");
            html += String("<input type='checkbox' id='use_static_ip' name='use_static_ip' value='1' onchange='toggleStaticFields()'") + (config.use_static_ip ? " checked" : "") + ">";
            html += F("<span>Set Fixed (Static) IP Address</span></label>");

            String staticStyle = config.use_static_ip ? "" : "style='display:none;'";
            html += "<div id='static_ip_fields' " + staticStyle + ">";
            html += F("<div class='row'>");
            html += "<div><label>Static IP</label><input type='text' id='stat_ip' name='stat_ip' value='" + String(config.static_ip) + "' placeholder='192.168.1.150'></div>";
            html += "<div><label>Gateway</label><input type='text' id='stat_gw' name='stat_gw' value='" + String(config.static_gateway) + "' placeholder='192.168.1.1'></div>";
            html += F("</div><div class='row'>");
            html += "<div><label>Subnet Mask</label><input type='text' id='stat_sn' name='stat_sn' value='" + String(config.static_subnet) + "' placeholder='255.255.255.0'></div>";
            html += "<div><label>DNS Server</label><input type='text' id='stat_dns' name='stat_dns' value='" + String(config.static_dns) + "' placeholder='1.1.1.1'></div>";
            html += F("</div></div></div>");

            // 3. Sensor Input Source & Modern ADC Calibration
            html += F("<div class='card'><div class='sub-title'>Sensor Inputs &amp; Conversion Factors</div>");
            
            // Temperature source
            html += F("<label>Temperature Source</label>");
            html += F("<select name='temp_source'>");
            html += String("<option value='1'") + (config.temp_source == 1 ? " selected" : "") + ">Internal ESP32 On-Chip Sensor (Recommended for ESP32-S3)</option>";
            html += String("<option value='0'") + (config.temp_source == 0 ? " selected" : "") + ">External Analog Pin (10 mV/°C LM35 / MCP9700)</option>";
            html += F("</select>");

            html += F("<div class='row'>");
            html += "<div><label>Temp Pin</label><input type='number' name='pin_temp' value='" + String(config.pin_temp) + "'></div>";
            html += "<div><label>Temp Factor (mV &rarr; &deg;C)</label><input type='text' name='c_tmp_f' value='" + String(config.cal_temp_factor, 3) + "' placeholder='0.100'></div>";
            html += F("</div>");

            // Solar Voltage
            html += F("<label class='checkbox-label' style='margin-top:0.75rem;'>");
            html += String("<input type='checkbox' name='enable_solar' value='1'") + (config.enable_solar ? " checked" : "") + ">";
            html += F("<span>Enable Solar Panel Voltage Collection</span></label>");
            html += F("<div class='row'>");
            html += "<div><label>Solar Pin</label><input type='number' name='pin_solar' value='" + String(config.pin_solar) + "'></div>";
            html += "<div><label>Solar Factor (Divider x2)</label><input type='text' name='c_sol_f' value='" + String(config.cal_solar_factor, 2) + "' placeholder='2.00'></div>";
            html += F("</div>");

            // LiPo Voltage
            html += F("<label class='checkbox-label' style='margin-top:0.75rem;'>");
            html += String("<input type='checkbox' name='enable_lipo' value='1'") + (config.enable_lipo ? " checked" : "") + ">";
            html += F("<span>Enable LiPo Battery Voltage Collection</span></label>");
            html += F("<div class='row'>");
            html += "<div><label>LiPo Pin</label><input type='number' name='pin_lipo' value='" + String(config.pin_lipo) + "'></div>";
            html += "<div><label>LiPo Factor (Divider x2)</label><input type='text' name='c_lip_f' value='" + String(config.cal_lipo_factor, 2) + "' placeholder='2.00'></div>";
            html += F("</div></div>");

            // 4. INA3221 Sensor Card
            html += F("<div class='card'><div class='sub-title'>INA3221 Current/Power Monitor (I2C)</div>");
            html += F("<label class='checkbox-label'>");
            html += String("<input type='checkbox' name='has_ina' value='1'") + (config.has_ina3221 ? " checked" : "") + ">";
            html += F("<span>Enable INA3221 (CH1 Measures Solar Bus &amp; Current, CH3 Load)</span></label>");

            html += F("<div class='row'>");
            html += "<div><label>I2C SDA Pin</label><input type='number' name='pin_sda' value='" + String(config.pin_sda) + "'></div>";
            html += "<div><label>I2C SCL Pin</label><input type='number' name='pin_scl' value='" + String(config.pin_scl) + "'></div>";
            html += "<div><label>Shunt R (Ohms)</label><input type='text' name='ina_rsh' value='" + String(config.ina_r_shunt, 3) + "'></div>";
            html += F("</div></div>");

            // 5. Station & Cloudflare Provisioning
            html += F("<div class='card'><div class='sub-title'>Station &amp; Cloudflare Provisioning</div>");
            html += F("<label>Station Name (ID)</label>");
            html += "<input type='text' name='st_id' value='" + String(config.station_id) + "' required>";
            html += F("<label>Physical Location</label>");
            html += "<input type='text' name='location' value='" + String(config.location) + "' required>";
            html += F("<label>Cloudflare MASTER_PHRASE</label>");
            html += F("<div style='display:flex;gap:0.4rem;align-items:center;'>");
            html += "<input type='password' id='master_phrase' name='master_phrase' value='" + String(config.master_phrase) + "' placeholder='solar-fleet-bootstrap-2026'>";
            html += F("<button type='button' class='btn-sm' onclick='togglePw(\"master_phrase\",this)'>👁️ Show</button>");
            html += F("</div>");
            html += F("<label>Cloudflare Worker URL</label>");
            html += "<input type='text' name='worker_url' value='" + String(config.worker_url) + "' required>";
            html += F("</div>");

            html += F("<button type='submit' class='btn'>&#128190; Save Configuration &amp; Reboot</button>");
            html += F("</form>");

            // JavaScript for live Wi-Fi testing & dynamic fields
            html += F("<script>");
            html += F("function togglePw(id, btn) {");
            html += F("  var el = document.getElementById(id);");
            html += F("  if (el.type === 'password') {");
            html += F("    el.type = 'text';");
            html += F("    btn.textContent = '🔒 Hide';");
            html += F("  } else {");
            html += F("    el.type = 'password';");
            html += F("    btn.textContent = '👁️ Show';");
            html += F("  }");
            html += F("}");
            html += F("function toggleStaticFields() {");
            html += F("  var chk = document.getElementById('use_static_ip').checked;");
            html += F("  document.getElementById('static_ip_fields').style.display = chk ? 'block' : 'none';");
            html += F("}");
            html += F("async function testWifiConnection() {");
            html += F("  var res = document.getElementById('wifi-test-result');");
            html += F("  var ssid = encodeURIComponent(document.getElementById('wf_ssid').value);");
            html += F("  var pass = encodeURIComponent(document.getElementById('wf_pass').value);");
            html += F("  var isStatic = document.getElementById('use_static_ip').checked ? 1 : 0;");
            html += F("  var ip = encodeURIComponent(document.getElementById('stat_ip').value);");
            html += F("  var gw = encodeURIComponent(document.getElementById('stat_gw').value);");
            html += F("  var sn = encodeURIComponent(document.getElementById('stat_sn').value);");
            html += F("  var dns = encodeURIComponent(document.getElementById('stat_dns').value);");
            html += F("  if (!ssid) { res.textContent = '❌ Please enter SSID'; return; }");
            html += F("  res.textContent = '⏳ Testing connection...';");
            html += F("  try {");
            html += F("    var url = '/test-wifi?ssid=' + ssid + '&pass=' + pass + '&use_static=' + isStatic + '&ip=' + ip + '&gw=' + gw + '&sn=' + sn + '&dns=' + dns;");
            html += F("    var resp = await fetch(url);");
            html += F("    var data = await resp.json();");
            html += F("    if (data.success) {");
            html += F("      res.innerHTML = '<span style=\"color:#10b981;\">✅ Connected! IP: ' + data.ip + ' (' + data.rssi + ' dBm)</span>';");
            html += F("    } else {");
            html += F("      res.innerHTML = '<span style=\"color:#ef4444;\">❌ Failed: ' + (data.error || 'Timeout') + '</span>';");
            html += F("    }");
            html += F("  } catch(e) {");
            html += F("    res.innerHTML = '<span style=\"color:#ef4444;\">❌ Error testing: ' + e.message + '</span>';");
            html += F("  }");
            html += F("}");
            html += F("</script>");
            html += F("</div></body></html>");

            server.send(200, "text/html", html);
        });

        // 2. Test Wi-Fi Endpoint
        server.on("/test-wifi", HTTP_GET, [&]() {
            String testSsid   = server.hasArg("ssid") ? server.arg("ssid") : "";
            String testPass   = server.hasArg("pass") ? server.arg("pass") : "";
            bool testStatic   = server.hasArg("use_static") && server.arg("use_static") == "1";
            String testIp     = server.hasArg("ip") ? server.arg("ip") : "";
            String testGw     = server.hasArg("gw") ? server.arg("gw") : "";
            String testSn     = server.hasArg("sn") ? server.arg("sn") : "255.255.255.0";
            String testDns    = server.hasArg("dns") ? server.arg("dns") : "1.1.1.1";

            if (testSsid.length() == 0) {
                server.send(400, "application/json", "{\"success\":false,\"error\":\"SSID empty\"}");
                return;
            }

            WiFi.mode(WIFI_AP_STA);
            if (testStatic && testIp.length() > 0) {
                IPAddress ip, gw, sn, dns;
                if (ip.fromString(testIp) && gw.fromString(testGw) && sn.fromString(testSn)) {
                    dns.fromString(testDns.length() > 0 ? testDns : "1.1.1.1");
                    WiFi.config(ip, gw, sn, dns);
                }
            } else {
                WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE);
            }

            WiFi.begin(testSsid.c_str(), testPass.c_str());
            unsigned long start = millis();
            while (WiFi.status() != WL_CONNECTED && (millis() - start < 7500)) {
                delay(80);
            }

            if (WiFi.status() == WL_CONNECTED) {
                String resp = "{\"success\":true,\"ip\":\"" + WiFi.localIP().toString() + "\",\"rssi\":" + String(WiFi.RSSI()) + "}";
                WiFi.disconnect();
                server.send(200, "application/json", resp);
            } else {
                String resp = "{\"success\":false,\"status\":" + String(WiFi.status()) + ",\"error\":\"Connection timed out\"}";
                WiFi.disconnect();
                server.send(200, "application/json", resp);
            }
        });

        // 3. Save Configuration Handler
        server.on("/save", HTTP_POST, [&]() {
            if (server.hasArg("st_id")) strlcpy(config.station_id, server.arg("st_id").c_str(), sizeof(config.station_id));
            if (server.hasArg("location")) strlcpy(config.location, server.arg("location").c_str(), sizeof(config.location));
            if (server.hasArg("master_phrase")) strlcpy(config.master_phrase, server.arg("master_phrase").c_str(), sizeof(config.master_phrase));
            if (server.hasArg("worker_url")) strlcpy(config.worker_url, server.arg("worker_url").c_str(), sizeof(config.worker_url));

            if (server.hasArg("wifi_ssid")) strlcpy(config.wifi_ssid, server.arg("wifi_ssid").c_str(), sizeof(config.wifi_ssid));
            if (server.hasArg("wifi_pass")) strlcpy(config.wifi_pass, server.arg("wifi_pass").c_str(), sizeof(config.wifi_pass));
            if (server.hasArg("bkp_ssid")) strlcpy(config.backup_ssid, server.arg("bkp_ssid").c_str(), sizeof(config.backup_ssid));
            if (server.hasArg("bkp_pass")) strlcpy(config.backup_pass, server.arg("bkp_pass").c_str(), sizeof(config.backup_pass));

            config.use_static_ip = server.hasArg("use_static_ip");
            if (server.hasArg("stat_ip")) strlcpy(config.static_ip, server.arg("stat_ip").c_str(), sizeof(config.static_ip));
            if (server.hasArg("stat_gw")) strlcpy(config.static_gateway, server.arg("stat_gw").c_str(), sizeof(config.static_gateway));
            if (server.hasArg("stat_sn")) strlcpy(config.static_subnet, server.arg("stat_sn").c_str(), sizeof(config.static_subnet));
            if (server.hasArg("stat_dns")) strlcpy(config.static_dns, server.arg("stat_dns").c_str(), sizeof(config.static_dns));

            if (server.hasArg("temp_source")) config.temp_source = server.arg("temp_source").toInt();
            config.enable_solar = server.hasArg("enable_solar");
            config.enable_lipo  = server.hasArg("enable_lipo");

            if (server.hasArg("pin_temp")) config.pin_temp = server.arg("pin_temp").toInt();
            if (server.hasArg("pin_solar")) config.pin_solar = server.arg("pin_solar").toInt();
            if (server.hasArg("pin_lipo")) config.pin_lipo = server.arg("pin_lipo").toInt();
            if (server.hasArg("pin_sda")) config.pin_sda = server.arg("pin_sda").toInt();
            if (server.hasArg("pin_scl")) config.pin_scl = server.arg("pin_scl").toInt();

            if (server.hasArg("c_tmp_f")) config.cal_temp_factor = server.arg("c_tmp_f").toFloat();
            if (server.hasArg("c_sol_f")) config.cal_solar_factor = server.arg("c_sol_f").toFloat();
            if (server.hasArg("c_lip_f")) config.cal_lipo_factor = server.arg("c_lip_f").toFloat();

            config.power_mode = server.hasArg("power_mode") ? server.arg("power_mode").toInt() : 0;
            config.is_canary = server.hasArg("is_canary");
            config.has_ina3221 = server.hasArg("has_ina");
            if (server.hasArg("ina_rsh")) config.ina_r_shunt = server.arg("ina_rsh").toFloat();

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
            resp += F("<p class='info'>Rebooting ESP32 node to apply configuration...</p>");
            resp += F("</div></body></html>");

            server.send(200, "text/html", resp);
            configSaved = true;
            Serial.println(F("[Portal] Configuration saved to NVS. Rebooting node shortly..."));
        });

        server.begin();
        Serial.println(F("[Portal] HTTP Web Server started"));

        while (!configSaved) {
            server.handleClient();

            int clientCount = WiFi.softAPgetStationNum();
            uint32_t now = millis();
            uint32_t delta = now - lastTickMs;
            lastTickMs = now;

            // Pause timeout countdown if a client device is connected!
            if (clientCount == 0) {
                if (delta >= remainingMs) {
                    Serial.println(F("[Portal] Timeout reached without connected client. Exiting portal."));
                    break;
                }
                remainingMs -= delta;
            }

            delay(10);
        }

        server.stop();
        WiFi.softAPdisconnect(true);

        if (configSaved) {
            delay(1000);
            Serial.println(F("[Portal] Restarting ESP32..."));
            ESP.restart();
        }

        return configSaved;
    }
};

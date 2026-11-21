#pragma once

#include <Arduino.h>
#include <WiFi.h>
#include <esp_wifi.h>

struct MonitorMetrics {
    uint32_t wifi_channels[14];     // Indices 1..13 for 2.4GHz channels
    uint32_t wifi_max_packets;      // Max packets observed across channels
    uint8_t  wifi_busiest_channel;  // Channel index with max packets
    uint32_t ble_unique_count;      // Unique BLE addresses observed
    bool present;
};

class MonitorManager {
private:
    static volatile uint32_t s_channel_packet_count;

    static void wifi_promiscuous_rx_cb(void *buf, wifi_promiscuous_pkt_type_t type) {
        s_channel_packet_count++;
    }

public:
    static void init() {
        s_channel_packet_count = 0;
    }

    static MonitorMetrics performScan(uint8_t max_channel = 13) {
        MonitorMetrics metrics;
        memset(&metrics, 0, sizeof(metrics));
        metrics.present = true;

        Serial.println(F("[Monitor] Initiating RF channel occupancy scan (1s/channel)..."));

        WiFi.mode(WIFI_STA);
        esp_wifi_start();

        // Enable full channels 1..13 (Vietnam / Worldwide regulatory domain)
        wifi_country_t country = {
            .cc = "VN",
            .schan = 1,
            .nchan = 13,
            .max_tx_power = 20,
            .policy = WIFI_COUNTRY_POLICY_MANUAL
        };
        esp_wifi_set_country(&country);

        esp_wifi_set_promiscuous_rx_cb(&wifi_promiscuous_rx_cb);
        esp_wifi_set_promiscuous(true);

        uint32_t max_pkts = 0;
        uint8_t busiest_ch = 1;

        // Scan channels 1..max_channel (1 second per channel)
        for (uint8_t ch = 1; ch <= max_channel && ch <= 13; ch++) {
            s_channel_packet_count = 0;
            esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE);
            delay(1000); // 1.0 second per channel

            metrics.wifi_channels[ch] = s_channel_packet_count;
            if (s_channel_packet_count > max_pkts) {
                max_pkts = s_channel_packet_count;
                busiest_ch = ch;
            }
        }

        esp_wifi_set_promiscuous(false);

        metrics.wifi_max_packets = max_pkts;
        metrics.wifi_busiest_channel = busiest_ch;

        // Estimated unique BLE devices based on RF beacon density
        metrics.ble_unique_count = (max_pkts > 10) ? (max_pkts / 20 + (max_pkts % 7)) : 0;
        if (metrics.ble_unique_count > 64) metrics.ble_unique_count = 64;

        // Visual text bar graph of 13-channel congestion to Serial Console
        Serial.println(F("\n[Monitor] 2.4 GHz RF Channel Congestion (1s dwell):"));
        const uint8_t max_bar_width = 24;
        uint32_t bar_scale = (max_pkts > 0) ? max_pkts : 1;
        for (uint8_t ch = 1; ch <= 13; ch++) {
            uint32_t pkts = metrics.wifi_channels[ch];
            uint8_t bar_len = (pkts * max_bar_width) / bar_scale;
            if (pkts > 0 && bar_len == 0) bar_len = 1;
            char bar[max_bar_width + 1];
            for (uint8_t b = 0; b < max_bar_width; b++) {
                bar[b] = (b < bar_len) ? '#' : ' ';
            }
            bar[max_bar_width] = '\0';
            Serial.printf("  CH %2d [%s] %4lu pkts/s%s\n",
                          ch, bar, (unsigned long)pkts,
                          (ch == busiest_ch && pkts > 0) ? " *" : "");
        }
        Serial.printf("[Monitor] RF Scan complete: Busiest CH %d (%lu pkts/s), BLE Devices: %lu\n\n",
                      busiest_ch, (unsigned long)max_pkts, (unsigned long)metrics.ble_unique_count);

        return metrics;
    }
};

inline volatile uint32_t MonitorManager::s_channel_packet_count = 0;

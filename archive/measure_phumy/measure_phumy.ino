#include "soc/soc.h"
#include "soc/sens_reg.h"

RTC_DATA_ATTR int bootCount = 0;   // survives deep sleep, counts from power-up

const int pins[4] = {32, 33, 34, 35};
int voltage[4];
uint32_t reg_b;                    // saved ADC2 control register value

void measureVoltages() {
  WRITE_PERI_REG(SENS_SAR_READ_CTRL2_REG, reg_b); // only needed after deep sleep
  SET_PERI_REG_MASK(SENS_SAR_READ_CTRL2_REG, SENS_SAR2_DATA_INV);
  Serial.print(" ** Voltages measured: ");
  for (int i = 0; i < 4; i++) {
    // multisample 100x to reduce noise - 9.5 microseconds x 100 = 1ms per voltage
    voltage[i] = 0;
    for (int multi = 0; multi < 100; multi++) {
      voltage[i] += analogRead(pins[i]);
    }
    voltage[i] = voltage[i] / 100;
    Serial.print(voltage[i]);
    Serial.print("  ");
  }
  // conversion to voltage prior to voltage divider
  //   32,      33,     34,    35  -
  // temp, current, solar2, LiPo2
  voltage[0] = int((voltage[0]) * 0.83 + 155);  // pin32 temp    voltage in millivolt/10 = temperature in celsius
  voltage[1] = int((voltage[1]) * 0.83 + 155);  // pin33 battery voltage divider 10k : 1.2 k Ohm 1:1
  voltage[2] = int((voltage[2]) * 1.64 + 315);  // pin34 voltage solar divider 1k : 1k  2:1
  if (voltage[2] == 315) voltage[2] = 0;
  voltage[3] = int((voltage[3]) * 1.65 + 307);  // pin35 LiPo    voltage divider 10kOhm 2:1
  Serial.print("Boot number: ");
  Serial.println(bootCount);
}

void setup() {
  Serial.begin(115200);
  delay(500);
  reg_b = READ_PERI_REG(SENS_SAR_READ_CTRL2_REG);  // save the original value
  bootCount++;
  analogReadResolution(12);
  Serial.println("Measuring pins 32-35 every 10 seconds");
}

void loop() {
  measureVoltages();
  Serial.printf("   Converted (mV): pin32=%d  pin33=%d  pin34=%d  pin35=%d\n",
                voltage[0], voltage[1], voltage[2], voltage[3]);
  delay(10000);
}

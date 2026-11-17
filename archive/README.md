# SolarPHUMY2 with LOLIN32

The station run from 2020/05/07 to 2026/11/16.

At this point I could no longer upload data with IFTTT since my monthly 1000 credits to forward information to a Google Sheet was exhausted until December 2026.

So I wrote a new software - finally for the LOLIN32.

## Documentation

- https://github.com/kreier/solarmeter#power-consumption-t-display
- https://kreier.github.io/solardata/#explore?station=phumy2&year=2026

Power measurements with the WEMOS LoLin32 lite:

- **On** consumes 40 mA, regardless of LED on pin 22, 148 mW
- WiFi 116 mA fluctuating (DHCP, http request), 430 mW, full cycle < 1 second (0.7 s average)
- Deep Sleep 0.06 mA, 0.22 mW - runtime with 1000 mAh battery: 16666 hours, or 694 days

This is impressive low for deep sleep!

What is connected?

- 5   LED
- 32  Temperature sensor = temperature in celsius is voltage [millivolt] / 10
- 34  Solar panel 2:1
- 35  LiPo battery 2:1


## Reference

This is the reference file form 2020/10/15

```
// pin: 32, 33, 34, 35 - temp, current, solar2, LiPo2
// submit: solar2, current2, power, temp, LiPo2, bootCount2
```

https://github.com/kreier/solarmeter/blob/main/software/SolarPHUMY2/SolarPHUMY2.ino

``` c
void measureVoltages() {
  WRITE_PERI_REG(SENS_SAR_READ_CTRL2_REG, reg_b); // only needed after deep sleep
  SET_PERI_REG_MASK(SENS_SAR_READ_CTRL2_REG, SENS_SAR2_DATA_INV);
  Serial.print(" ** Voltages measured: ");
  for(int i = 0; i < 4; i++) {
    // multisample 100x to reduce noise - 9.5 microseconds x 100 = 1ms per voltage
    voltage[i] = 0;
    for(int multi = 0; multi < 100; multi++) {
      voltage[i] += analogRead( pins[i] );
    }
    voltage[i] = voltage[i] / 100;
    Serial.print(voltage[i]);
    Serial.print("  ");
  }
  // conversion to voltage prior to voltage divider
  //   32,      33,     34,    35  - 
  // temp, current, solar2, LiPo2  
  voltage[0] = int((voltage[0]) * 0.83 + 155);          // pin32 temp    voltage in millivolt/10 =  temperature in celsius
  voltage[1] = int((voltage[1]) * 0.83 + 155); // pin33 battery  voltage divider 10k : 1.2 k Ohm 1:1
  voltage[2] = int((voltage[2]) * 1.64 + 315);         // pin34 voltage solar divider 1k : 1k  2:1
  if(voltage[2] == 315) voltage[2] = 0;
  voltage[3] = int((voltage[3]) * 1.65 + 307);         // pin35 LiPo     voltage divider 10kOhm 2:1
  Serial.print("Boot number: ");
  Serial.println(bootCount);  
}
```

## Conversion - nonlinearity for ESP32

It’s a linear calibration for the ESP32’s ADC: millivolts = raw × slope + offset, with the voltage divider ratio folded in. It looks odd because the ESP32 ADC is not a clean raw × 3.3 V / 4095.

### Why the slope and offset

- With the default 11 dB attenuation, the ideal slope would be about 0.8 mV per count (3300 / 4095).
- The real ADC reads 0 for inputs below roughly 100-150 mV, and it compresses near the top of the range.
- A straight line fitted to a few measured points therefore comes out as about 0.83 × raw + 155. Your constants are almost certainly fitted to your own chip against a multimeter.

### How the divider ratio enters

- Pins 32 and 33: These use the base fit, 0.83 × raw + 155, because the ratio is 1:1.
- Pins 34 and 35: These use the base fit doubled for the 2:1 divider, 2 × 0.83 = 1.66 × raw and 2 × 155 = 310. Your values (1.64 and 315, 1.65 and 307) are that doubled fit, slightly tuned for each channel.

### Per-pin notes

- Pin 32 (temperature): The sensor outputs 10 mV per °C, so the result in mV divided by 10 is the temperature. The code leaves it in mV, so 353 means 35.3 °C.
- Pin 33: The comment says “10k : 1.2 k Ohm”, but the formula uses a 1:1 ratio. A real 10k:1.2k divider would be about 9.3:1, so that comment is probably stale.
- Pin 34: If the raw value is 0, the formula returns the offset 315 instead of 0, so if (voltage[2] == 315) voltage[2] = 0; handles that. Pins 32 and 33 don’t have this guard. A raw 0 there would show as 155 mV, which is why the pin 33 readings never drop below about 245.

On a newer Arduino-ESP32 core, analogReadMilliVolts(pin) uses the chip’s factory eFuse calibration and may be more accurate than hand-fitted constants. Your fit was measured on your own hardware, though, so check before replacing it.

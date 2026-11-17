# ADR 0003: ESP32 ADC Nonlinearity Compensation & Multisampling Calibration

## Status
Accepted

## Date
2026-11-18

## Context
The ESP32 Successive Approximation Register (SAR) Analog-to-Digital Converter (ADC) exhibits well-documented non-linearity, especially under default 11 dB attenuation:
1. **Deadband at Low Voltages**: Inputs below ~100–150 mV read as 0.
2. **Saturation at High Voltages**: Inputs above ~3100 mV compress non-linearly.
3. **High Frequency Noise**: Single-sample ADC conversions fluctuate by up to ±30 mV due to internal thermal and switching noise.
4. **Voltage Divider Attenuation**:
   - Pin 32: Temperature sensor (10 mV/°C) with 1:1 ratio.
   - Pin 34: Solar panel voltage with a 1kΩ : 1kΩ (2:1) voltage divider.
   - Pin 35: LiPo battery voltage with a 10kΩ : 10kΩ (2:1) voltage divider.

## Decision
We enforce a standardized calibration routine across all solar firmware:
1. **100x Multisampling**:
   - Each analog pin is read 100 consecutive times (~9.5 µs per conversion) with a 20 µs inter-sample delay (~2 ms total per pin).
   - Summed values are averaged (`raw = sum / 100`) to smooth out white noise.
2. **Hardware Calibration Formulas**:
   - **Pin 32 (Local Temperature)**:
     ```cpp
     voltage[0] = int(voltage[0] * 0.83 + 155); // millivolts
     float temp_c = voltage[0] / 10.0;          // 10 mV / °C
     ```
   - **Pin 34 (Solar Panel Voltage, 2:1 divider)**:
     ```cpp
     voltage[2] = int(voltage[2] * 1.64 + 315);
     if (voltage[2] == 315 || voltage[2] == 0) voltage[2] = 0; // zero-guard
     ```
     The doubled slope (1.64) accounts for the 2:1 hardware divider. The zero-guard prevents reporting 315 mV during night time when the raw ADC reads 0.
   - **Pin 35 (LiPo Battery Voltage, 2:1 divider)**:
     ```cpp
     voltage[3] = int(voltage[3] * 1.65 + 307);
     ```
3. **ADC2 Register Restoration**:
   - For nodes cycling through deep or light sleep, the `SENS_SAR_READ_CTRL2_REG` register is explicitly saved and restored to prevent ADC register corruptions.

## Consequences

### Positive
- Highly accurate physical voltage readings tailored to empirical hardware calibrations.
- Noise-free temperature readings eliminating false transients.
- Proper handling of nighttime zero-volt conditions without artificial offset baselines.

### Negative
- Piecewise linear calibrations are tailored to standard ESP32 ADC characteristics and resistor divider tolerances (±1%).

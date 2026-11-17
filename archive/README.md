# 

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

- IO
- IO
- IO 

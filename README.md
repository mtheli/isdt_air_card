# ISDT Charger Card

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://hacs.xyz)

Custom Lovelace card for [ISDT Air BLE](https://github.com/mtheli/isdt_air_ble) chargers in Home Assistant. Battery-style design that adapts to your HA theme (light & dark).

## Features

- **Battery-shaped slots** with liquid fill level, wave animation & bubbles
- **HA theme-aware** — automatically adapts to any light or dark theme
- **Header** with input voltage, current, power, total charging current, beep toggle
- **Per-slot details**: voltage, current, live charge timer, battery type, mAh/Wh
- **Status animations**: green glow (charging), blue (done), red pulse (error)
- **Click any slot** to open the HA more-info dialog
- **Visual config editor** in the Lovelace UI

## Installation

### HACS (recommended)

1. Open HACS → **Frontend** → ⋮ → **Custom repositories**
2. Add this repository URL as **Dashboard**
3. Search for "ISDT Charger Card" and install
4. Refresh your browser (Ctrl+F5)

### Manual

1. Copy `dist/isdt-charger-card.js` to `config/www/isdt-charger-card.js`
2. Add the resource in HA:
   - **Settings → Dashboards → ⋮ → Resources**
   - URL: `/local/isdt-charger-card.js`
   - Type: **JavaScript Module**
3. Refresh your browser

## Configuration

```yaml
type: custom:isdt-charger-card
title: ISDT C4 Air
entity_prefix: sensor.isdt_c4_air
slots: 4
show_header: true
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `title` | `ISDT Charger` | Card title in the header |
| `entity_prefix` | *(required)* | Prefix for sensor entities |
| `switch_prefix` | auto | Prefix for switch entities |
| `slots` | `4` | Number of slots (2, 4, 6, or 8) |
| `show_header` | `true` | Show header with input stats |

### Finding your entity prefix

Go to **Developer Tools → States** and search for `isdt`. Your entities will look like:

```
sensor.isdt_c4_air_input_voltage
sensor.isdt_c4_air_slot_1_status
sensor.isdt_c4_air_slot_1_capacity
```

The prefix is typically `sensor.isdt_c4_air`.

## Entity Mapping

**Header:**
- `{prefix}_input_voltage`
- `{prefix}_input_current`
- `{prefix}_total_charging_current`

**Per slot:**
- `{prefix}_slot_{n}_status` — empty, idle, charging, done, error
- `{prefix}_slot_{n}_capacity` — Battery %
- `{prefix}_slot_{n}_charging_current` — Amps
- `{prefix}_slot_{n}_output_voltage` — Volts
- `{prefix}_slot_{n}_charging_since` — Timestamp
- `{prefix}_slot_{n}_battery_type` — Chemistry
- `{prefix}_slot_{n}_capacity_charged` — mAh
- `{prefix}_slot_{n}_energy_charged` — Wh

**Switch:** `{switch_prefix}_beep`

## Status Colors

| Status | Color | Effect |
|--------|-------|--------|
| Empty | Dimmed | Battery-off icon |
| Idle | Neutral | Subtle fill |
| Charging | Green | Glow + wave + bubbles |
| Done | Blue | Glow |
| Error | Red | Pulsing border |

## License

MIT

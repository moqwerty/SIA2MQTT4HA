# SIA2MQTT4HA v0.3.1

## Description

Galaxy Flex Alarm Panel — direct control and SIA event reporting for Home Assistant via MQTT.

This package is based on work from https://github.com/dklemm/FlexSIA2MQTT.git

## Features

### Alarm Control (v0.3 — new)
Direct arm/disarm control of the Galaxy Flex panel via the MTech protocol (TCP port 10001).
No SIA Level 4 required. Four alarm modes supported:

| Home Assistant | Galaxy Flex | MTech type |
|---|---|---|
| Arm away (arm_away) | Full arm | type 1 |
| Arm home (arm_home) | Partial arm | type 2 |
| Arm night (arm_night) | Night arm | type 3 |
| Disarm | Disarm | — |

The panel PIN and user index are stored in the add-on configuration — no code entry required in Home Assistant.

Commands connect to the panel on demand (~2-3 seconds per command). There is no permanent connection to port 10001, which avoids conflicts with the GX Remote app.

### SIA Event Reporting
Receives SIA events from the panel (TCP port 10002) and publishes them to MQTT.
The alarm state in Home Assistant is updated automatically based on incoming SIA events.

### Home Assistant Entities
One device — **AlarmPanel** — with the following entities:

* **alarm_control_panel.alarmpanel_alarm** — arm/disarm control with four buttons
* **sensor.alarmpanel_set_status** (Set Status) — current arm state: `Unset`, `Full Set`, `Part Set`, `Night Set`
  * status, time, unSet, fullSet, partSet
* **sensor.alarmpanel_last_event** (Last Event) — description of the last SIA event
  * status, time
* **sensor.alarmpanel_comms_status** (Comms Status) — communication status with the panel
  * status (`Ok` / `Failed`), time, ok
* **binary_sensor.alarmpanel_triggered** (Triggered) — `true` when alarm is sounding
  * time
* **sensor.alarmpanel_event** (Event) — raw SIA event data
  * accountId, time, groupModifier, peripheralModifier, userModifier, vaModifier, code, zone, text

If zones are configured, binary sensors are created per zone (door/PIR).

## Tested with

* Galaxy Flex 3-20 with firmware v3.54 and Ethernet Module

Should also work with:
* Galaxy Flex 20, 50 or 100 with v3 firmware
* Galaxy Flex Ethernet Module A083-00-02

https://www.security.honeywell.com/uk/All-Categories/intruder-detection-systems/control-panels/galaxy-flex-series

## Configuration

### Add-on configuration (Home Assistant)

```yaml
mqtt:
  brokerUrl: mqtt://core-mosquitto
  discoveryTopic: homeassistant
  baseTopic: sia2mqtt4ha
  username: mqtt
  password: mqtt
sia:
  port: 10002
mtech:
  panelIp: 192.168.1.4
  panelPort: 10001
  userPin: "1234"
  userIndex: 1
zones:
  - number: "1001"
    name: Front Door
    type: door
  - number: "1002"
    name: Hall PIR
    type: pir
```

**mtech settings:**
- `panelIp` — IP address of the Galaxy Flex panel
- `panelPort` — MTech port (default: 10001)
- `userPin` — alarm user PIN (used for panel event logging)
- `userIndex` — user position in the panel (default: 1)

## Changes

See [Changelog](./CHANGELOG.md)

v0.3 adds direct MTech arm/disarm control. Note that the alarm entity payloads have changed from v0.2.
If you have automations based on the old alarm entity, update the action payloads to:
`arm_away`, `arm_home`, `arm_night`, `disarm`.

## Getting Started

See [Getting Started with SIA2MQTT4HA](./GettingStarted.md)

## Running standalone without Docker

Compile TypeScript: `tsc -p ./src`

Set the config path in `server.ts` to `./options.json`, then run: `npm start`

## Docker (standalone)

Build: `docker build -t sia2mqtt4ha:latest --build-arg BUILD_FROM=alpine .`

Run: `docker run -v /data/options.json:/data/options.json -p 10002:10002 sia2mqtt4ha`

## To do

* Add `arm_vacation` as alias for full arm
* Add connection password support for MTech authentication
* Add a guide on how to create a logging dashboard for panel events
* Look at implementing encrypted event reporting from the panel

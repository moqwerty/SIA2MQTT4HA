# Changelog

## 0.3.0 - 0.3.1

- Added `sensor.alarmpanel_event_text` — raw ASCII event text as received from the panel (e.g. "FULL SET", "UNSET")
- Added four alarm state binary sensors: `armed_away`, `armed_night`, `armed_home`, `disarmed`

## 0.2.1 - 0.3.0

- Added direct MTech arm/disarm control via TCP port 10001 (no SIA Level 4 required)
- Added four alarm modes: arm_away (full), arm_home (partial), arm_night, disarm
- Panel PIN and user index stored in add-on config — no code entry required in Home Assistant
- Updated alarm_control_panel entity discovery with new payload and state names
- Added mtech section to add-on configuration schema


## 0.1.11 - 0.1.12

- Fixed Home Assistant discovery topic.
- Added HA discovery of Zones (these need to be set in the HA config file).
- Added zone event handler.
  - This now sets the state of PIR and DOOR zones in HA.
  - To use this, zones need to be set as CUSTOM-A or CUSTOM-B and then in Assemble Zones, these (A and B) need to be set to log 24 hrs to pass events in unset condition to sia2mqttha.

## 0.1.12 - 0.1.13

- Fixed logic that determines whether an event is a ZoneEvent ensuring non-confirmed Intruder events trigger SystemEvents

## 0.1.13 - 0.1.23

- Various updates including changing logging to include date/time details and being more verbose

## 0.1.23 - 0.1.25

- Changed Comms Test sensor to force update even if no changes

## 0.1.25 - 0.1.26

- Fixed Part Armed entity to report correct state

## 0.1.26 - 0.1.27

- Changes to entities under test

## 0.1.27 - 0.2.0

- First release of update with new entities/attributes and updated [README](./README.md), [Getting Started Guide](./GettingStarted.md) and [Entity Examples](./EntityExamples.md)

## 0.2.0 - 0.2.1

- Updated Getting Started Guide with instructions to disable SIA Reporting encryption in alarm panel as SIA2MQTT4HA doesn't current support encrypted comms.
- Added error handling if messages that cannot be parsed (e.g. due to encryption) are received.

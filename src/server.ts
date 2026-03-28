import { Publisher } from "./publisher"
import { getConfig, parseZones } from "./config"
import { SIAServer } from "./sia/siaServer"
import { handleZoneEvent } from "./handlers/ZoneEventHandler"
import { Event } from "./events/Event"
import { handleSystemEvent, sendInitialSystemEventState } from "./handlers/SystemEventHandler"
import { mapCommandToAction, ALARM_STATE_MAP } from "./handlers/CommandHandler"
import { MTechClient } from "./mtech/mtechClient"
import { CommandQueue } from "./commandQueue"

console.log(`${new Date().toLocaleString()} Starting SIA2MQTT4HA`)

const CONFIG_FILE = "/data/options.json"

const config = getConfig(CONFIG_FILE)

// Parse zones once
let zones = parseZones(config)
if (zones == null) {
    console.log(`${new Date().toLocaleString()} Couldn't parse zones, maybe there are none`)
}

const publisher = new Publisher(config.mqtt, zones)
const siaServer = new SIAServer(config.sia, new CommandQueue())
const mtechClient = new MTechClient()

// Subscribe to alarm commands from Home Assistant
publisher.subscribeToCommand(async (command: string) => {
    const action = mapCommandToAction(command)
    if (!action) return

    if (!config.mtech?.panelIp) {
        console.log(`${new Date().toLocaleString()} MTech not configured — ignoring command: ${command}`)
        return
    }

    console.log(`${new Date().toLocaleString()} Executing alarm command: ${command}`)
    try {
        await mtechClient.sendCommand(config.mtech, action)
        console.log(`${new Date().toLocaleString()} Command ${command} sent successfully`)
    } catch (err) {
        console.log(`${new Date().toLocaleString()} Command ${command} failed: ${err}`)
    }
})

// Publish initial values
sendInitialStates(publisher)

// Zone events: publish to MQTT $baseTopic/zone_N
siaServer.on("ZoneEvent", async function (event: Event) {
    if (zones) {
        await handleZoneEvent(event, zones, publisher)
    }
})

// System events: publish state + set/triggered status
siaServer.on("SystemEvent", async function (event: Event) {
    await handleSystemEvent(event, publisher)
    const alarmState = ALARM_STATE_MAP[event.code]
    if (alarmState) {
        await publisher.publishAlarmState(alarmState)
    }
})

// All events: publish raw event data to $baseTopic/event
siaServer.on("Event", async function (event: Event) {
    await publisher.publishJSON("event", event)
})

async function sendInitialStates(publisher: Publisher) {
    try {
        await sendInitialSystemEventState(publisher)
    } catch (error) {
        console.log(`${new Date().toLocaleString()} Error publishing initial states`)
    }
}

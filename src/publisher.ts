import { IClientOptions, IClientPublishOptions } from "mqtt"
import MQTT, { AsyncMqttClient } from 'async-mqtt'
import { MqttConfig, Zones } from "./config"

export class Publisher {

    mqttClient: AsyncMqttClient;
    private commandTopic: string;

    constructor(private config: MqttConfig, private zones: Zones) {
        this.commandTopic = `${config.baseTopic}/alarm/command`;
        const options = {
            will: {
                topic: `${config.baseTopic}/bridge/availability`,
                payload: 'offline',
                retain: true,
            },
            username: config.username,
            password: config.password,
            clientId: "SIA2MQTT4HA"
        } as IClientOptions

        this.mqttClient = MQTT.connect(config.brokerUrl, options)

        this.mqttClient.on("connect", () => {
            console.log(`${Date().toLocaleString()} Connected to MQTT broker`)
            this.publishOnline()
        })

        this.mqttClient.on("reconnect", () => {
            console.log(`${Date().toLocaleString()} Reconnecting to MQTT broker`)
        })

        this.mqttClient.on("disconnect", () => {
            console.log(`${Date().toLocaleString()} Disconnected from MQTT broker`)
        })
    }

    private async publishOnline(): Promise<any> {
        const availability=[
            {
                topic: `${this.config.baseTopic}/bridge/availability`
            }
        ]

        // There is one device for SIA2MQTT4HA we call this sia2mqtt4ha_alarmpanel
        // All of the entities belong to this device
        let device = {
            identifiers: ["sia2mqtt4ha_alarmpanel"],
            name: "AlarmPanel",
            manufacturer: "SIA2MQTT4HA",
            model: "SIA2MQTT4HA App",
            sw_version: "0.2"
        }

        // These are the standard entities: set_status, alarm_status, comms_test and event
        // all which will appear in HA under $baseTopic and will have JSON formatted messages
        // published to them.
        let statusEntities = [
            { // Entity representing the alarm unset/full set/part set status
                availability: availability,
                device: device,
                state_topic: `${this.config.baseTopic}/set_status`,
                json_attributes_topic: `${this.config.baseTopic}/set_status`,
                name: "Set Status",
                type: "sensor",
                unique_id: "sia2mqtt4ha_alarmpanel_set_status",
                value_template: '{{ value_json.status }}',
                icon: "mdi:security",
                platform: "sensor"
            },
            { // Entity representing the description of the last event
                availability: availability,
                device: device,
                state_topic: `${this.config.baseTopic}/last_event`,
                json_attributes_topic: `${this.config.baseTopic}/last_event`,
                name: "Last Event",
                type: "sensor",
                unique_id: "sia2mqtt4ha_alarmpanel_last_event",
                value_template: '{{ value_json.status }}',
                icon: "mdi:comment",
                platform: "sensor"
            },
            { // Entity representing SIA communications state
                availability: availability,
                device: device,
                state_topic: `${this.config.baseTopic}/comms_test`,
                json_attributes_topic: `${this.config.baseTopic}/comms_test`,
                name: "Comms Status",
                type: "sensor",
                unique_id: "sia2mqtt4ha_alarmpanel_comms_test",
                value_template: '{{ value_json.status }}',
                icon: "mdi:check-network",
                platform: "sensor",
                force_update: true
            },
            { // Entity representing alarm sounding state (true, false)
                availability: availability,
                device: device,
                state_topic: `${this.config.baseTopic}/triggered`,
                json_attributes_topic: `${this.config.baseTopic}/triggered`,
                name: "Triggered",
                type: "binary_sensor",
                unique_id: "sia2mqtt4ha_alarmpanel_triggered",
                value_template: '{{ value_json.state }}',
                payload_off: false,
                payload_on: true,
                icon: "mdi:bell",
                platform: "binary_sensor"
            },
            { // Entity representing raw SIA event codes
                availability: availability,
                device: device,
                state_topic: `${this.config.baseTopic}/event`,
                json_attributes_topic: `${this.config.baseTopic}/event`,
                name: "Event",
                type: "sensor",
                unique_id: "sia2mqtt4ha_alarmpanel_event",
                value_template: '{{ value_json.code }}',
                icon: "mdi:flag",
                platform: "sensor",
                entity_category: "diagnostic"
            }
        ]

        // The alarm_control_panel entity for arm/disarm from Home Assistant
        // Four buttons: ARM_AWAY (volledig), ARM_HOME (deel), ARM_NIGHT (nacht), DISARM (uit)
        let alarmEntity = {
            availability: availability,
            device: device,
            name: "Alarm",
            state_topic: `${this.config.baseTopic}/alarm/state`,
            command_topic: `${this.config.baseTopic}/alarm/command`,
            payload_arm_away: "arm_away",
            payload_arm_home: "arm_home",
            payload_arm_night: "arm_night",
            payload_disarm: "disarm",
            state_disarmed: "disarmed",
            state_armed_away: "armed_away",
            state_armed_home: "armed_home",
            state_armed_night: "armed_night",
            state_triggered: "triggered",
            unique_id: "sia2mqtt4ha_alarmpanel_alarm",
            platform: "alarm_control_panel"
        }

        // Add the Zone entities (as defined in the config file)
        let zoneEntities=[]
        for(let i in this.zones){
            let device_class
            let template
            if(this.zones[i].type.toUpperCase()=="DOOR"){
                device_class="door"
                template="contact"
            }else{
                device_class="motion"
                template="occupancy"
            }

            let zoneEntity={
                availability: availability,
                device: device,
                state_topic: `${this.config.baseTopic}/zone_${i}`,
                json_attributes_topic: `${this.config.baseTopic}/zone_${i}`,
                name: this.zones[i].name,
                type: "binary_sensor",
                unique_id: "sia2mqtt4ha_alarmpanel_zone_" + i,
                value_template: `{{ value_json.${template} }}`,
                device_class: device_class,
                payload_off: false,
                payload_on: true,
                platform: "binary_sensor"
            }

            zoneEntities.push(zoneEntity)
        }

        try {
            // Set our bridge availability to online
            await this.publish("bridge/availability", "online", true)

            // Advertise the alarm_control_panel entity
            let alarmDiscoveryTopic = `${this.config.discoveryTopic}/alarm_control_panel/${alarmEntity.unique_id}/config`
            await this.publishJSONdiscovery(alarmDiscoveryTopic, alarmEntity, true)

            // Advertise the presence of all standard entities so they can be discovered
            for (let entity in statusEntities) {
                let thisEntity = statusEntities[entity]
                let entityDiscoveryTopic = `${this.config.discoveryTopic}/${thisEntity.type}/${thisEntity.unique_id}/config`
                await this.publishJSONdiscovery(entityDiscoveryTopic, statusEntities[entity], true)
            }

            // Advertise the presence of all zone entities so they can be discovered
            for (let entity in zoneEntities) {
                let thisEntity = zoneEntities[entity]
                let entityDiscoveryTopic = `${this.config.discoveryTopic}/${thisEntity.type}/${thisEntity.unique_id}/config`
                await this.publishJSONdiscovery(entityDiscoveryTopic, zoneEntities[entity], true)
            }

        } catch (error) {
            console.log(`${Date().toLocaleString()} publishOnline() error: ${error}`)
        }
    }

    public async publish(subTopic: string, data: string, retain?: boolean) {
        try {
            await this.mqttClient.publish(`${this.config.baseTopic}/${subTopic}`, data,
                {retain: retain||false} as IClientPublishOptions)
        } catch (error) {
            throw `publish() error ${error}`
        }
    }

    public async publishJSON(subTopic: string, data: object, retain?: boolean) {
        try {
            await this.mqttClient.publish(`${this.config.baseTopic}/${subTopic}`, JSON.stringify(data),
                {retain: retain||false} as IClientPublishOptions)
        } catch (error) {
            throw `publishJSON() error ${error}`
        }
    }

    public async publishJSONdiscovery(discoveryTopic: string, data: object, retain?: boolean) {
        try {
            await this.mqttClient.publish(`${discoveryTopic}`, JSON.stringify(data),
                {retain: retain||false} as IClientPublishOptions)
        } catch (error) {
            throw `publishJSONdiscovery() error ${error}`
        }
    }

    public async publishAlarmState(state: string): Promise<void> {
        try {
            await this.mqttClient.publish(`${this.config.baseTopic}/alarm/state`, state,
                {retain: true} as IClientPublishOptions)
        } catch (error) {
            throw `publishAlarmState() error ${error}`
        }
    }

    public subscribeToCommand(callback: (command: string) => void): void {
        this.mqttClient.subscribe(this.commandTopic).catch((error) => {
            console.log(`${Date().toLocaleString()} Failed to subscribe to command topic: ${error}`)
        })
        this.mqttClient.on('message', (topic: string, message: Buffer) => {
            if (topic === this.commandTopic) {
                callback(message.toString())
            }
        })
    }
}

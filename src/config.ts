import fs from 'fs'

export interface Config {
    mqtt: MqttConfig
    sia: SiaServerConfig
    mtech: MTechConfig
    zones: [ZoneConfig]
}

export interface SiaServerConfig {
    port: number
}

export interface MTechConfig {
    panelIp: string
    panelPort: number
    userPin: string
    userIndex: number
}

export interface MqttConfig {
    brokerUrl: string
    baseTopic: string
    username: string
    password: string
    discoveryTopic: string
}

export interface ZoneConfig {
    number: number,
    name: string,
    type: string
}

export interface Zones {
    [id: number]: { name: string; type: string }
}

export function getConfig(configFile: string): Config {
    return JSON.parse(fs.readFileSync(configFile, "utf8")) as Config
}

export function parseZones(config: Config): Zones {
    let zones: Zones = {}

    for (let i in config.zones) {
        if (!config.zones[i].name || config.zones[i].name == "" || !config.zones[i].type || config.zones[i].type == "") {
            return null
        }
        zones[config.zones[i].number] = {
            "name": config.zones[i].name,
            "type": config.zones[i].type
        }
    }

    return zones
}

import { MTechAction } from "../mtech/mtechClient"

// Maps MQTT command payloads (from Home Assistant) to MTech actions
// HA alarm_control_panel sends: ARM_AWAY, ARM_HOME, ARM_NIGHT, DISARM
const COMMAND_MAP: { [key: string]: MTechAction } = {
    "arm_away":  "arm_away",    // Volledig inschakelen
    "arm_home":  "arm_home",    // Deelbeveiliging
    "arm_night": "arm_night",   // Nachtbeveiliging
    "disarm":    "disarm",      // Uitschakelen
}

// Maps SIA event codes to Home Assistant alarm_control_panel states
export const ALARM_STATE_MAP: { [code: string]: string } = {
    // Disarmed
    "OA": "disarmed", "OG": "disarmed", "OP": "disarmed",
    "BC": "disarmed", "OR": "disarmed", "RR": "disarmed",
    // Armed away (full arm)
    "CA": "armed_away", "CL": "armed_away",
    // Armed home (partial arm)
    "CG": "armed_home", "CP": "armed_home",
    // Armed night
    "CN": "armed_night",
    // Triggered
    "BA": "triggered", "BF": "triggered", "BL": "triggered",
    "CT": "triggered", "BV": "triggered",
    "FA": "triggered", "FV": "triggered",
    "PA": "triggered",
    // Restored
    "PR": "disarmed", "FR": "disarmed",
}

export function mapCommandToAction(command: string): MTechAction | null {
    const action = COMMAND_MAP[command.toLowerCase().trim()]
    if (!action) {
        console.log(`${new Date().toLocaleString()} Unknown alarm command: ${command}`)
        return null
    }
    return action
}

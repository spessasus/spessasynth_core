import { SpessaSynthLog } from "../../../utils/loggin";
import { arrayToHexString, ConsoleColors } from "../../../utils/other";
import type { SysExAcceptedArray } from "../../../midi/types";

// A helper function to log nicely
export function sysExLogging(
    channel: number,
    value: number | string,
    what: string,
    units: string
) {
    SpessaSynthLog.info(
        `%cChannel %c${channel}%c ${what} is now set to %c${value} ${units}.`,
        ConsoleColors.info,
        ConsoleColors.recognized,
        ConsoleColors.info,
        ConsoleColors.value
    );
}

export function sysExNotRecognized(syx: SysExAcceptedArray, what: string) {
    // This is some other sysex...
    SpessaSynthLog.info(
        `%cUnrecognized %c${what} %cSysEx: %c${arrayToHexString(syx)}`,
        ConsoleColors.warn,
        ConsoleColors.recognized,
        ConsoleColors.warn,
        ConsoleColors.unrecognized
    );
}

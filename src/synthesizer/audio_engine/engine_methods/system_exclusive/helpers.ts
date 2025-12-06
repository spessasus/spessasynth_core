import type { IndexedByteArray } from "../../../../utils/indexed_array";
import { SpessaSynthInfo } from "../../../../utils/loggin";
import { arrayToHexString, consoleColors } from "../../../../utils/other";

export type SysExAcceptedArray =
    | number[]
    | IndexedByteArray
    | Uint8Array
    | Int8Array
    | Uint16Array
    | Int16Array
    | Uint32Array
    | Int32Array
    | Uint8ClampedArray
    | Float32Array
    | Float64Array;
// A helper function to log nicely
export function sysExLogging(
    syx: SysExAcceptedArray,
    channel: number,
    value: number | string,
    what: string,
    units: string
) {
    SpessaSynthInfo(
        `%cChannel %c${channel}%c ${what}. %c${value} ${units}%c, with %c${arrayToHexString(syx)}`,
        consoleColors.info,
        consoleColors.recognized,
        consoleColors.info,
        consoleColors.value,
        consoleColors.info,
        consoleColors.value
    );
}

export function sysExNotRecognized(syx: SysExAcceptedArray, what: string) {
    // This is some other sysex...
    SpessaSynthInfo(
        `%cUnrecognized %c${what} %cSysEx: %c${arrayToHexString(syx)}`,
        consoleColors.warn,
        consoleColors.recognized,
        consoleColors.warn,
        consoleColors.unrecognized
    );
}

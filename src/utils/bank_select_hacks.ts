/**
 * Handling of the various ways of selecting patches (GS, XG, GM2).
 */
import type { MIDISystem } from "../soundbank/types";

const GM2_DEFAULT_BANK = 121;

/**
 * GM2 has a different default bank number
 */
export function getDefaultBank(sys: MIDISystem) {
    return sys === "gm2" ? GM2_DEFAULT_BANK : 0;
}

export function getDrumBank(sys: MIDISystem) {
    switch (sys) {
        default: {
            throw new Error(`${sys} doesn't have a bank MSB for drums.`);
        }

        case "gm2": {
            return 120;
        }
        case "xg": {
            return 127;
        }
    }
}

/**
 * Checks if this bank number is XG drums.
 */
export function isXGDrum(bankMSB: number) {
    /*
    Note: we omit 126 (XG SFX Drums) here, as they are unwanted most of the time.
    If they are really wanted, the direct match will match them anyway.
    Testcase: Timbres of heaven, selecting 0:127:30 picked XG SFX.
     */
    return bankMSB === 120 || bankMSB === 127;
}

/**
 * Checks if a program change on this bank selects an XG drum kit, the SFX kit (126) included.
 * Decides the XG drum setup of a part,
 * unlike {@link isXGDrum} which is for the preset lookup.
 * Confirmed with syxg50
 */
export function selectsXGDrumKit(bankMSB: number) {
    return isXGDrum(bankMSB) || bankMSB === 126;
}

export function isSystemXG(system: MIDISystem) {
    return system === "gm2" || system === "xg";
}

export function addBankOffset(
    bankMSB: number,
    bankOffset: number,
    isXG: boolean
) {
    // Do not change XG drums (120 or 127)
    return isXG && isXGDrum(bankMSB)
        ? bankMSB
        : Math.min(bankMSB + bankOffset, 127);
}

export function subtractBankOffset(
    bankMSB: number,
    bankOffset: number,
    isXG: boolean
) {
    // Do not change XG drums (120 or 127)
    return isXG && isXGDrum(bankMSB)
        ? bankMSB
        : Math.max(0, bankMSB - bankOffset);
}

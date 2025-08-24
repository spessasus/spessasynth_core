import { SpessaSynthInfo } from "./loggin";
import { consoleColors } from "./other";
import { DEFAULT_PERCUSSION } from "../synthesizer/audio_engine/engine_components/synth_constants";
import type { SynthSystem } from "../synthesizer/types";

export const XG_SFX_VOICE = 64;

const GM2_DEFAULT_BANK = 121;

/**
 * GM2 has a different default bank number
 */
export function getDefaultBank(sys: SynthSystem): number {
    return sys === "gm2" ? GM2_DEFAULT_BANK : 0;
}

export function getDrumBank(sys: SynthSystem): number {
    switch (sys) {
        default:
            throw new Error(`${sys} doesn't have a bank MSB for drums.`);

        case "gm2":
            return 120;
        case "xg":
            return 127;
    }
}

/**
 * Checks if this bank number is XG drums
 */
export function isXGDrums(bankNr: number): boolean {
    return bankNr === 120 || bankNr === 126 || bankNr === 127;
}

/**
 * Checks if this MSB is a valid XG MSB
 */
export function isValidXGMSB(bank: number): boolean {
    return (
        isXGDrums(bank) || bank === XG_SFX_VOICE || bank === GM2_DEFAULT_BANK
    );
}

/**
 * Bank select hacks abstracted here
 * @param bankBefore the current bank number
 * @param bank the cc change bank number
 * @param system MIDI system
 * @param isLSB is bank LSB?
 * @param isDrums is drum channel?
 * @param channelNumber channel number
 * @returns drum status: 0 - unchanged, 1 - OFF, 2 - ON
 */
export function parseBankSelect(
    bankBefore: number,
    bank: number,
    system: SynthSystem,
    isLSB: boolean,
    isDrums: boolean,
    channelNumber: number
): {
    newBank: number;
    drumsStatus: 0 | 1 | 2;
} {
    // 64 means SFX in MSB, so it is allowed
    let out = bankBefore;
    let drumsStatus = 0;
    if (isLSB) {
        if (isSystemXG(system)) {
            if (!isValidXGMSB(bank)) {
                out = bank;
            }
        }
    } else {
        let canSetBankSelect = true;
        switch (system) {
            case "gm":
                // Gm ignores bank select
                SpessaSynthInfo(
                    `%cIgnoring the Bank Select (${bank}), as the synth is in GM mode.`,
                    consoleColors.info
                );
                canSetBankSelect = false;
                break;

            case "xg":
                canSetBankSelect = isValidXGMSB(bank);
                // For xg, if msb is 120, 126 or 127, then it's drums
                if (isXGDrums(bank)) {
                    drumsStatus = 2;
                } else {
                    // Drums shall not be disabled on channel 9
                    if (channelNumber % 16 !== DEFAULT_PERCUSSION) {
                        drumsStatus = 1;
                    }
                }
                break;

            case "gm2":
                if (bank === 120) {
                    drumsStatus = 2;
                } else {
                    if (channelNumber % 16 !== DEFAULT_PERCUSSION) {
                        drumsStatus = 1;
                    }
                }
        }

        if (isDrums) {
            // 128 for percussion channel
            bank = 128;
        }
        if (bank === 128 && !isDrums) {
            // If a channel is not for percussion, default to bank current
            bank = bankBefore;
        }
        if (canSetBankSelect) {
            out = bank;
        }
    }
    return {
        newBank: out,
        drumsStatus: drumsStatus as 0 | 1 | 2
    };
}

/**
 * Chooses a bank number according to spessasynth logic
 * That is:
 * for GS, bank MSB if not drum, otherwise 128
 * for XG: bank MSB if drum and MSB is valid, 128 otherwise, bank MSB if it is SFX voice, LSB otherwise
 * @param msb bank MSB
 * @param lsb bank LSB
 * @param isDrums if the channel is drums
 * @param isXG if the synth is in XG mode
 * @returns the new bank
 */
export function chooseBank(
    msb: number,
    lsb: number,
    isDrums: boolean,
    isXG: boolean
): number {
    if (isXG) {
        if (isDrums) {
            if (isXGDrums(msb)) {
                return msb;
            } else {
                return 128;
            }
        } else {
            // Check for SFX
            if (isValidXGMSB(msb)) {
                return msb;
            }
            // If lsb is 0 and msb is not, use that
            if (lsb === 0 && msb !== 0) {
                return msb;
            }
            if (!isValidXGMSB(lsb)) {
                return lsb;
            }
            return 0;
        }
    } else {
        return isDrums ? 128 : msb;
    }
}

export function isSystemXG(system: SynthSystem) {
    return system === "gm2" || system === "xg";
}

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
export function isXGDrums(bankMSB: number): boolean {
    return bankMSB === 120 || bankMSB === 126 || bankMSB === 127;
}

/**
 * Checks if this MSB is a valid XG MSB
 */
export function isValidXGMSB(bankMSB: number): boolean {
    return (
        isXGDrums(bankMSB) ||
        bankMSB === XG_SFX_VOICE ||
        bankMSB === GM2_DEFAULT_BANK
    );
}

export function isSystemXG(system: SynthSystem) {
    return system === "gm2" || system === "xg";
}

export function addBankOffset(
    bankMSB: number,
    bankOffset: number,
    xgDrums = true
) {
    if (isXGDrums(bankMSB) && xgDrums) {
        return bankMSB;
    }
    return Math.min(bankMSB + bankOffset, 127);
}

export function subtrackBankOffset(
    bankMSB: number,
    bankOffset: number,
    xgDrums = true
) {
    if (isXGDrums(bankMSB) && xgDrums) {
        return bankMSB;
    }
    return Math.max(0, bankMSB - bankOffset);
}

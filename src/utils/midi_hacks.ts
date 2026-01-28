import type { SynthSystem } from "../synthesizer/types";

export const XG_SFX_VOICE = 64;

const GM2_DEFAULT_BANK = 121;

/**
 * A class for handling various ways of selecting patches (GS, XG, GM2)
 */
export class BankSelectHacks {
    /**
     * GM2 has a different default bank number
     */
    public static getDefaultBank(sys: SynthSystem) {
        return sys === "gm2" ? GM2_DEFAULT_BANK : 0;
    }

    public static getDrumBank(sys: SynthSystem) {
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
    public static isXGDrums(bankMSB: number) {
        /*
        Note: we omit 126 (XG SFX Drums) here, as they are unwanted most of the time.
        If they are really wanted, the direct match will match them anyway.
        Testcase: Timbres of heaven, selecting 0:127:30 picked XG SFX.
         */
        return bankMSB === 120 || bankMSB === 127;
    }

    /**
     * Checks if this MSB is a valid XG MSB
     */
    public static isValidXGMSB(bankMSB: number) {
        return (
            this.isXGDrums(bankMSB) ||
            bankMSB === XG_SFX_VOICE ||
            bankMSB === GM2_DEFAULT_BANK
        );
    }

    public static isSystemXG(system: SynthSystem) {
        return system === "gm2" || system === "xg";
    }

    public static addBankOffset(
        bankMSB: number,
        bankOffset: number,
        xgDrums = true
    ) {
        if (this.isXGDrums(bankMSB) && xgDrums) {
            return bankMSB;
        }
        return Math.min(bankMSB + bankOffset, 127);
    }

    public static subtrackBankOffset(
        bankMSB: number,
        bankOffset: number,
        xgDrums = true
    ) {
        if (this.isXGDrums(bankMSB) && xgDrums) {
            return bankMSB;
        }
        return Math.max(0, bankMSB - bankOffset);
    }
}

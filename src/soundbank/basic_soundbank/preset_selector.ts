import type { SynthSystem } from "../../synthesizer/types";
import { BankSelectHacks } from "../../utils/midi_hacks";
import type { BasicPreset } from "./basic_preset";
import { type MIDIPatch, MIDIPatchTools } from "./midi_patch";
import { SpessaSynthInfo } from "../../utils/loggin";
import { consoleColors } from "../../utils/other";

function getAnyDrums<T extends BasicPreset>(
    presets: T[],
    preferXG: boolean
): T {
    let p: T | undefined;
    if (preferXG) {
        // Get any XG drums
        p = presets.find((p) => p.isXGDrums);
    } else {
        // Get any GM/GS drums
        p = presets.find((p) => p.isGMGSDrum);
    }
    if (p) {
        // Return the found preset
        return p;
    }
    // Return any drum preset
    return (
        presets.find((p) => p.isAnyDrums) ?? // ...no?
        // Then just return any preset
        presets[0]
    );
}

/**
 * A sophisticated preset selection system based on the MIDI Patch system
 * @param presets The preset list.
 * @param patch The patch to select.
 * @param system The MIDI system to select for.
 */
export function selectPreset<T extends BasicPreset>(
    presets: T[],
    patch: MIDIPatch,
    system: SynthSystem
): T {
    if (presets.length < 1) {
        throw new Error("No presets!");
    }
    if (patch.isGMGSDrum && BankSelectHacks.isSystemXG(system)) {
        // GM/GS drums with XG. This shouldn't happen. Force XG drums.
        patch = {
            ...patch,
            isGMGSDrum: false,
            bankLSB: 0,
            bankMSB: BankSelectHacks.getDrumBank(system)
        };
    }
    const { isGMGSDrum, bankLSB, bankMSB, program } = patch;
    const isXG = BankSelectHacks.isSystemXG(system);
    const xgDrums = BankSelectHacks.isXGDrums(bankMSB) && isXG;

    // Check for exact match
    let p = presets.find((p) => p.matches(patch));
    if (p) {
        // Special case:
        // Non XG banks sometimes specify melodic "MT" presets at bank 127,
        // Which matches XG banks.
        // Testcase: 4gmgsmt-sf2_04-compat.sf2
        // Only match if the preset declares itself as drums
        if (!xgDrums || (xgDrums && p.isXGDrums)) {
            return p;
        }
    }

    // Helper to log failed exact matches
    const returnReplacement = (pres: T) => {
        SpessaSynthInfo(
            `%cPreset %c${MIDIPatchTools.toMIDIString(patch)}%c not found. (${system}) Replaced with %c${pres.toString()}`,
            consoleColors.warn,
            consoleColors.unrecognized,
            consoleColors.warn,
            consoleColors.value
        );
    };

    // No exact match...
    if (isGMGSDrum) {
        // GM/GS drums: check for the exact program match
        let p = presets.find((p) => p.isGMGSDrum && p.program === program);
        if (p) {
            returnReplacement(p);
            return p;
        }

        // No match, pick any matching drum
        p = presets.find((p) => p.isAnyDrums && p.program === program);
        if (p) {
            returnReplacement(p);
            return p;
        }

        // No match, pick the first drum preset, preferring GM/GS
        p = getAnyDrums(presets, false);
        returnReplacement(p);
        return p;
    }
    if (xgDrums) {
        // XG drums: Look for exact bank and program match
        let p = presets.find((p) => p.program === program && p.isXGDrums);
        if (p) {
            returnReplacement(p);
            return p;
        }

        // No match, pick any matching drum
        p = presets.find((p) => p.isAnyDrums && p.program === program);
        if (p) {
            returnReplacement(p);
            return p;
        }

        // Pick any drums, preferring XG
        p = getAnyDrums(presets, true);
        returnReplacement(p);
        return p;
    }
    // Melodic preset
    const matchingPrograms = presets.filter(
        (p) => p.program === program && !p.isAnyDrums
    );
    if (matchingPrograms.length < 1) {
        // The first preset
        returnReplacement(presets[0]);
        return presets[0];
    }
    if (isXG) {
        // XG uses LSB so search for that.
        p = matchingPrograms.find((p) => p.bankLSB === bankLSB);
    } else {
        // GS uses MSB so search for that.
        p = matchingPrograms.find((p) => p.bankMSB === bankMSB);
    }
    if (p) {
        returnReplacement(p);
        return p;
    }
    const bank = Math.max(bankMSB, bankLSB);
    // Any matching bank.
    p = matchingPrograms.find((p) => p.bankLSB === bank || p.bankMSB === bank);
    if (p) {
        returnReplacement(p);
        return p;
    }
    // The first matching program
    returnReplacement(matchingPrograms[0]);
    return matchingPrograms[0];
}

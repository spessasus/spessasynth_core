import type { SynthSystem } from "../../synthesizer/types";
import { getDrumBank, isSystemXG, isXGDrums } from "../../utils/xg_hacks";
import type { BasicPreset } from "./basic_preset";
import type { MIDIPatch } from "./midi_patch";

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

export function selectPreset<T extends BasicPreset>(
    presets: T[],
    patch: MIDIPatch,
    system: SynthSystem
): T {
    if (presets.length < 1) {
        throw new Error("No presets!");
    }
    let { isGMGSDrum, bankLSB, bankMSB } = patch;
    const { program } = patch;
    let p = presets.find(
        (p) =>
            p.isGMGSDrum === isGMGSDrum &&
            p.program === program &&
            p.bankMSB === bankMSB &&
            p.bankLSB === bankLSB
    );
    if (p) {
        return p;
    }

    // No exact match...
    if (isSystemXG(system) && isGMGSDrum) {
        // GM/GS drums with XG. This shouldn't happen. Force XG drums.
        isGMGSDrum = false;
        bankLSB = 0;
        bankMSB = getDrumBank(system);
    }
    if (isGMGSDrum) {
        // GM/GS drums: check for the exact program match
        let p = presets.find((p) => p.isGMGSDrum && p.program === program);
        if (p) {
            return p;
        }

        // No match, pick any matching drum
        p = presets.find((p) => p.isAnyDrums && p.program === program);
        if (p) {
            return p;
        }

        // No match, pick the first drum preset, preferring GM/GS
        return getAnyDrums(presets, false);
    }
    if (isXGDrums(bankMSB) && isSystemXG(system)) {
        // XG drums: Look for exact bank and program match
        let p = presets.find((p) => p.program === program && p.isXGDrums);
        if (p) {
            return p;
        }

        // No match, pick any matching drum
        p = presets.find((p) => p.isAnyDrums && p.program === program);
        if (p) {
            return p;
        }

        // Pick any drums, preferring XG
        return getAnyDrums(presets, true);
    }
    // Melodic preset
    const matchingPrograms = presets.filter(
        (p) => p.program === program && !p.isAnyDrums
    );
    if (matchingPrograms.length < 1) {
        return presets[0];
    }
    if (isSystemXG(system)) {
        // XG uses LSB so search for that.
        p = matchingPrograms.find((p) => p.bankLSB === bankLSB);
    } else {
        // GS uses MSB so search for that.
        p = matchingPrograms.find((p) => p.bankMSB === bankMSB);
    }
    if (p) {
        return p;
    }
    // The first matching program
    return matchingPrograms[0];
}

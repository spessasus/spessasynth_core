/**
 * Useful functions for working with MIDI patches.
 *
 * @group Sound Banks.MIDI Patch System
 * @module
 */
import type { MIDISystem } from "../types";
import * as BankSelectHacks from "../../utils/midi_hacks";
import { SpessaLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";
import type { MIDIPatch, MIDIPatchFull } from "./midi_patch";

/**
 * Converts a given {@link MIDIPatch} to a string.
 * The format is:
 * - `DRUM:bankMSB:bankLSB:program` for `isGMGSDrum` set to `true`.
 * - `bankLSB:bankMSB:program` for `isGMGSDrum` set to `false`.
 * @param patch The patch to convert.
 */
export function toMIDIString(patch: MIDIPatch) {
    return patch.isGMGSDrum
        ? `DRUM:${patch.bankMSB}:${patch.bankLSB}:${patch.program}`
        : `${patch.bankLSB}:${patch.bankMSB}:${patch.program}`;
}

// noinspection JSUnusedGlobalSymbols
/**
 * Gets {@link MIDIPatch} from a given string.
 * @param string The string in the {@link toMIDIString} format.
 */
export function fromMIDIString(string: string): MIDIPatch {
    const parts = string.split(":");
    if (string.startsWith("DRUM")) {
        // DRUM:MSB:LSB:program,
        // DRUM:program (older format LSB = 0)
        // Or LSB:MSB:program
        if (parts.length !== 4 && parts.length !== 2) {
            throw new Error(`Invalid MIDI string: ${string}`);
        }
        const long = parts.length === 4;
        return {
            bankMSB: long ? Number.parseInt(parts[1]) : 0,
            bankLSB: long ? Number.parseInt(parts[2]) : 0,
            program: Number.parseInt(parts[parts.length - 1]),
            isGMGSDrum: true
        };
    }
    // LSB:MSB:program
    if (parts.length !== 3) {
        throw new Error(`Invalid MIDI string: ${string}`);
    }
    return {
        bankLSB: Number.parseInt(parts[0]),
        bankMSB: Number.parseInt(parts[1]),
        program: Number.parseInt(parts[2]),
        isGMGSDrum: false
    };
}

/**
 * Converts a given {@link MIDIPatchFull} to string.
 * The format is:
 * - `<MIDIPatch string> D <name>` for `isDrum` set to `true`.
 * - `<MIDIPatch string> M <name>` for `isDrum` set to `false`.
 * @param patch The patch to convert.
 */
export function toFullMIDIString(patch: MIDIPatchFull) {
    return `${toMIDIString(patch)} ${patch.isDrum ? "D" : "M"} ${patch.name}`;
}

// noinspection JSUnusedGlobalSymbols
/**
 * Gets {@link MIDIPatchFull} from a given string.
 * @param string The string in the {@link toFullMIDIString} format.
 */
export function fromFullMIDIString(string: string): MIDIPatchFull {
    const firstSpace = string.indexOf(" ");
    const secondSpace = string.indexOf(" ", firstSpace + 1);

    if (firstSpace === -1 || secondSpace === -1)
        throw new Error(`Invalid named MIDI string: ${string}`);

    const midiPart = string.slice(0, firstSpace);
    const drumMode = string.slice(firstSpace + 1, secondSpace);
    const name = string.slice(Math.max(0, secondSpace + 1));
    const patch = fromMIDIString(midiPart);

    return {
        ...patch,
        isDrum: drumMode === "D",
        name
    };
}

/**
 * Checks if two MIDI patches represent the same one.
 * @param patch1 The first patch.
 * @param patch2 The second patch.
 */
export function matches(patch1: MIDIPatch, patch2: MIDIPatch) {
    // Drum kits are told apart by the program,
    // The MSB and the LSB
    return patch1.isGMGSDrum || patch2.isGMGSDrum
        ? patch1.isGMGSDrum === patch2.isGMGSDrum &&
              patch1.program === patch2.program &&
              patch1.bankMSB === patch2.bankMSB &&
              patch1.bankLSB === patch2.bankLSB
        : patch1.program === patch2.program &&
              patch1.bankLSB === patch2.bankLSB &&
              patch1.bankMSB === patch2.bankMSB;
}

/**
 * A comparison function for `.sort()` or `.toSorted()`,
 * ordering the patches in ascending order: by program, then bank MSB, then bank LSB, with GM/GS drums last.
 * @param a The first patch.
 * @param b The second patch.
 */
export function compare(a: MIDIPatch, b: MIDIPatch): number {
    // Force drum presets to be last
    if (a.isGMGSDrum && !b.isGMGSDrum) return 1;
    if (!a.isGMGSDrum && b.isGMGSDrum) return -1;

    // First, sort by program
    if (a.program !== b.program) return a.program - b.program;

    // Next, sort by bankMSB
    if (a.bankMSB !== b.bankMSB) return a.bankMSB - b.bankMSB;

    // Finally, sort by bankLSB
    return a.bankLSB - b.bankLSB;
}

/**
 * Checks if the given {@link MIDIPatchFull} is an XG/GM2 drum patch.
 * @param p The patch to check.
 */
export function isXGDrum(p: MIDIPatchFull) {
    return p.isDrum && !p.isGMGSDrum;
}

/**
 * A sophisticated patch selection system based on the MIDI Patch system.
 * This is the algorithm that the synthesizer uses for selecting presets.
 * @param patches The {@link MIDIPatchFull} array to select from.
 * @param patch The {@link MIDIPatch} to select.
 * @param system The MIDI system to select for.
 * @param channel10 If the request comes from channel 10 (of any group of 16 channels).
 * In XG, such a request with the bank MSB 126 that has no exact match falls back to drums instead of melodic presets,
 * as channel 10 cannot become melodic there.
 * @returns The selected patch.
 * @throws Error An error if the array is empty.
 */
export function selectPatch<T extends MIDIPatchFull>(
    patches: T[],
    patch: MIDIPatch,
    system: MIDISystem,
    channel10 = false
): T {
    if (patches.length === 0) {
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
    const xgDrums = BankSelectHacks.isXGDrum(bankMSB) && isXG;
    // The XG SFX kits stay melodic on an exact match, but on channel 10 the fallback must keep the drums
    const xgDrumFallback =
        xgDrums || (channel10 && system === "xg" && bankMSB === 126);

    // Check for exact match
    let p = patches.find((p) => matches(p, patch));
    if (
        p && // Special case:
        // Non XG banks sometimes specify melodic "MT" presets at bank 127,
        // Which matches XG banks.
        // Testcase: 4gmgsmt-sf2_04-compat.sf2
        // Only match if the preset declares itself as drums
        (!xgDrums || (xgDrums && isXGDrum(p)))
    ) {
        return p;
    }

    // Helper to log failed exact matches
    const returnReplacement = (pres: T) => {
        SpessaLog.info(
            `%cPreset %c${toMIDIString(patch)}%c not found. (${system}) Replaced with %c${toFullMIDIString(pres)}`,
            ConsoleColors.warn,
            ConsoleColors.unrecognized,
            ConsoleColors.warn,
            ConsoleColors.value
        );
    };

    // No exact match...
    if (isGMGSDrum) {
        // GM/GS drums: same program and LSB (the kit map), then the program alone
        let p =
            patches.find(
                (p) =>
                    p.isGMGSDrum &&
                    p.program === program &&
                    p.bankLSB === bankLSB
            ) ?? patches.find((p) => p.isGMGSDrum && p.program === program);
        if (p) {
            returnReplacement(p);
            return p;
        }

        // No match, pick any matching drum (rule 3.1.3).
        // Below program 49 GS and XG kits still mean the same.
        // A kit at bank MSB 120 (GM2) numbers its kits like GS, so it counts at any program
        p = patches.find(
            (p) =>
                p.isDrum &&
                p.program === program &&
                (program < 49 || p.bankMSB === 120)
        );
        if (p) {
            returnReplacement(p);
            return p;
        }

        // No match, pick the first drum preset, preferring GM/GS
        p = getAnyDrums(patches, false);
        returnReplacement(p);
        return p;
    }
    if (xgDrumFallback) {
        // XG drums: Look for an XG drum kit with the same program
        let p = patches.find(
            (p) => p.program === program && p.isDrum && !p.isGMGSDrum
        );
        if (p) {
            returnReplacement(p);
            return p;
        }

        // No match, pick any matching drum
        p = patches.find((p) => p.isDrum && p.program === program);

        // Program 49 and above start to diverge between GS and XG.
        // For example,
        // XG MU2000 and similar have regular drums on program 56, while GS has the SFX kit.
        // So avoid selecting it and pick any XG drums.
        // GM2 numbers its kits like GS, so there any program is fine (SFe 4.0, section 11.2.3 rule 3.2.2)
        if (p && (system === "gm2" || p.program < 49)) {
            returnReplacement(p);
            return p;
        }

        // Pick any drums, preferring XG
        p = getAnyDrums(patches, true);
        returnReplacement(p);
        return p;
    }
    // Melodic preset
    const matchingPrograms = patches.filter(
        (p) => p.program === program && !p.isDrum
    );
    if (matchingPrograms.length === 0) {
        // The first preset
        returnReplacement(patches[0]);
        return patches[0];
    }
    if (!isXG) {
        // In GS (and GM, which follows it) the LSB selects the map and a missing variation stays in its map.
        // So we prefer capital rather than lsb with same msb + program
        p = matchingPrograms.find(
            (p) => p.bankMSB === 0 && p.bankLSB === bankLSB
        );
        if (p) {
            returnReplacement(p);
            return p;
        }
    }
    p = matchingPrograms.find(
        isXG
            ? // XG uses LSB so search for that.
              (p) => p.bankLSB === bankLSB
            : // GS uses MSB so search for that.
              (p) => p.bankMSB === bankMSB
    );
    if (p) {
        returnReplacement(p);
        return p;
    }
    // Special XG case: 64 on LSB can't default to 64 MSB.
    // Testcase: Cybergate.mid
    // Selects 64 LSB on warm pad, on DLSbyXG.dls it gets replaced with Bird 2 SFX
    if (bankLSB !== 64 || !isXG) {
        const bank = Math.max(bankMSB, bankLSB);
        // Any matching bank.
        p = matchingPrograms.find(
            (p) => p.bankLSB === bank || p.bankMSB === bank
        );
        if (p) {
            returnReplacement(p);
            return p;
        }
    }
    // The first matching program
    returnReplacement(matchingPrograms[0]);
    return matchingPrograms[0];
}

function getAnyDrums<T extends MIDIPatchFull>(
    presets: T[],
    preferXG: boolean
): T {
    const p: T | undefined = presets.find(
        preferXG // Get any XG drums
            ? (p) => isXGDrum(p) // Get any GM/GS drums
            : (p) => p.isGMGSDrum
    );
    // Return the found preset
    return (
        p ??
        // Return any drum preset
        presets.find((p) => p.isDrum) ?? // ...no?
        // Then just return any preset
        presets[0]
    );
}

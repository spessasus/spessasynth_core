import type { MIDISystem } from "../types";
import { BankSelectHacks } from "../../utils/midi_hacks";
import { SpessaSynthLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";

export interface MIDIPatch {
    /**
     * The MIDI program number.
     */
    program: number;

    /**
     * The MIDI bank MSB number.
     */
    bankMSB: number;

    /**
     * The MIDI bank LSB number.
     */
    bankLSB: number;

    /**
     * If the preset is marked as GM/GS drum preset. Note that XG drums do not have this flag.
     */
    isGMGSDrum: boolean;
}

export interface MIDIPatchFull extends MIDIPatch {
    /**
     * The name of the patch.
     */
    name: string;

    /**
     * Indicates if this patch is a drum patch.
     * This is the recommended way of determining if this is a drum preset.
     * If `isGMGSDrum` is true, then this is a GM/GS drum preset.
     * If `isGMGSDrum` is false, then this is a GM2/XG drum preset.
     */
    isDrum: boolean;
}

export class MIDIPatchTools {
    /**
     * Converts a given `MIDIPatch` to a string.
     * The format is:
     * - `DRUM:program` for `GMGSDrum` set to `true`.
     * - `bankLSB:bankMSB:program` for `GMGSDrum` set to `false`.
     */
    public static toMIDIString(patch: MIDIPatch) {
        if (patch.isGMGSDrum) {
            return `DRUM:${patch.program}`;
        }
        return `${patch.bankLSB}:${patch.bankMSB}:${patch.program}`;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets `MIDIPatch` from a given string.
     */
    public static fromMIDIString(string: string): MIDIPatch {
        const parts = string.split(":");
        if (parts.length > 3 || parts.length < 2) {
            throw new Error(`Invalid MIDI string: ${string}`);
        }
        return string.startsWith("DRUM")
            ? {
                  bankMSB: 0,
                  bankLSB: 0,
                  program: Number.parseInt(parts[1]),
                  isGMGSDrum: true
              }
            : {
                  bankLSB: Number.parseInt(parts[0]),
                  bankMSB: Number.parseInt(parts[1]),
                  program: Number.parseInt(parts[2]),
                  isGMGSDrum: false
              };
    }

    /**
     * Converts a given `MIDIPatchFull`to string.
     * The format is:
     * - `<MIDIPatch string> D <name>` for `isDrum` set to `true`.
     * - `<MIDIPatch string> M <name>` for `isDrum` set to `true`.
     */
    public static toFullMIDIString(patch: MIDIPatchFull) {
        return `${this.toMIDIString(patch)} ${patch.isDrum ? "D" : "M"} ${patch.name}`;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets `MIDIPatchFull` from a given string.
     */
    public static fromFullMIDIString(string: string): MIDIPatchFull {
        const firstSpace = string.indexOf(" ");
        const secondSpace = string.indexOf(" ", firstSpace + 1);

        if (firstSpace === -1 || secondSpace === -1)
            throw new Error(`Invalid named MIDI string: ${string}`);

        const midiPart = string.slice(0, Math.max(0, firstSpace));
        const drumMode = string.slice(firstSpace + 1, secondSpace);
        const name = string.slice(Math.max(0, secondSpace + 1));
        const patch = MIDIPatchTools.fromMIDIString(midiPart);

        return {
            ...patch,
            isDrum: drumMode === "D",
            name
        };
    }

    /**
     * Checks if two MIDI patches represent the same one.
     */
    public static matches(patch1: MIDIPatch, patch2: MIDIPatch) {
        if (patch1.isGMGSDrum || patch2.isGMGSDrum) {
            // For drums only compare programs
            return (
                patch1.isGMGSDrum === patch2.isGMGSDrum &&
                patch1.program === patch2.program
            );
        }
        return (
            patch1.program === patch2.program &&
            patch1.bankLSB === patch2.bankLSB &&
            patch1.bankMSB === patch2.bankMSB
        );
    }

    /**
     * A comparison function for `.sort()` or `.toSorted()`,
     * ordering the patches in ascending order.
     */
    public static compare(a: MIDIPatch, b: MIDIPatch): number {
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
     * Checks if the given `MIDIPatchFull` is an XG/GM2 drum patch.
     */
    public static isXGDrum(p: MIDIPatchFull) {
        return p.isDrum && !p.isGMGSDrum;
    }

    /**
     * A sophisticated patch selection system based on the MIDI Patch system.
     * This is the algorithm that the synthesizer uses for selecting presets.
     * @param patches The `MIDIPatchFull` array to select from.
     * @param patch The `MIDIPatch` to select.
     * @param system The MIDI system to select for.
     * @returns The selected patch.
     */
    public static selectPatch<T extends MIDIPatchFull>(
        patches: T[],
        patch: MIDIPatch,
        system: MIDISystem
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

        // Check for exact match
        let p = patches.find((p) => this.matches(p, patch));
        if (
            p && // Special case:
            // Non XG banks sometimes specify melodic "MT" presets at bank 127,
            // Which matches XG banks.
            // Testcase: 4gmgsmt-sf2_04-compat.sf2
            // Only match if the preset declares itself as drums
            (!xgDrums || (xgDrums && this.isXGDrum(p)))
        ) {
            return p;
        }

        // Helper to log failed exact matches
        const returnReplacement = (pres: T) => {
            SpessaSynthLog.info(
                `%cPreset %c${MIDIPatchTools.toMIDIString(patch)}%c not found. (${system}) Replaced with %c${this.toFullMIDIString(pres)}`,
                ConsoleColors.warn,
                ConsoleColors.unrecognized,
                ConsoleColors.warn,
                ConsoleColors.value
            );
        };

        // No exact match...
        if (isGMGSDrum) {
            // GM/GS drums: check for the exact program match
            let p = patches.find((p) => p.isGMGSDrum && p.program === program);
            if (p) {
                returnReplacement(p);
                return p;
            }

            // No match, pick any matching drum
            p = patches.find((p) => p.isDrum && p.program === program);
            if (p) {
                returnReplacement(p);
                return p;
            }

            // No match, pick the first drum preset, preferring GM/GS
            p = this.getAnyDrums(patches, false);
            returnReplacement(p);
            return p;
        }
        if (xgDrums) {
            // XG drums: Look for exact bank and program match
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
            if (p && p.program < 49) {
                returnReplacement(p);
                return p;
            }

            // Pick any drums, preferring XG
            p = this.getAnyDrums(patches, true);
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
        p = isXG
            ? // XG uses LSB so search for that.
              matchingPrograms.find((p) => p.bankLSB === bankLSB)
            : // GS uses MSB so search for that.
              matchingPrograms.find((p) => p.bankMSB === bankMSB);
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

    private static getAnyDrums<T extends MIDIPatchFull>(
        presets: T[],
        preferXG: boolean
    ): T {
        const p: T | undefined = preferXG // Get any XG drums
            ? presets.find((p) => this.isXGDrum(p)) // Get any GM/GS drums
            : presets.find((p) => p.isGMGSDrum);
        if (p) {
            // Return the found preset
            return p;
        }
        // Return any drum preset
        return (
            presets.find((p) => p.isDrum) ?? // ...no?
            // Then just return any preset
            presets[0]
        );
    }
}

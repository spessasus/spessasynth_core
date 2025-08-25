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

export interface MIDIPatchNamed extends MIDIPatch {
    /**
     * The name of the patch.
     */
    name: string;
}

export class MIDIPatchTools {
    /**
     * Converts a MIDI patch to a string.
     */
    public static toMIDIString(patch: MIDIPatch) {
        if (patch.isGMGSDrum) {
            return `DRUM:${patch.program}`;
        }
        return `${patch.bankLSB}:${patch.bankMSB}:${patch.program}`;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets a MIDI patch from a string.
     * @param string
     */
    public static fromMIDIString(string: string): MIDIPatch {
        const parts = string.split(":");
        if (parts.length > 3 || parts.length < 2) {
            throw new Error("Invalid MIDI string:");
        }
        if (string.startsWith("DRUM")) {
            return {
                bankMSB: 0,
                bankLSB: 0,
                program: parseInt(parts[1]),
                isGMGSDrum: true
            };
        } else {
            return {
                bankLSB: parseInt(parts[0]),
                bankMSB: parseInt(parts[1]),
                program: parseInt(parts[2]),
                isGMGSDrum: false
            };
        }
    }

    /**
     * Converts a named MIDI patch to string.
     * @param patch
     */
    public static toNamedMIDIString(patch: MIDIPatchNamed) {
        return `${MIDIPatchTools.toMIDIString(patch)} ${patch.name} `;
    }

    /**
     * Checks if two MIDI patches match.
     * @param patch1
     * @param patch2
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

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets a named MIDI patch from a string.
     * @param string
     */
    public static fromNamedMIDIString(string: string): MIDIPatchNamed {
        const firstSpace = string.indexOf(" ");
        if (firstSpace < 0) {
            throw new Error(`Invalid named MIDI string: ${string}`);
        }
        const patch = this.fromMIDIString(string.substring(0, firstSpace));
        const name = string.substring(firstSpace + 1);
        return {
            ...patch,
            name
        };
    }

    public static sorter(a: MIDIPatch, b: MIDIPatch): number {
        // Force drum presets to be last
        if (a.isGMGSDrum && !b.isGMGSDrum) return 1;
        if (!a.isGMGSDrum && b.isGMGSDrum) return -1;

        if (a.program !== b.program) {
            return a.program - b.program;
        }

        if (a.bankMSB !== b.bankMSB) {
            return a.bankMSB - b.bankMSB;
        }

        return a.bankLSB - b.bankLSB;
    }
}

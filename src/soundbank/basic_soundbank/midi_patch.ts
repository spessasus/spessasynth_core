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

export function toMIDIString(patch: MIDIPatch) {
    if (patch.isGMGSDrum) {
        return `DRUM:${patch.program}`;
    }
    return `${patch.bankMSB}:${patch.bankLSB}:${patch.program}`;
}

export function toNamedMIDIString(patch: MIDIPatchNamed) {
    return `${patch.name} ${toMIDIString(patch)}`;
}

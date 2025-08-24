export interface MIDIPatchNamed extends MIDIPatch {
    /**
     * The name of the patch.
     */
    name: string;
}

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

/**
 * SpessaSynth 4.0 brings the full bank LSB support in the API.
 *
 * The system now operates on _MIDI Patches_ - a way of selecting MIDI presets using 4 properties,
 * compatible with GM, GS, XG and GM2.
 * The existing MIDI files will continue to work as the preset selection system has been fine-tuned for various types of MIDI files.
 *
 * @group Sound Banks.MIDI Patch System
 */
export interface MIDIPatch {
    /**
     * The MIDI program number.
     */
    program: number;

    /**
     * Bank MSB (CC#0) of this patch.
     *
     * It is used for sound variation in GS, and for channel type in XG and GM2.
     * This means that with bank MSB of 127 for example, a channel in XG mode will turn into a drum channel.
     */
    bankMSB: number;

    /**
     * Bank LSB (CC#32) of this patch.
     *
     * This is mostly used in XG and GM2 for selecting variations of instruments, much like MSB in GS.
     *
     * > **Note**
     * >
     * > The SF2 format does not support writing the bank LSB number so the `wBank` is still interpreted as both and flattened when writing.
     */
    bankLSB: number;

    /**
     * If the preset is marked as GM/GS drum preset.
     *
     * This flag is exclusive to GM and GS systems. These don't use bank MSB as a drum flag.
     * GM has channel 9 hardcoded as drums, and GS has a system exclusive for setting them.
     * This allows XG and GS drums to coexist in a single sound bank and can be thought of as bank 128 in SF2.
     *
     * > **Warning**
     * >
     * > The `isGMGSDrum` flag being set does *not* necessarily mean that this patch is a drum patch!
     * > The {@link MIDIPatchFull} sent with the `presetListChange` event provides an additional property `isDrum` which correctly identifies drums across all MIDI systems.
     */
    isGMGSDrum: boolean;
}

/**
 * An extended version of {@link MIDIPatch} containing two new properties.
 * This object is sent with the `presetListChange` event of the synthesizer,
 * and it is what {@link BasicPreset} implements.
 *
 * @group Sound Banks.MIDI Patch System
 */
export interface MIDIPatchFull extends MIDIPatch {
    /**
     * The name of the patch.
     */
    name: string;

    /**
     * Indicates if this patch is a drum patch.
     * This is the recommended way of determining if this is a drum preset.
     *
     * If this value is true:
     * - If `isGMGSDrum` is true, then this is a GM/GS drum preset.
     * - If `isGMGSDrum` is false, then this is a GM2/XG drum preset.
     *
     * > **Tip**
     * >
     * > This is the recommended way of determining if this is a drum preset.
     */
    isDrum: boolean;
}

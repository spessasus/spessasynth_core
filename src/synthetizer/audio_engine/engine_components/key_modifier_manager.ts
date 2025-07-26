/**
 * A manager for custom key overrides for channels
 */

export class KeyModifier {
    /**
     * The new override velocity. -1 means unchanged.
     */
    velocity: number = -1;
    /**
     * The patch this key uses. -1 on either means default.
     */
    patch: { bank: number; program: number } = { bank: -1, program: -1 };

    /**
     * Linear gain override for the voice.
     */
    gain = 1;

    /**
     * Creates a new KeyModifier.
     * @param velocity -1 means unchanged.
     * @param bank -1 means default.
     * @param program -1 means default.
     * @param gain linear gain, 1 is default.
     */
    constructor(
        velocity: number = -1,
        bank: number = -1,
        program: number = -1,
        gain: number = 1
    ) {
        this.velocity = velocity;
        this.patch = {
            bank: bank,
            program: program
        };
        this.gain = gain;
    }
}

export class KeyModifierManager {
    /**
     * The velocity override mappings for MIDI keys
     * stored as [channelNumber][midiNote].
     */
    private keyMappings: (KeyModifier | undefined)[][] = [];

    // noinspection JSUnusedGlobalSymbols
    /**
     * Add a mapping for a MIDI key to a KeyModifier.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     * @param mapping The KeyModifier to apply for this key.
     */
    public addMapping(channel: number, midiNote: number, mapping: KeyModifier) {
        if (this.keyMappings[channel] === undefined) {
            this.keyMappings[channel] = [];
        }
        this.keyMappings[channel][midiNote] = mapping;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Delete a mapping for a MIDI key.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     */
    deleteMapping(channel: number, midiNote: number) {
        if (this.keyMappings[channel]?.[midiNote] === undefined) {
            return;
        }
        this.keyMappings[channel][midiNote] = undefined;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Clear all key mappings.
     */
    clearMappings() {
        this.keyMappings = [];
    }

    /**
     * Sets the key mappings to a new array.
     * @param mappings A 2D array where the first dimension is the channel number and the second dimension is the MIDI note number.
     */
    setMappings(mappings: (KeyModifier | undefined)[][]) {
        this.keyMappings = mappings;
    }

    /**
     * Returns the current key mappings.
     */
    getMappings(): (KeyModifier | undefined)[][] {
        return this.keyMappings;
    }

    /**
     * Gets the velocity override for a MIDI key.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     * @returns The velocity override, or -1 if no override is set.
     */
    getVelocity(channel: number, midiNote: number): number {
        return this.keyMappings[channel]?.[midiNote]?.velocity ?? -1;
    }

    /**
     * Gets the gain override for a MIDI key.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     * @returns The gain override, or 1 if no override is set.
     */
    getGain(channel: number, midiNote: number): number {
        return this.keyMappings[channel]?.[midiNote]?.gain ?? 1;
    }

    /**
     * Checks if a MIDI key has an override for the patch.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     * @returns  True if the key has an override patch, false otherwise.
     */
    hasOverridePatch(channel: number, midiNote: number): boolean {
        const bank = this.keyMappings[channel]?.[midiNote]?.patch?.bank;
        return bank !== undefined && bank >= 0;
    }

    /**
     * Gets the patch override for a MIDI key.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     * @returns An object containing the bank and program numbers.
     * @throws Error if no modifier is set for the key.
     */
    getPatch(
        channel: number,
        midiNote: number
    ): { bank: number; program: number } {
        const modifier = this.keyMappings[channel]?.[midiNote];
        if (modifier) {
            return modifier.patch;
        }
        throw new Error("No modifier.");
    }
}

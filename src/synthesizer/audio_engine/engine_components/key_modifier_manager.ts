/**
 * A manager for custom key overrides for channels
 */
import type { MIDIPatch } from "../../../soundbank/basic_soundbank/midi_patch";

export class KeyModifier {
    /**
     * The new override velocity. -1 means unchanged.
     */
    public velocity = -1;
    /**
     * The patch this key uses. -1 on either means default.
     */
    public patch: MIDIPatch = {
        bankLSB: -1,
        bankMSB: -1,
        isGMGSDrum: false,
        program: -1
    };

    /**
     * Linear gain override for the voice.
     */
    public gain = 1;
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
        this.keyMappings[channel] ??= [];
        this.keyMappings[channel][midiNote] = mapping;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Delete a mapping for a MIDI key.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     */
    public deleteMapping(channel: number, midiNote: number) {
        if (this.keyMappings[channel]?.[midiNote] === undefined) {
            return;
        }
        this.keyMappings[channel][midiNote] = undefined;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Clear all key mappings.
     */
    public clearMappings() {
        this.keyMappings = [];
    }

    /**
     * Sets the key mappings to a new array.
     * @param mappings A 2D array where the first dimension is the channel number and the second dimension is the MIDI note number.
     */
    public setMappings(mappings: (KeyModifier | undefined)[][]) {
        this.keyMappings = mappings;
    }

    /**
     * Returns the current key mappings.
     */
    public getMappings(): (KeyModifier | undefined)[][] {
        return this.keyMappings;
    }

    /**
     * Gets the velocity override for a MIDI key.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     * @returns The velocity override, or -1 if no override is set.
     */
    public getVelocity(channel: number, midiNote: number): number {
        return this.keyMappings[channel]?.[midiNote]?.velocity ?? -1;
    }

    /**
     * Gets the gain override for a MIDI key.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     * @returns The gain override, or 1 if no override is set.
     */
    public getGain(channel: number, midiNote: number): number {
        return this.keyMappings[channel]?.[midiNote]?.gain ?? 1;
    }

    /**
     * Checks if a MIDI key has an override for the patch.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     * @returns  True if the key has an override patch, false otherwise.
     */
    public hasOverridePatch(channel: number, midiNote: number): boolean {
        const bank = this.keyMappings[channel]?.[midiNote]?.patch?.bankMSB;
        return bank !== undefined && bank >= 0;
    }

    /**
     * Gets the patch override for a MIDI key.
     * @param channel The MIDI channel number.
     * @param midiNote The MIDI note number (0-127).
     * @returns An object containing the bank and program numbers.
     * @throws Error if no modifier is set for the key.
     */
    public getPatch(channel: number, midiNote: number): MIDIPatch {
        const modifier = this.keyMappings[channel]?.[midiNote];
        if (modifier) {
            return modifier.patch;
        }
        throw new Error("No modifier.");
    }
}

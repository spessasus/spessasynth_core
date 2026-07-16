import { type MIDIPatch } from "../../soundbank/basic_soundbank/midi_patch";
import type { VoiceParameters } from "../../soundbank/types";
import type { SynthesizerPatch } from "../types";

const DEFAULT_DRUM_PATCH: MIDIPatch = {
    bankLSB: 0,
    bankMSB: 0,
    program: 0,
    isGMGSDrum: true
};

/**
 * A GS User drum set that allows mapping each MIDI key to a different preset and key.
 * This is used for the virtual GS user drum preset.
 * Each of the 128 MIDI keys can be independently bound to any `MIDIPatch`
 * and a specific key within that patch.
 */
export class UserDrumSet implements SynthesizerPatch {
    // MIDIPatch full fields
    public program;
    public readonly bankMSB = 0;
    public readonly bankLSB = 0;
    public readonly isGMGSDrum = true;
    public name;
    public isDrum = true;

    /**
     * The key bindings for this drum set.
     * Index is the MIDI key, value is the bound patch and target key.
     */
    private readonly keyBindings: { patch: MIDIPatch; key: number }[] = [];

    /**
     * Callback that resolves a `MIDIPatch` to a `SynthesizerPatch`.
     * Provided by the `SoundBankManager`.
     */
    private readonly resolvePatch: (
        patch: MIDIPatch
    ) => SynthesizerPatch | undefined;

    /**
     * Creates a new custom drum set.
     * @param program the MIDI program number for this drum set.
     * @param name the display name of this drum set.
     * @param resolvePatch a callback that resolves a `MIDIPatch` to a
     *   `SynthesizerPatch`. Returns `undefined` if no matching preset
     *   is found. Used to look up the actual preset when a note is played.
     */
    public constructor(
        program: number,
        name: string,
        resolvePatch: (patch: MIDIPatch) => SynthesizerPatch | undefined
    ) {
        this.program = program;
        this.name = name;
        this.resolvePatch = resolvePatch;

        this.reset();
    }

    /**
     * Sets the key binding for a given MIDI key.
     * @param midiKey the MIDI key to bind (0-127).
     * @param targetPatch the MIDI patch to use for this key.
     * @param targetKey the key to play from the target patch (0-127).
     */
    public setKeyBinding(
        midiKey: number,
        targetPatch: MIDIPatch,
        targetKey: number
    ): void {
        this.keyBindings[midiKey] = {
            patch: { ...targetPatch },
            key: targetKey
        };
    }

    /**
     * Resets all key bindings to the default GM/GS drum patch.
     */
    public reset(): void {
        // Initialize all 128 keys to the default drum patch
        for (let i = 0; i < 128; i++) {
            this.keyBindings[i] = {
                patch: { ...DEFAULT_DRUM_PATCH },
                key: i
            };
        }
    }

    /**
     * Returns the voice synthesis data for this preset.
     * @param midiNote the MIDI note number.
     * @param velocity the MIDI velocity.
     * @returns the returned sound data.
     */
    public getVoiceParameters(
        midiNote: number,
        velocity: number
    ): VoiceParameters[] {
        const binding = this.keyBindings[midiNote];
        const resolvedPatch = this.resolvePatch(binding.patch);
        if (!resolvedPatch) {
            // No match, no sound
            return [];
        }
        return resolvedPatch.getVoiceParameters(binding.key, velocity);
    }
}

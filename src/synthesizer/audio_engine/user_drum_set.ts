import { type MIDIPatch } from "../../soundbank/basic_soundbank/midi_patch";
import type { VoiceParameters } from "../../soundbank/types";
import type { SynthesizerPatch } from "../types";
import { GeneratorTypes } from "../../soundbank/basic_soundbank/generator_types";
import { DrumParameterUtils } from "../../midi/drum_parameters";
import type { UserDrumSetParameter } from "../../midi/types";

const FALLBACK_PATCH: MIDIPatch = {
    bankMSB: 0,
    bankLSB: 0,
    isGMGSDrum: true,
    program: 0
};

/**
 * A GS User drum set that allows mapping each MIDI key to a different preset and key.
 * This is used for the virtual GS user drum preset.
 * Each of the 128 MIDI keys can be independently bound to any `MIDIPatch`
 * and a specific key within that patch.
 */
export class UserDrumSet implements SynthesizerPatch {
    // MIDIPatchFull fields
    public program;
    public readonly bankMSB = 0;
    public readonly bankLSB = 0;
    public readonly isGMGSDrum = true;
    public readonly name;
    public isDrum = true;

    /**
     * The key parameters for this drum set.
     * Index is the MIDI key, value are the parameters for this key.
     */
    public readonly keyParams: UserDrumSetParameter[] = [];

    /**
     * Callback that resolves a `MIDIPatch` to a `SynthesizerPatch`.
     * Provided by the `SoundBankManager`.
     */
    private readonly resolvePatch: (
        patch: MIDIPatch
    ) => SynthesizerPatch | undefined;

    private readonly tempPatch: MIDIPatch = {
        bankLSB: 0,
        bankMSB: 0,
        program: 0,
        isGMGSDrum: true
    };

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

        for (let i = 0; i < 128; i++) {
            this.keyParams.push({
                ...DrumParameterUtils.DEFAULT_USER_DATA[i]
            });
        }
        // Correct init
        this.reset();
    }
    /**
     * Resets the drum set.
     */
    public reset(): void {
        // Initialize all 128 keys to the default drum patch
        for (let i = 0; i < 128; i++) {
            DrumParameterUtils.copyIntoUser(
                DrumParameterUtils.DEFAULT_USER_DATA[i],
                this.keyParams[i]
            );
        }
    }

    /**
     * Gets a snapshot of this User Drum Set instance.
     */
    public getSnapshot(): UserDrumSetParameter[] {
        return this.keyParams.map((param) => ({ ...param }));
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
        const binding = this.keyParams[midiNote];
        this.tempPatch.bankLSB = binding.sourceDrumSet;
        this.tempPatch.program = binding.program;
        let resolvedPatch = this.resolvePatch(this.tempPatch);
        // Protect from binding to self as well
        if (!resolvedPatch || resolvedPatch === this) {
            resolvedPatch = this.resolvePatch(FALLBACK_PATCH);
            if (!resolvedPatch) {
                // No drums at all
                return [];
            }
        }
        const params = resolvedPatch.getVoiceParameters(
            binding.sourceNoteNumber,
            velocity
        );

        // Ensure that the key sounds as intended, similarly to 'PGAL' DLS chunk alias
        for (const p of params) {
            if (p.generators[GeneratorTypes.keyNum] < 0)
                p.generators[GeneratorTypes.keyNum] = binding.sourceNoteNumber;
        }
        return params;
    }
}

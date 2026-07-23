import {
    type MIDIPatch,
    MIDIPatchTools
} from "../../soundbank/basic_soundbank/midi_patch";
import type { VoiceParameters } from "../../soundbank/types";
import type { SynthesizerPatch } from "../types";
import { GeneratorTypes } from "../../soundbank/basic_soundbank/generator_types";
import { DrumParameters } from "./channel/drum_parameters";
import { DEFAULT_DRUM_REVERB } from "./channel/reset";
import { SpessaLog } from "../../utils/loggin";

const DEFAULT_DRUM_PATCH: MIDIPatch = {
    bankLSB: 0,
    bankMSB: 0,
    program: 0,
    isGMGSDrum: true
};

/**
 * TODO: add to MIDIUtils and add support for bulk dump
 */

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
    public readonly keyBindings: {
        patch: MIDIPatch;
        key: number;
        params: DrumParameters;
    }[] = [];

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

        for (let i = 0; i < 128; i++) {
            this.keyBindings.push({
                patch: { ...DEFAULT_DRUM_PATCH },
                key: i,
                params: new DrumParameters()
            });
        }
    }

    /**
     * Sets the source note number for a specific drum key.
     * @param midiNote The drum key to edit.
     * @param sourceNote The MIDI source note number.
     */
    public setSourceNote(midiNote: number, sourceNote: number) {
        this.keyBindings[midiNote].key = sourceNote;
    }

    /**
     * Sets the source program number for a specific drum key.
     * @param midiNote The drum key to edit.
     * @param sourceProgram The MIDI source program number.
     */
    public setSourceProgram(midiNote: number, sourceProgram: number) {
        this.keyBindings[midiNote].patch.program = sourceProgram;
    }

    /**
     * Sets the source MAP (bank LSB) number for a specific drum key.
     * @param midiNote The drum key to edit.
     * @param sourceMap The MIDI source MAP (bank LSB) number.
     */
    public setSourceMap(midiNote: number, sourceMap: number) {
        this.keyBindings[midiNote].patch.bankLSB = sourceMap;
    }

    /**
     * Resets all key bindings to the default GM/GS drum patch.
     */
    public reset(): void {
        // Initialize all 128 keys to the default drum patch
        for (let i = 0; i < 128; i++) {
            this.keyBindings[i].patch = { ...DEFAULT_DRUM_PATCH };
            this.keyBindings[i].key = i;
            const p = this.keyBindings[i].params;
            p.pitch = 0;
            p.gain = 1;
            p.exclusiveClass = 0;
            p.pan = 64;
            p.reverbGain = DEFAULT_DRUM_REVERB[i] / 127;
            p.chorusGain = 0;
            p.delayGain = 0; // No drums have delay
            p.rxNoteOn = true;
            p.rxNoteOff = false;
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
        SpessaLog.info(
            "Resolving patch for",
            MIDIPatchTools.toMIDIString(binding.patch),
            resolvedPatch.name
        );
        const params = resolvedPatch.getVoiceParameters(binding.key, velocity);

        // Ensure that the key sounds as intended, similarly to 'PGAL' DLS chunk alias
        for (const p of params) {
            if (p.generators[GeneratorTypes.keyNum] < 0)
                p.generators[GeneratorTypes.keyNum] = binding.key;
        }
        return params;
    }
}

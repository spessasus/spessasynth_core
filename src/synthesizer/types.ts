import type { MIDIPatchFull } from "../soundbank/basic_soundbank/midi_patch";

import type { BasicSoundBank } from "../soundbank/basic_soundbank/basic_soundbank";
import type { VoiceParameters } from "../soundbank/types";
import type {
    GSChorusProcessor,
    GSDelayProcessor,
    GSReverbProcessor
} from "./audio_engine/effects/gs/types";
import type { XGReverbBlock } from "./audio_engine/effects/xg/interface/xg_reverb_block";
import type { XGChorusBlock } from "./audio_engine/effects/xg/interface/xg_chorus_block";
import type { XGVariationBlock } from "./audio_engine/effects/xg/interface/xg_variation_block";
import type { XGInsertionBlock } from "./audio_engine/effects/xg/interface/xg_insertion_block";

/**
 * Represents a single entry in the {@link SoundBankManager} list.
 *
 * @group Synthesizer.Sound Bank Integration
 */
export interface SoundBankManagerListEntry {
    /**
     * The unique string identifier of the sound bank,
     * used to specify which one to add/remove.
     */
    id: string;
    /**
     * The sound bank itself.
     */
    soundBank: BasicSoundBank;
    /**
     * The bank MSB offset for this sound bank.
     * This value will be added to all {@link BasicPreset.bankMSB} fields when resolving the preset list.
     */
    bankOffset: number;
}

export * from "./events";

/**
 * Additional scheduling options for {@link SpessaSynthProcessor}.
 *
 * @group Synthesizer.Options
 */
export interface SynthMethodOptions {
    /**
     * The {@link SpessaSynthProcessor.currentTime} when the event should execute, in seconds.
     */
    time: number;
}

/**
 * Additional options when initializing a {@link SpessaSynthProcessor}.
 *
 * @group Synthesizer.Options
 */
export interface SynthProcessorOptions {
    /**
     * The maximum buffer size the synthesizer can render at once.
     * Attempting to `.process()` more samples than this will result in an error.
     * Defaults to 128.
     *
     * > **Important**
     * >
     * > It is recommended to not increase this value.
     */
    maxBufferSize: number;
    /**
     * If the synthesizer processes the audio effects.
     * This can be changed later.
     */
    effectsEnabled: boolean;
    /**
     * If the event system is enabled.
     * This can be changed later.
     *
     * Event types are described here: {@link SynthesizerEvent}
     */
    eventsEnabled: boolean;
    /**
     * The initial time of the synthesizer, in seconds.
     */
    initialTime: number;

    /**
     * Optional custom GS reverb processor for the synthesizer. Leave undefined to use {@link DefaultGSReverb}.
     */
    gsReverbProcessor?: GSReverbProcessor;

    /**
     * Optional custom GS chorus processor for the synthesizer. Leave undefined to use {@link DefaultGSChorus}.
     */
    gsChorusProcessor?: GSChorusProcessor;

    /**
     * Optional custom GS delay processor for the synthesizer. Leave undefined to use {@link DefaultGSDelay}.
     */
    gsDelayProcessor?: GSDelayProcessor;

    /**
     * Optional custom XG reverb block for the synthesizer. Leave undefined to use {@link DefaultXGReverb}.
     *
     * > **Note**
     * >
     * > Only active in XG mode.
     */
    xgReverbBlock?: XGReverbBlock;

    /**
     * Optional custom XG chorus block for the synthesizer. Leave undefined to use {@link DefaultXGChorus}.
     *
     * > **Note**
     * >
     * > Only active in XG mode.
     */
    xgChorusBlock?: XGChorusBlock;

    /**
     * Optional custom XG variation block for the synthesizer. Leave undefined to use {@link DefaultXGVariation}.
     *
     * > **Note**
     * >
     * > Only active in XG mode.
     */
    xgVariationBlock?: XGVariationBlock;

    /**
     * Optional custom XG insertion blocks for the synthesizer. Leave undefined to use {@link DefaultXGInsertion}.
     * Default amount is 4 but theoretically any amount up to 127 (so 128 blocks) can be addressed.
     *
     * > **Note**
     * >
     * > Only active in XG mode.
     */
    xgInsertionBlocks?: XGInsertionBlock[];
}

export * from "./audio_engine/effects/types";

/**
 * A generic synthesizer patch that can return voice parameters.
 * This is used for the virtual GS user drum preset.
 *
 * @group Synthesizer.Sound Bank Integration
 */
export interface SynthesizerPatch extends MIDIPatchFull {
    /**
     * Returns the voice synthesis data for this preset.
     * @param midiNote the MIDI note number.
     * @param velocity the MIDI velocity.
     * @returns the returned sound data.
     */
    getVoiceParameters(midiNote: number, velocity: number): VoiceParameters[];
}

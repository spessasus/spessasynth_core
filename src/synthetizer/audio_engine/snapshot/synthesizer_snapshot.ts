import { SpessaSynthInfo } from "../../../utils/loggin.js";
import { consoleColors } from "../../../utils/other.js";
import { ChannelSnapshot } from "./channel_snapshot.js";
import { masterParameterType } from "../engine_methods/controller_control/master_parameters.js";
import type { KeyModifier } from "../engine_components/key_modifier_manager.ts";
import type { SpessaSynthProcessor } from "../main_processor.ts";
import type { interpolationTypes } from "../../enums.ts";
import type { SynthSystem } from "../../types.ts";

/**
 * Represents a snapshot of the synthesizer's state.
 */
export class SynthesizerSnapshot {
    /**
     * The individual channel snapshots.
     */
    channelSnapshots: ChannelSnapshot[];

    /**
     * Key modifiers.
     */
    keyMappings: KeyModifier[][];

    /**
     * Main synth volume (set by MIDI), from 0 to 1.
     * @type {number}
     */
    mainVolume: number;

    /**
     * Master stereo panning, from -1 to 1.
     */
    pan: number;

    /**
     * The synth's interpolation type.
     */
    interpolation: interpolationTypes;

    /**
     * The synth's system. Values can be "gs", "gm", "gm2" or "xg".
     */
    system: SynthSystem;

    /**
     * The current synth transposition in semitones. Can be a float.
     */
    transposition: number;

    /**
     * Creates a new synthesizer snapshot.
     * @param spessaSynthProcessor the processor to take a snapshot of.
     */
    constructor(spessaSynthProcessor: SpessaSynthProcessor) {
        // channel snapshots
        this.channelSnapshots = spessaSynthProcessor.midiAudioChannels.map(
            (_, i) =>
                ChannelSnapshot.getChannelSnapshot(spessaSynthProcessor, i)
        );

        // key mappings
        this.keyMappings =
            spessaSynthProcessor.keyModifierManager.getMappings();
        // pan and volume
        this.mainVolume = spessaSynthProcessor.masterGain;
        this.pan = spessaSynthProcessor.pan;

        // others
        this.system = spessaSynthProcessor.system;
        this.interpolation = spessaSynthProcessor.interpolationType;
        this.transposition = spessaSynthProcessor.transposition;
    }

    /**
     * Creates a snapshot of the synthesizer's state.
     * @param spessaSynthProcessor the processor to take a snapshot of.
     * @returns the snapshot.
     * @deprecated use a non-static version instead
     */
    static createSynthesizerSnapshot(
        spessaSynthProcessor: SpessaSynthProcessor
    ): SynthesizerSnapshot {
        return new SynthesizerSnapshot(spessaSynthProcessor);
    }

    /**
     * Applies the snapshot to the synthesizer.
     * @param spessaSynthProcessor the processor to apply the snapshot to.
     * @param snapshot the snapshot to use.
     * @deprecated use a non-static version instead
     */
    static applySnapshot(
        spessaSynthProcessor: SpessaSynthProcessor,
        snapshot: SynthesizerSnapshot
    ) {
        snapshot.applySnapshot(spessaSynthProcessor);
    }

    /**
     * Applies the snapshot to the synthesizer.
     * @param spessaSynthProcessor the processor to apply the snapshot to.
     */
    applySnapshot(spessaSynthProcessor: SpessaSynthProcessor) {
        // restore system
        spessaSynthProcessor.setSystem(this.system);

        // restore pan and volume
        spessaSynthProcessor.setMasterParameter(
            masterParameterType.mainVolume,
            this.mainVolume
        );
        spessaSynthProcessor.setMasterParameter(
            masterParameterType.masterPan,
            this.pan
        );
        spessaSynthProcessor.transposeAllChannels(this.transposition);
        spessaSynthProcessor.interpolationType = this.interpolation;
        spessaSynthProcessor.keyModifierManager.setMappings(
            this.keyMappings
        );

        // add channels if more needed
        while (
            spessaSynthProcessor.midiAudioChannels.length <
            this.channelSnapshots.length
            ) {
            spessaSynthProcessor.createMidiChannel();
        }

        // restore channels
        this.channelSnapshots.forEach((channelSnapshot, index) => {
            ChannelSnapshot.applyChannelSnapshot(
                spessaSynthProcessor,
                index,
                channelSnapshot
            );
        });

        SpessaSynthInfo(
            "%cFinished restoring controllers!",
            consoleColors.info
        );
    }
}

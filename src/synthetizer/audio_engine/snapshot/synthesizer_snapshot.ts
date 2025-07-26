import { SpessaSynthInfo } from "../../../utils/loggin";
import { consoleColors } from "../../../utils/other";
import { ChannelSnapshot } from "./channel_snapshot";
import { type KeyModifier } from "../engine_components/key_modifier_manager";
import { type SpessaSynthProcessor } from "../main_processor";
import type { interpolationTypes } from "../../enums";
import type { SynthSystem } from "../../types";

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
    keyMappings: (KeyModifier | undefined)[][];

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

    constructor(
        channelSnapshots: ChannelSnapshot[],
        keyMappings: (KeyModifier | undefined)[][],
        mainVolume: number,
        pan: number,
        interpolation: interpolationTypes,
        system: SynthSystem,
        transposition: number
    ) {
        this.channelSnapshots = channelSnapshots;
        this.keyMappings = keyMappings;
        this.mainVolume = mainVolume;
        this.pan = pan;
        this.interpolation = interpolation;
        this.system = system;
        this.transposition = transposition;
    }

    /**
     * Creates a new synthesizer snapshot from the given SpessaSynthProcessor.
     * @param spessaSynthProcessor the processor to take a snapshot of.
     * @returns The snapshot.
     */
    static create(
        spessaSynthProcessor: SpessaSynthProcessor
    ): SynthesizerSnapshot {
        // channel snapshots
        const channelSnapshots = spessaSynthProcessor.midiChannels.map((_, i) =>
            ChannelSnapshot.create(spessaSynthProcessor, i)
        );

        // key mappings
        const keyMappings =
            spessaSynthProcessor.keyModifierManager.getMappings();

        // pan and volume
        const mainVolume =
            spessaSynthProcessor.getMasterParameter("masterGain");
        const pan = spessaSynthProcessor.getMasterParameter("masterPan");

        // others
        const system = spessaSynthProcessor.getMasterParameter("midiSystem");
        const interpolation =
            spessaSynthProcessor.getMasterParameter("interpolationType");
        const transposition =
            spessaSynthProcessor.getMasterParameter("transposition");

        return new SynthesizerSnapshot(
            channelSnapshots,
            keyMappings,
            mainVolume,
            pan,
            interpolation,
            system,
            transposition
        );
    }

    /**
     * Creates a snapshot of the synthesizer's state.
     * @param spessaSynthProcessor the processor to take a snapshot of.
     * @returns the snapshot.
     * @deprecated use a 'create' instead
     */
    static createSynthesizerSnapshot(
        spessaSynthProcessor: SpessaSynthProcessor
    ): SynthesizerSnapshot {
        return SynthesizerSnapshot.create(spessaSynthProcessor);
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
        snapshot.apply(spessaSynthProcessor);
    }

    /**
     * Applies the snapshot to the synthesizer.
     * @param spessaSynthProcessor the processor to apply the snapshot to.
     */
    apply(spessaSynthProcessor: SpessaSynthProcessor) {
        // restore system
        spessaSynthProcessor.setMasterParameter("midiSystem", this.system);

        // restore pan and volume
        spessaSynthProcessor.setMasterParameter("masterGain", this.mainVolume);
        spessaSynthProcessor.setMasterParameter("masterPan", this.pan);
        spessaSynthProcessor.setMasterParameter(
            "transposition",
            this.transposition
        );
        spessaSynthProcessor.setMasterParameter(
            "interpolationType",
            this.interpolation
        );
        spessaSynthProcessor.keyModifierManager.setMappings(this.keyMappings);

        // add channels if more needed
        while (
            spessaSynthProcessor.midiChannels.length <
            this.channelSnapshots.length
        ) {
            spessaSynthProcessor.createMidiChannel();
        }

        // restore channels
        this.channelSnapshots.forEach((channelSnapshot) => {
            channelSnapshot.apply(spessaSynthProcessor);
        });

        SpessaSynthInfo(
            "%cFinished restoring controllers!",
            consoleColors.info
        );
    }
}

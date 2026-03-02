import { ChannelSnapshot } from "./channel_snapshot";
import { type KeyModifier } from "../engine_components/key_modifier_manager";
import { type SpessaSynthProcessor } from "../../processor";
import type { MasterParameterType } from "../../types";
import type {
    ChorusProcessorSnapshot,
    DelayProcessorSnapshot,
    ReverbProcessorSnapshot
} from "../effects/types";

/**
 * Represents a snapshot of the synthesizer's state.
 */
export class SynthesizerSnapshot {
    /**
     * The individual channel snapshots.
     */
    public channelSnapshots: ChannelSnapshot[];

    /**
     * Key modifiers.
     */
    public keyMappings: (KeyModifier | undefined)[][];

    public masterParameters: MasterParameterType;

    public reverbSnapshot: ReverbProcessorSnapshot;
    public chorusSnapshot: ChorusProcessorSnapshot;
    public delaySnapshot: DelayProcessorSnapshot;

    public constructor(
        channelSnapshots: ChannelSnapshot[],
        masterParameters: MasterParameterType,
        keyMappings: (KeyModifier | undefined)[][],
        reverbSnapshot: ReverbProcessorSnapshot,
        chorusSnapshot: ChorusProcessorSnapshot,
        delaySnapshot: DelayProcessorSnapshot
    ) {
        this.channelSnapshots = channelSnapshots;
        this.masterParameters = masterParameters;
        this.keyMappings = keyMappings;
        this.reverbSnapshot = reverbSnapshot;
        this.chorusSnapshot = chorusSnapshot;
        this.delaySnapshot = delaySnapshot;
    }

    /**
     * Creates a new synthesizer snapshot from the given SpessaSynthProcessor.
     * @param processor the processor to take a snapshot of.
     * @returns The snapshot.
     */
    public static create(processor: SpessaSynthProcessor): SynthesizerSnapshot {
        // Channel snapshots
        const channelSnapshots = processor.midiChannels.map((_, i) =>
            ChannelSnapshot.create(processor, i)
        );

        return new SynthesizerSnapshot(
            channelSnapshots,
            processor.getAllMasterParameters(),
            processor.keyModifierManager.getMappings(),
            processor.reverbProcessor.getSnapshot(),
            processor.chorusProcessor.getSnapshot(),
            processor.delayProcessor.getSnapshot()
        );
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Creates a copy of existing snapshot.
     * @param snapshot The snapshot to create a copy from.
     */
    public static copyFrom(snapshot: SynthesizerSnapshot): SynthesizerSnapshot {
        return new SynthesizerSnapshot(
            snapshot.channelSnapshots.map((s) => ChannelSnapshot.copyFrom(s)),
            { ...snapshot.masterParameters },
            [...snapshot.keyMappings],
            { ...snapshot.reverbSnapshot },
            { ...snapshot.chorusSnapshot },
            { ...snapshot.delaySnapshot }
        );
    }

    /**
     * Applies the snapshot to the synthesizer.
     * @param processor the processor to apply the snapshot to.
     */
    public apply(processor: SpessaSynthProcessor) {
        // Restore key modifiers
        processor.keyModifierManager.setMappings(this.keyMappings);

        // Add channels if more needed
        while (processor.midiChannels.length < this.channelSnapshots.length) {
            processor.createMIDIChannel();
        }

        // Restore channels
        for (const channelSnapshot of this.channelSnapshots) {
            channelSnapshot.apply(processor);
        }

        // Restore effect processors
        for (const [key, value] of Object.entries(this.reverbSnapshot))
            processor.reverbProcessor[key as keyof ReverbProcessorSnapshot] =
                value as number;
        for (const [key, value] of Object.entries(this.chorusSnapshot))
            processor.chorusProcessor[key as keyof ChorusProcessorSnapshot] =
                value as number;
        for (const [key, value] of Object.entries(this.delaySnapshot))
            processor.delayProcessor[key as keyof DelayProcessorSnapshot] =
                value as number;

        // Restore master parameters last
        type MasterParameterPair<K extends keyof MasterParameterType> = [
            K,
            MasterParameterType[K]
        ];
        const entries = Object.entries(
            this.masterParameters
        ) as MasterParameterPair<keyof MasterParameterType>[];
        for (const [parameter, value] of entries) {
            processor.setMasterParameter(parameter, value);
        }
    }
}

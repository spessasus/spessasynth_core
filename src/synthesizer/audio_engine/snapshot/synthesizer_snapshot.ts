import { ChannelSnapshot } from "./channel_snapshot";
import { type KeyModifier } from "../engine_components/key_modifier_manager";
import { type SpessaSynthProcessor } from "../../processor";
import type { MasterParameterType } from "../../types";

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

    public constructor(
        channelSnapshots: ChannelSnapshot[],
        masterParameters: MasterParameterType,
        keyMappings: (KeyModifier | undefined)[][]
    ) {
        this.channelSnapshots = channelSnapshots;
        this.masterParameters = masterParameters;
        this.keyMappings = keyMappings;
    }

    /**
     * Creates a new synthesizer snapshot from the given SpessaSynthProcessor.
     * @param processor the processor to take a snapshot of.
     * @returns The snapshot.
     */
    public static create(processor: SpessaSynthProcessor): SynthesizerSnapshot {
        // channel snapshots
        const channelSnapshots = processor.midiChannels.map((_, i) =>
            ChannelSnapshot.create(processor, i)
        );

        return new SynthesizerSnapshot(
            channelSnapshots,
            processor.getAllMasterParameters(),
            processor.keyModifierManager.getMappings()
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
            [...snapshot.keyMappings]
        );
    }

    /**
     * Applies the snapshot to the synthesizer.
     * @param processor the processor to apply the snapshot to.
     */
    public apply(processor: SpessaSynthProcessor) {
        type MasterParameterPair<K extends keyof MasterParameterType> = [
            K,
            MasterParameterType[K]
        ];
        const entries = Object.entries(
            this.masterParameters
        ) as MasterParameterPair<keyof MasterParameterType>[];
        entries.forEach(([parameter, value]) => {
            processor.setMasterParameter(parameter, value);
        });

        // restore key modifiers
        processor.keyModifierManager.setMappings(this.keyMappings);

        // add channels if more needed
        while (processor.midiChannels.length < this.channelSnapshots.length) {
            processor.createMIDIChannel();
        }

        // restore channels
        this.channelSnapshots.forEach((channelSnapshot) => {
            channelSnapshot.apply(processor);
        });
    }
}

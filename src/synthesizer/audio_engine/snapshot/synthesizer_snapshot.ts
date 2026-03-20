import { ChannelSnapshot } from "./channel_snapshot";
import { type KeyModifier } from "../engine_components/key_modifier_manager";
import { type SpessaSynthProcessor } from "../../processor";
import type { MasterParameterType } from "../../types";
import type {
    ChorusProcessorSnapshot,
    DelayProcessorSnapshot,
    InsertionProcessorSnapshot,
    ReverbProcessorSnapshot
} from "../effects/types";
import { channelToSyx } from "../../../utils/sysex_detector";

function sendAddress(
    s: SpessaSynthProcessor,
    a1: number,
    a2: number,
    a3: number,
    data: number[],
    offset = 0
) {
    // Calculate checksum
    // https://cdn.roland.com/assets/media/pdf/F-20_MIDI_Imple_e01_W.pdf section 4
    const sum = a1 + a2 + a3 + data.reduce((sum, cur) => sum + cur, 0);
    const checksum = (128 - (sum % 128)) & 0x7f;
    s.systemExclusive(
        [
            0x41, // Roland
            0x10, // Device ID (defaults to 16 on roland)
            0x42, // GS
            0x12, // Command ID (DT1) (whatever that means...)
            a1,
            a2,
            a3,
            ...data,
            checksum,
            0xf7 // End of exclusive
        ],
        offset
    );
}

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
    public insertionSnapshot: InsertionProcessorSnapshot;

    public constructor(
        channelSnapshots: ChannelSnapshot[],
        masterParameters: MasterParameterType,
        keyMappings: (KeyModifier | undefined)[][],
        reverbSnapshot: ReverbProcessorSnapshot,
        chorusSnapshot: ChorusProcessorSnapshot,
        delaySnapshot: DelayProcessorSnapshot,
        insertionSnapshot: InsertionProcessorSnapshot
    ) {
        this.channelSnapshots = channelSnapshots;
        this.masterParameters = masterParameters;
        this.keyMappings = keyMappings;
        this.reverbSnapshot = reverbSnapshot;
        this.chorusSnapshot = chorusSnapshot;
        this.delaySnapshot = delaySnapshot;
        this.insertionSnapshot = insertionSnapshot;
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
            processor.delayProcessor.getSnapshot(),
            processor.getInsertionSnapshot()
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
            { ...snapshot.delaySnapshot },
            { ...snapshot.insertionSnapshot }
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

        // Restore insertion
        const is = this.insertionSnapshot;
        sendAddress(processor, 0x40, 0x03, 0x00, [
            is.type >> 8,
            is.type & 0x7f
        ]);

        for (let i = 0; i < is.params.length; i++) {
            if (is.params[i] !== 255)
                sendAddress(processor, 0x40, 0x03, 3 + i, [is.params[i]]);
        }

        for (let channel = 0; channel < is.channels.length; channel++) {
            sendAddress(processor, 0x40, 0x40 | channelToSyx(channel), 0x22, [
                is.channels[channel] ? 1 : 0
            ]);
        }

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

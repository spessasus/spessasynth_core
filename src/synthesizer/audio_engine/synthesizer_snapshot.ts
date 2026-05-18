import type { ChannelSnapshot } from "./channel/channel_snapshot";
import { type KeyModifier } from "./key_modifier_manager";
import type {
    ChorusProcessorSnapshot,
    DelayProcessorSnapshot,
    InsertionProcessorSnapshot,
    ReverbProcessorSnapshot
} from "./effects/types";
import { MIDIUtils } from "../../midi/midi_tools/midi_utils";
import type { SynthesizerCore } from "./synthesizer_core";
import type { GlobalMIDIParameter } from "./parameters/midi";
import type { GlobalSystemParameter } from "./parameters/system";

export interface SynthesizerSnapshot {
    midiChannels: ChannelSnapshot[];

    /**
     * Key modifiers.
     */
    keyMappings: (KeyModifier | undefined)[][];

    systemParameters: GlobalSystemParameter;
    midiParameters: GlobalMIDIParameter;

    reverbProcessor: ReverbProcessorSnapshot;
    chorusProcessor: ChorusProcessorSnapshot;
    delayProcessor: DelayProcessorSnapshot;
    insertionProcessor: InsertionProcessorSnapshot;
}

export function applySnapshot(
    this: SynthesizerCore,
    snapshot: SynthesizerSnapshot
) {
    // Restore key modifiers
    this.keyModifierManager.setMappings(snapshot.keyMappings);

    // Add channels if more needed
    while (this.midiChannels.length < snapshot.midiChannels.length)
        this.createMIDIChannel(true);

    // Restore channels
    for (let i = 0; i < snapshot.midiChannels.length; i++)
        this.midiChannels[i].applySnapshot(snapshot.midiChannels[i]);

    // Restore effect processors
    for (const [key, value] of Object.entries(snapshot.reverbProcessor))
        this.reverbProcessor[key as keyof ReverbProcessorSnapshot] =
            value as number;
    for (const [key, value] of Object.entries(this.chorusProcessor))
        this.chorusProcessor[key as keyof ChorusProcessorSnapshot] =
            value as number;
    for (const [key, value] of Object.entries(this.delayProcessor))
        this.delayProcessor[key as keyof DelayProcessorSnapshot] =
            value as number;

    // Restore insertion
    const is = snapshot.insertionProcessor;
    this.systemExclusive(
        MIDIUtils.gsData(0x40, 0x03, 0x00, [is.type >> 8, is.type & 0x7f])
    );

    for (let i = 0; i < is.params.length; i++) {
        if (is.params[i] !== 255)
            this.systemExclusive(
                MIDIUtils.gsData(0x40, 0x03, 3 + i, [is.params[i]])
            );
    }

    for (let channel = 0; channel < is.channels.length; channel++) {
        this.systemExclusive(
            MIDIUtils.gsData(
                0x40,
                0x40 | MIDIUtils.channelToSyx(channel),
                0x22,
                [is.channels[channel] ? 1 : 0]
            )
        );
    }

    // Restore MIDI parameters
    type MIDIParameterPair<K extends keyof GlobalMIDIParameter> = [
        K,
        GlobalMIDIParameter[K]
    ];
    for (const [parameter, value] of Object.entries(
        this.midiParameters
    ) as MIDIParameterPair<keyof GlobalMIDIParameter>[]) {
        this.setMIDIParameter(parameter, value);
    }

    // Restore system parameters last
    type SystemParameterPair<K extends keyof GlobalSystemParameter> = [
        K,
        GlobalSystemParameter[K]
    ];
    for (const [parameter, value] of Object.entries(
        this.systemParameters
    ) as SystemParameterPair<keyof GlobalSystemParameter>[]) {
        this.setSystemParameter(parameter, value);
    }
}

export function getSynthesizerSnapshot(
    this: SynthesizerCore
): SynthesizerSnapshot {
    return {
        midiParameters: { ...this.midiParameters },
        systemParameters: { ...this.systemParameters },
        midiChannels: this.midiChannels.map((c) => c.getSnapshot()),
        keyMappings: this.keyModifierManager.getMappings(),
        reverbProcessor: this.reverbProcessor.getSnapshot(),
        chorusProcessor: this.chorusProcessor.getSnapshot(),
        delayProcessor: this.delayProcessor.getSnapshot(),
        insertionProcessor: this.getInsertionSnapshot()
    };
}

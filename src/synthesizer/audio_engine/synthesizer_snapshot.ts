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

import { DrumParameterUtils } from "../../midi/drum_parameters";
import type { UserDrumSetParameter } from "../../midi/types";

export interface SynthesizerSnapshot {
    midiChannels: ChannelSnapshot[];

    /**
     * Key modifiers.
     */
    keyMappings: (KeyModifier | undefined)[][];

    midiParameters: GlobalMIDIParameter;
    lockedMIDIParameters: Record<keyof GlobalMIDIParameter, boolean>;
    systemParameters: GlobalSystemParameter;

    reverbProcessor: ReverbProcessorSnapshot;
    chorusProcessor: ChorusProcessorSnapshot;
    delayProcessor: DelayProcessorSnapshot;
    insertionProcessor: InsertionProcessorSnapshot;

    userDrumSet1: UserDrumSetParameter[];
    userDrumSet2: UserDrumSetParameter[];
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
        MIDIUtils.gs(0x40, 0x03, 0x00, [is.type >> 8, is.type & 0x7f])
    );

    for (let i = 0; i < is.params.length; i++) {
        if (is.params[i] !== 255)
            this.systemExclusive(
                MIDIUtils.gs(0x40, 0x03, 3 + i, [is.params[i]])
            );
    }

    // Restore user drum sets
    const ud1 = snapshot.userDrumSet1;
    for (let midiNote = 0; midiNote < ud1.length; midiNote++) {
        DrumParameterUtils.copyIntoUser(
            ud1[midiNote],
            this.soundBankManager.userDrumSets[0].keyParams[midiNote]
        );
    }
    const ud2 = snapshot.userDrumSet2;
    for (let midiNote = 0; midiNote < ud2.length; midiNote++) {
        DrumParameterUtils.copyIntoUser(
            ud2[midiNote],
            this.soundBankManager.userDrumSets[1].keyParams[midiNote]
        );
    }

    // Restore MIDI parameters
    type MIDIParameterPair<K extends keyof GlobalMIDIParameter> = [
        K,
        GlobalMIDIParameter[K]
    ];
    for (const [parameter, value] of Object.entries(
        snapshot.midiParameters
    ) as MIDIParameterPair<keyof GlobalMIDIParameter>[]) {
        this.setMIDIParameter(parameter, value);
    }
    for (const [parameter, isLocked] of Object.entries(
        snapshot.lockedMIDIParameters
    ) as [keyof GlobalMIDIParameter, boolean][]) {
        this.lockMIDIParameter(parameter, isLocked);
    }

    // Restore system parameters last
    type SystemParameterPair<K extends keyof GlobalSystemParameter> = [
        K,
        GlobalSystemParameter[K]
    ];
    for (const [parameter, value] of Object.entries(
        snapshot.systemParameters
    ) as SystemParameterPair<keyof GlobalSystemParameter>[]) {
        this.setSystemParameter(parameter, value);
    }
}

export function getSynthesizerSnapshot(
    this: SynthesizerCore
): SynthesizerSnapshot {
    return {
        midiParameters: { ...this.midiParameters },
        lockedMIDIParameters: { ...this.lockedMIDIParameters },
        systemParameters: { ...this.systemParameters },
        midiChannels: this.midiChannels.map((c) => c.getSnapshot()),
        keyMappings: this.keyModifierManager.getMappings(),
        reverbProcessor: this.reverbProcessor.getSnapshot(),
        chorusProcessor: this.chorusProcessor.getSnapshot(),
        delayProcessor: this.delayProcessor.getSnapshot(),
        insertionProcessor: this.getInsertionSnapshot(),
        userDrumSet1: this.soundBankManager.userDrumSets[0].getSnapshot(),
        userDrumSet2: this.soundBankManager.userDrumSets[1].getSnapshot()
    };
}

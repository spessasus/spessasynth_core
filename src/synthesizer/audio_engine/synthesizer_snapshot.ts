import type { ChannelSnapshot } from "./channel/channel_snapshot";
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

/**
 * This interface is a snapshot of a {@link SpessaSynthProcessor},
 * capturing its current state, which can be saved and restored.
 *
 * This can be useful for creating a different processor
 * (for example, for rendering to an audio file)
 * and copying the current processor's state.
 *
 * @group Synthesizer.Snapshots
 */
export interface SynthesizerSnapshot {
    /**
     * The snapshots of all MIDI channels of the synth.
     */
    midiChannels: ChannelSnapshot[];

    /**
     * All Global MIDI Parameters of the synthesizer.
     */
    midiParameters: GlobalMIDIParameter;
    /**
     * Locks of all Global MIDI Parameters of the synthesizer.
     */
    lockedMIDIParameters: Record<keyof GlobalMIDIParameter, boolean>;
    /**
     * All Global System Parameters of the synthesizer.
     */
    systemParameters: GlobalSystemParameter;

    /**
     * A snapshot of the reverb processor.
     */
    reverbProcessor: ReverbProcessorSnapshot;
    /**
     * A snapshot of the chorus processor.
     */
    chorusProcessor: ChorusProcessorSnapshot;
    /**
     * A snapshot of the delay processor.
     */
    delayProcessor: DelayProcessorSnapshot;
    /**
     * A snapshot of the insertion effect processor.
     */
    insertionProcessor: InsertionProcessorSnapshot;

    /**
     * A snapshot of the User Drum Set parameters.
     */
    userDrumSets: UserDrumSetParameter[][];
}

export function applySnapshot(
    this: SynthesizerCore,
    snapshot: SynthesizerSnapshot
) {
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
    for (let drumSet = 0; drumSet < snapshot.userDrumSets.length; drumSet++) {
        const userDrumSet = snapshot.userDrumSets[drumSet];
        for (let midiNote = 0; midiNote < userDrumSet.length; midiNote++) {
            DrumParameterUtils.copyIntoUser(
                userDrumSet[midiNote],
                this.soundBankManager.userDrumSets[drumSet].keyParams[midiNote]
            );
        }
    }

    // Restore MIDI parameters
    type MIDIParameterPair<K extends keyof GlobalMIDIParameter> = [
        K,
        GlobalMIDIParameter[K]
    ];

    // Unlock them first
    for (const parameter of Object.keys(
        snapshot.lockedMIDIParameters
    ) as (keyof GlobalMIDIParameter)[]) {
        this.lockMIDIParameter(parameter, false);
    }

    // Then set
    for (const [parameter, value] of Object.entries(
        snapshot.midiParameters
    ) as MIDIParameterPair<keyof GlobalMIDIParameter>[]) {
        this.setMIDIParameter(parameter, value);
    }

    // Then re-lock!
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

    // Then update active effects
    this.updateActiveEffects();
}

export function getSynthesizerSnapshot(
    this: SynthesizerCore
): SynthesizerSnapshot {
    return {
        midiParameters: { ...this.midiParameters },
        lockedMIDIParameters: { ...this.lockedMIDIParameters },
        systemParameters: { ...this.systemParameters },
        midiChannels: this.midiChannels.map((c) => c.getSnapshot()),
        reverbProcessor: this.reverbProcessor.getSnapshot(),
        chorusProcessor: this.chorusProcessor.getSnapshot(),
        delayProcessor: this.delayProcessor.getSnapshot(),
        insertionProcessor: this.getInsertionSnapshot(),
        userDrumSets: this.soundBankManager.userDrumSets.map((d) =>
            d.getSnapshot()
        )
    };
}

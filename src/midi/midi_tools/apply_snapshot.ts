import type { BasicMIDI } from "../basic_midi";
import type { SynthesizerSnapshot } from "../../synthesizer/audio_engine/synthesizer_snapshot";
import type { MIDIPatch } from "../../soundbank/basic_soundbank/midi_patch";
import { type MIDIController, MIDIControllers } from "../enums";
import { CONTROLLER_TABLE_SIZE } from "../../synthesizer/audio_engine/synth_constants";
import type { ChannelModification, ClearableParameter } from "./modify_midi";
import type { ChannelMIDIParameter } from "../../synthesizer/audio_engine/channel/parameters/midi";
import type { GlobalMIDIParameter } from "../../synthesizer/audio_engine/parameters/midi";

/**
 * Modifies the sequence *in-place* according to the locked presets and controllers in the given snapshot.
 *
 * Note that System Parameters `fineTune` and `keyShift` are passed to the relative tuning parameters of the channels.
 * Only locked MIDI parameters and controllers are applied.
 */
export function applySnapshotInternal(
    midi: BasicMIDI,
    snapshot: SynthesizerSnapshot
) {
    const channels = new Map<number, ClearableParameter<ChannelModification>>();
    const globalKeyShift = snapshot.systemParameters.keyShift;
    const globalFineTune = snapshot.systemParameters.fineTune;
    for (
        let channelNumber = 0;
        channelNumber < snapshot.midiChannels.length;
        channelNumber++
    ) {
        const channelSnapshot = snapshot.midiChannels[channelNumber];
        if (channelSnapshot.systemParameters.isMuted) {
            channels.set(channelNumber, "clear");
            continue;
        }
        const keyShift =
            channelSnapshot.systemParameters.keyShift +
            (channelSnapshot.drumChannel ? 0 : globalKeyShift);
        const fineTune =
            channelSnapshot.systemParameters.fineTune +
            (channelSnapshot.drumChannel ? 0 : globalFineTune);
        let patch: MIDIPatch | undefined;
        if (
            channelSnapshot.systemParameters.presetLock &&
            channelSnapshot.patch
        ) {
            patch = { ...channelSnapshot.patch };
        }

        const controllers = new Map<MIDIController, number>();
        for (let ccNumber = 0; ccNumber < CONTROLLER_TABLE_SIZE; ccNumber++) {
            if (
                !channelSnapshot.lockedControllers[ccNumber] ||
                ccNumber === MIDIControllers.bankSelect
            ) {
                continue;
            }
            const targetValue = channelSnapshot.midiControllers[ccNumber] >> 7; // Channel controllers are stored as 14 bit values
            controllers.set(ccNumber as MIDIController, targetValue);
        }

        const midiParams = {} as {
            [P in keyof ChannelMIDIParameter]?: ClearableParameter<
                ChannelMIDIParameter[P]
            >;
        };

        for (const [parameter, value] of Object.entries(
            channelSnapshot.midiParameters
        ) as {
            [K in keyof ChannelMIDIParameter]: [K, ChannelMIDIParameter[K]];
        }[keyof ChannelMIDIParameter][]) {
            if (!channelSnapshot.lockedMIDIParameters[parameter]) continue;
            // Strange cast, but works?
            midiParams[parameter] = value as never;
        }

        channels.set(channelNumber, {
            keyShift,
            fineTune,
            patch,
            controllers,
            midiParams
        });
    }

    const midiParams = {} as {
        [P in keyof GlobalMIDIParameter]?: ClearableParameter<
            GlobalMIDIParameter[P]
        >;
    };

    for (const [parameter, value] of Object.entries(
        snapshot.midiParameters
    ) as {
        [K in keyof GlobalMIDIParameter]: [K, GlobalMIDIParameter[K]];
    }[keyof GlobalMIDIParameter][]) {
        if (!snapshot.lockedMIDIParameters[parameter]) continue;
        // Strange cast, but works?
        midiParams[parameter] = value as never;
    }

    midi.modify({
        channels,
        drumSetupParams: snapshot.systemParameters.drumLock
            ? "clear"
            : undefined,
        reverbParams: snapshot.systemParameters.reverbLock
            ? snapshot.reverbProcessor
            : undefined,
        chorusParams: snapshot.systemParameters.chorusLock
            ? snapshot.chorusProcessor
            : undefined,
        delayParams: snapshot.systemParameters.delayLock
            ? snapshot.delayProcessor
            : undefined,
        insertionParams: snapshot.systemParameters.insertionEffectLock
            ? snapshot.insertionProcessor
            : undefined,
        midiParams
    });
}

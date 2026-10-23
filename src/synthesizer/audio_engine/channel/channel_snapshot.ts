import type { MIDIPatchFull } from "../../../soundbank/basic_soundbank/midi_patch";
import { DrumParameterUtils } from "../../../midi/drum_parameters";
import type { MIDIChannel } from "./midi_channel";
import type { ChannelGenerators } from "./awe32_nrpn";
import type { ChannelSystemParameter } from "./parameters/system";
import type { ChannelMIDIParameter } from "./parameters/midi";
import type { MIDIController } from "../../../midi/enums";
import type { MIDISystem } from "../../../soundbank/types";
import { CONTROLLER_TABLE_SIZE } from "../synth_constants";
import type { DrumParameter } from "../../../midi/types";
import type { CustomChannelVibrato } from "./types";

/**
 * This interface is a snapshot of a {@link MIDIChannel},
 * capturing its current state, which can be saved and restored.
 *
 * See also {@link SynthesizerSnapshot}.
 *
 * @group Synthesizer.Snapshots
 */
export interface ChannelSnapshot {
    /**
     * The currently selected MIDI patch of the channel.
     */
    patch?: MIDIPatchFull;
    /**
     * Indicates the MIDI system when the preset was locked.
     */
    lockedSystem: MIDISystem;

    /**
     * An array of MIDI controllers for the channel.
     * This array is used to store the state of various MIDI controllers
     * such as volume, pan, modulation, etc.
     * @remarks
     * A bit of an explanation:
     * The controller table is stored as an int16 array, it stores 14-bit values, allowing for full 14-bit LSB resolution.
     * The only exception from this are the Registered and Non-Registered Parameter Numbers.
     * Data entries do store it!
     */
    midiControllers: Int16Array;
    /**
     * An array indicating if a controller, at the equivalent index in the {@link MIDIChannel.midiControllers `midiControllers`} array, is locked
     * (i.e., not allowed changing).
     * A locked controller cannot be modified.
     */
    lockedControllers: boolean[];
    /**
     * An array for the MIDI 2.0 Per-note pitch wheels.
     */
    pitchWheels: Int16Array;
    /**
     * Used for handling SF2/AWE32 NRPN generator adjustments.
     */
    generators: ChannelGenerators;

    /**
     * The Channel MIDI Parameters of this channel.
     * These are only editable via MIDI messages.
     */
    midiParameters: ChannelMIDIParameter;
    /**
     * An object indicating if a Channel MIDI parameter, at the equivalent key, is locked
     * (i.e., not allowed changing).
     * A locked parameter cannot be modified.
     */
    lockedMIDIParameters: Record<keyof ChannelMIDIParameter, boolean>;
    /**
     * The Channel System Parameters of this channel.
     * These are only editable via the API.
     */
    systemParameters: ChannelSystemParameter;
    /**
     * An array of octave tuning values for each note on the channel.
     * Each index corresponds to a note (0 = C, 1 = C#, ..., 11 = B).
     * Note: Repeated every 12 notes.
     */
    octaveTuning: Int8Array;

    /**
     * Per-note pitch wheel mode uses the pitchWheels table as source
     * instead of the regular entry in the midiControllers table.
     */
    perNotePitch: boolean;

    /**
     * The vibrato settings for the channel.
     */
    customVibrato: CustomChannelVibrato;

    /**
     * Parameters for each drum instrument.
     */
    drumParams: DrumParameter[];

    /**
     * Indicates whether this channel is a drum channel.
     */
    drumChannel: boolean;

    /**
     * The channel's number (0-based index).
     */
    channel: number;
}

export function getChannelSnapshot(this: MIDIChannel): ChannelSnapshot {
    return {
        patch: this.preset
            ? {
                  ...this.patch,
                  name: this.preset.name,
                  isDrum: this.preset.isDrum
              }
            : undefined,
        lockedSystem: this.lockedSystem,

        midiControllers: this._midiControllers.slice(),
        lockedControllers: [...this.lockedControllers],
        pitchWheels: this.pitchWheels.slice(),
        generators: {
            ...this.generators,
            offsets: this.generators.offsets.slice(),
            overrides: this.generators.overrides.slice()
        },

        midiParameters: {
            ...this._midiParameters
        },
        lockedMIDIParameters: {
            ...this.lockedMIDIParameters
        },
        systemParameters: { ...this._systemParameters },
        octaveTuning: this.octaveTuning.slice(),
        perNotePitch: this.perNotePitch,

        customVibrato: { ...this.customVibrato },

        drumParams: this.drumParams.map((d) => ({ ...d })),
        drumChannel: this._drumChannel,
        channel: this.channel
    };
}

export function applySnapshot(this: MIDIChannel, snapshot: ChannelSnapshot) {
    this._midiControllers.set(snapshot.midiControllers);
    for (let i = 0; i < CONTROLLER_TABLE_SIZE; i++)
        this.lockController(i as MIDIController, snapshot.lockedControllers[i]);

    this.pitchWheels.set(snapshot.pitchWheels);
    this.octaveTuning.set(snapshot.octaveTuning);

    this.perNotePitch = snapshot.perNotePitch;

    this.customVibrato.rate = snapshot.customVibrato.rate;
    this.customVibrato.delay = snapshot.customVibrato.delay;
    this.customVibrato.depth = snapshot.customVibrato.depth;

    this.generators.offsets.set(snapshot.generators.offsets);
    this.generators.overrides.set(snapshot.generators.overrides);
    this.generators.offsetsEnabled = snapshot.generators.offsetsEnabled;
    this.generators.overridesEnabled = snapshot.generators.overridesEnabled;

    for (let i = 0; i < 128; i++)
        DrumParameterUtils.copyInto(snapshot.drumParams[i], this.drumParams[i]);

    // Disable to set patch
    // Restored in system params
    this.setSystemParameter("presetLock", false);
    if (snapshot.patch) {
        this.setBankMSB(snapshot.patch.bankMSB);
        this.setBankLSB(snapshot.patch.bankLSB);
        this.setIsGMGSDrum(snapshot.patch.isGMGSDrum);
        this.programChange(snapshot.patch.program);
        // Fallback if no preset matched and the flag didn't sync
        this.setDrumFlag(snapshot.drumChannel);
    } else {
        this.setDrumFlag(snapshot.drumChannel);
    }
    this.lockedSystem = snapshot.lockedSystem;

    // Restore MIDI parameters
    type MIDIParameterPair<K extends keyof ChannelMIDIParameter> = [
        K,
        ChannelMIDIParameter[K]
    ];

    // Unlock them first
    for (const parameter of Object.keys(
        snapshot.lockedMIDIParameters
    ) as (keyof ChannelMIDIParameter)[]) {
        this.lockMIDIParameter(parameter, false);
    }

    // Then set
    for (const [parameter, value] of Object.entries(
        snapshot.midiParameters
    ) as MIDIParameterPair<keyof ChannelMIDIParameter>[]) {
        this.setMIDIParameter(parameter, value);
    }

    // Then re-lock!
    for (const [parameter, isLocked] of Object.entries(
        snapshot.lockedMIDIParameters
    ) as [keyof ChannelMIDIParameter, boolean][]) {
        this.lockMIDIParameter(parameter, isLocked);
    }

    // Restore system parameters last
    type SystemParameterPair<K extends keyof ChannelSystemParameter> = [
        K,
        ChannelSystemParameter[K]
    ];
    for (const [parameter, value] of Object.entries(
        snapshot.systemParameters
    ) as SystemParameterPair<keyof ChannelSystemParameter>[]) {
        this.setSystemParameter(parameter, value);
    }
}

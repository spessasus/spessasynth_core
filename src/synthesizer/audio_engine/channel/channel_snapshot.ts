import type { MIDIPatchFull } from "../../../soundbank/basic_soundbank/midi_patch";
import { DrumParameters } from "./drum_parameters";
import type { MIDIChannel } from "./midi_channel";
import type { ChannelGenerators } from "./awe32_nrpn";
import type { ChannelSystemParameter } from "./parameters/system";
import type { ChannelMIDIParameter } from "./parameters/midi";
import type { MIDIController } from "../../../midi/enums";
import type { MIDISystem } from "../../../soundbank/types";
import { CONTROLLER_TABLE_SIZE } from "../synth_constants";

export interface DrumParameterSnapshot {
    pitch: number;
    gain: number;
    exclusiveClass: number;
    pan: number;
    reverbGain: number;
    chorusGain: number;
    delayGain: number;
    rxNoteOn: boolean;
    rxNoteOff: boolean;
}

export interface ChannelSnapshot {
    patch?: MIDIPatchFull;
    lockedSystem: MIDISystem;

    midiControllers: Int16Array;
    lockedControllers: boolean[];
    pitchWheels: Int16Array;
    generators: ChannelGenerators;

    midiParameters: ChannelMIDIParameter;
    systemParameters: ChannelSystemParameter;
    octaveTuning: Int8Array;

    perNotePitch: boolean;

    drumParams: DrumParameterSnapshot[];
    drumChannel: boolean;
    channelNumber: number;
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
        systemParameters: { ...this._systemParameters },
        octaveTuning: this.octaveTuning.slice(),
        perNotePitch: this.perNotePitch,

        drumParams: this.drumParams.map((d) => ({ ...d })),
        drumChannel: this._drumChannel,
        channelNumber: this.channel
    };
}

export function applySnapshot(this: MIDIChannel, snapshot: ChannelSnapshot) {
    this.setDrums(snapshot.drumChannel);

    this._midiControllers.set(snapshot.midiControllers);
    for (let i = 0; i < CONTROLLER_TABLE_SIZE; i++)
        this.lockController(i as MIDIController, snapshot.lockedControllers[i]);

    this.pitchWheels.set(snapshot.pitchWheels);
    this.octaveTuning.set(snapshot.octaveTuning);

    this.perNotePitch = snapshot.perNotePitch;

    this.generators.offsets.set(snapshot.generators.offsets);
    this.generators.overrides.set(snapshot.generators.overrides);
    this.generators.offsetsEnabled = snapshot.generators.offsetsEnabled;
    this.generators.overridesEnabled = snapshot.generators.overridesEnabled;

    for (let i = 0; i < 128; i++)
        this.drumParams[i] = DrumParameters.copyFrom(snapshot.drumParams[i]);

    // Disable to set patch
    // Restored in system params
    this.setSystemParameter("presetLock", false);
    if (snapshot.patch) this.setPatch(snapshot.patch);
    this.lockedSystem = snapshot.lockedSystem;

    // Restore MIDI parameters
    type MIDIParameterPair<K extends keyof ChannelMIDIParameter> = [
        K,
        ChannelMIDIParameter[K]
    ];
    for (const [parameter, value] of Object.entries(
        this._midiParameters
    ) as MIDIParameterPair<keyof ChannelMIDIParameter>[]) {
        this.setMIDIParameter(parameter, value);
    }

    // Restore system parameters last
    type SystemParameterPair<K extends keyof ChannelSystemParameter> = [
        K,
        ChannelSystemParameter[K]
    ];
    for (const [parameter, value] of Object.entries(
        this._systemParameters
    ) as SystemParameterPair<keyof ChannelSystemParameter>[]) {
        this.setSystemParameter(parameter, value);
    }
}

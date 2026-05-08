import type { MIDISystem } from "../../types";
import type { MIDIPatchNamed } from "../../../soundbank/basic_soundbank/midi_patch";
import { DrumParameters } from "./drum_parameters";
import type { MIDIChannel } from "./midi_channel";
import type { ChannelGenerators } from "./data_entry/awe32";
import type { CustomChannelVibrato } from "./types";
import type { ChannelMasterParameter } from "./master_parameters";
import type { MIDIChannelParameter } from "./midi_parameters";
import { CONTROLLER_TABLE_SIZE } from "./controller_tables";
import type { MIDIController } from "../../../midi/enums";

export interface ChannelSnapshot {
    patch: MIDIPatchNamed;
    lockedSystem: MIDISystem;

    midiControllers: Int16Array;
    lockedControllers: boolean[];
    pitchWheels: Int16Array;
    generators: ChannelGenerators;

    midiParameters: MIDIChannelParameter;
    masterParameters: ChannelMasterParameter;
    channelVibrato: CustomChannelVibrato;
    octaveTuning: Int8Array;

    perNotePitch: boolean;

    drumParams: DrumParameters[];
    drumChannel: boolean;
    channelNumber: number;
}

export function getChannelSnapshot(this: MIDIChannel): ChannelSnapshot {
    return {
        patch: { ...this.patch, name: this.preset?.name ?? "undefined" },
        lockedSystem: this.lockedSystem,

        midiControllers: this.midiControllers.slice(),
        lockedControllers: [...this.lockedControllers],
        pitchWheels: this.pitchWheels.slice(),
        generators: {
            ...this.generators,
            offsets: this.generators.offsets.slice(),
            overrides: this.generators.overrides.slice()
        },

        channelVibrato: { ...this.vibrato },
        midiParameters: {
            ...this._midiParameters
        },
        masterParameters: { ...this._masterParameters },
        octaveTuning: this.octaveTuning.slice(),
        perNotePitch: this.perNotePitch,

        drumParams: this.drumParams.map((d) =>
            new DrumParameters().copyInto(d)
        ),
        drumChannel: this.drumChannel,
        channelNumber: this.channel
    };
}

export function applySnapshot(this: MIDIChannel, snapshot: ChannelSnapshot) {
    this.setDrums(snapshot.drumChannel);

    this.midiControllers.set(snapshot.midiControllers);
    for (let i = 0; i < CONTROLLER_TABLE_SIZE; i++)
        this.lockController(i as MIDIController, snapshot.lockedControllers[i]);

    this.pitchWheels.set(snapshot.pitchWheels);
    this.vibrato.delay = snapshot.channelVibrato.delay;
    this.vibrato.depth = snapshot.channelVibrato.depth;
    this.vibrato.rate = snapshot.channelVibrato.rate;
    this.octaveTuning.set(snapshot.octaveTuning);

    this.perNotePitch = snapshot.perNotePitch;

    this.generators.offsets.set(snapshot.generators.offsets);
    this.generators.overrides.set(snapshot.generators.overrides);

    for (let i = 0; i < 128; i++)
        snapshot.drumParams[i].copyInto(this.drumParams[i]);

    this.setMasterParameter("presetLock", false); // Restored in master params
    this.setPatch(snapshot.patch);
    this.lockedSystem = snapshot.lockedSystem;

    // Restore MIDI parameters
    type MIDIParameterPair<K extends keyof MIDIChannelParameter> = [
        K,
        MIDIChannelParameter[K]
    ];
    for (const [parameter, value] of Object.entries(
        this._midiParameters
    ) as MIDIParameterPair<keyof MIDIChannelParameter>[]) {
        this.setMIDIParameter(parameter, value);
    }

    // Restore master parameters last
    type MasterParameterPair<K extends keyof ChannelMasterParameter> = [
        K,
        ChannelMasterParameter[K]
    ];
    for (const [parameter, value] of Object.entries(
        this._masterParameters
    ) as MasterParameterPair<keyof ChannelMasterParameter>[]) {
        this.setMasterParameter(parameter, value);
    }
}

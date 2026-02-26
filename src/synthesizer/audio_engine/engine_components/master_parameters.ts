import {
    ALL_CHANNELS_OR_DIFFERENT_ACTION,
    DEFAULT_SYNTH_MODE,
    SYNTHESIZER_GAIN,
    VOICE_CAP
} from "./synth_constants";
import { interpolationTypes } from "../../enums";
import type { MasterParameterType } from "../../types";

export const DEFAULT_MASTER_PARAMETERS: MasterParameterType = {
    masterGain: SYNTHESIZER_GAIN,
    masterPan: 0,
    voiceCap: VOICE_CAP,
    interpolationType: interpolationTypes.hermite,
    midiSystem: DEFAULT_SYNTH_MODE,
    monophonicRetriggerMode: false,
    reverbGain: 1,
    chorusGain: 1,
    delayGain: 1,
    reverbLock: false,
    chorusLock: false,
    delayLock: false,
    drumLock: false,
    customVibratoLock: false,
    nprnParamLock: false,
    blackMIDIMode: false,
    autoAllocateVoices: false,
    transposition: 0,
    deviceID: ALL_CHANNELS_OR_DIFFERENT_ACTION
};

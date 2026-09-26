import type { DrumParameter, UserDrumSetParameter } from "../types";
import type {
    GSChorusParameter,
    GSDelayParameter,
    GSReverbParameter
} from "../../synthesizer/audio_engine/effects/types";

export const GSUserDrumParamMap: Record<keyof UserDrumSetParameter, number> = {
    pitchCoarse: 1,
    // Should never be used
    pitchFine: 127,
    level: 2,
    assignGroup: 3,
    pan: 4,
    reverbSend: 5,
    chorusSend: 6,
    rxNoteOff: 7,
    rxNoteOn: 8,
    variationSend: 9,
    sourceDrumSet: 0xa,
    program: 0xb,
    sourceNoteNumber: 0xc
};
export const GSDrumParamMap: Record<keyof DrumParameter, number> = {
    pitchCoarse: 1,
    level: 2,
    assignGroup: 3,
    pan: 4,
    reverbSend: 5,
    chorusSend: 6,
    rxNoteOff: 7,
    rxNoteOn: 8,
    variationSend: 9,

    // Not a thing in GS
    pitchFine: 127
};

export const XGDrumParamMap: Record<keyof DrumParameter, number> = {
    pitchCoarse: 0,
    pitchFine: 1,
    level: 2,
    assignGroup: 3,
    pan: 4,
    reverbSend: 5,
    chorusSend: 6,
    variationSend: 7,
    rxNoteOff: 9,
    rxNoteOn: 0xa
};

export const GSReverbAddressMap: GSReverbParameter = {
    character: 0x31,
    preLowpass: 0x32,
    level: 0x33,
    time: 0x34,
    delayFeedback: 0x35,
    preDelayTime: 0x37
};
export const GSChorusAddressMap: GSChorusParameter = {
    preLowpass: 0x39,
    level: 0x3a,
    feedback: 0x3b,
    delay: 0x3c,
    rate: 0x3d,
    depth: 0x3e,
    sendLevelToReverb: 0x3f,
    sendLevelToDelay: 0x40
};
export const GSDelayAddressMap: GSDelayParameter = {
    preLowpass: 0x51,
    timeCenter: 0x52,
    timeRatioLeft: 0x53,
    timeRatioRight: 0x54,
    levelCenter: 0x55,
    levelLeft: 0x56,
    levelRight: 0x57,
    level: 0x58,
    feedback: 0x59,
    sendLevelToReverb: 0x5a
};

/**
 * In GS, 0 is melodic and 1 is the first drum map.
 */
export const DEFAULT_GS_DRUM_MAP = 1;
/**
 * In XG, 0 is melodic, 1 is a non-editable drum and 2 is the first drum map.
 */
export const DEFAULT_XG_DRUM_MAP = 2;
/**
 * The drum map number meaning melodic (not a drum channel).
 * Shared by GS and XG.
 */
export const MELODIC_MAP = 0;

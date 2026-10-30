import type { DrumParameter, UserDrumSetParameter } from "../types";
import type {
    GSChorusParameterMessage,
    GSDelayParameterMessage,
    GSReverbParameterMessage
} from "./analyzed_message";
import type { ChannelMIDIParameter } from "../../synthesizer/audio_engine/channel/parameters/midi";
import {
    type MIDIController,
    MIDIControllers,
    NonRegisteredParameterTypesLSB,
    NonRegisteredParameterTypesMSB
} from "../enums";

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

export const GSReverbAddressMap: Record<
    GSReverbParameterMessage["parameter"],
    number
> = {
    macro: 0x30,
    character: 0x31,
    preLowpass: 0x32,
    level: 0x33,
    time: 0x34,
    delayFeedback: 0x35,
    preDelayTime: 0x37
};
export const GSChorusAddressMap: Record<
    GSChorusParameterMessage["parameter"],
    number
> = {
    macro: 0x38,
    preLowpass: 0x39,
    level: 0x3a,
    feedback: 0x3b,
    delay: 0x3c,
    rate: 0x3d,
    depth: 0x3e,
    sendLevelToReverb: 0x3f,
    sendLevelToDelay: 0x40
};
export const GSDelayAddressMap: Record<
    GSDelayParameterMessage["parameter"],
    number
> = {
    macro: 0x50,
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
 * The SysEx addresses of the channel MIDI parameters that GS and XG both set per part.
 * `gs` is the third address byte of GS PATCH PART (`40 1x xx`) and `xg` is the third address byte of
 * XG MULTI PART (`08 nn xx`).
 */
export const PartParamAddressMap = {
    rxChannel: { gs: 0x02, xg: 0x04 },
    assignMode: { gs: 0x14, xg: 0x06 },
    drumMap: { gs: 0x15, xg: 0x07 },
    velocitySenseDepth: { gs: 0x1a, xg: 0x0c },
    velocitySenseOffset: { gs: 0x1b, xg: 0x0d },
    randomPan: { gs: 0x1c, xg: 0x0e },
    cc1: { gs: 0x1f, xg: 0x59 },
    cc2: { gs: 0x20, xg: 0x60 }
} as const satisfies Partial<
    Record<keyof ChannelMIDIParameter, { gs: number; xg: number }>
>;

/**
 * The NRPN params that map to controllers.
 */
export const NRPNPartParamControllerMap: Partial<
    Record<number, MIDIController>
> = {
    [NonRegisteredParameterTypesLSB.vibratoRate]: MIDIControllers.vibratoRate,
    [NonRegisteredParameterTypesLSB.vibratoDepth]: MIDIControllers.vibratoDepth,
    [NonRegisteredParameterTypesLSB.vibratoDelay]: MIDIControllers.vibratoDelay,
    [NonRegisteredParameterTypesLSB.tvfCutoffFrequency]:
        MIDIControllers.brightness,
    [NonRegisteredParameterTypesLSB.tvfResonance]:
        MIDIControllers.filterResonance,
    [NonRegisteredParameterTypesLSB.envelopeAttackTime]:
        MIDIControllers.attackTime,
    [NonRegisteredParameterTypesLSB.envelopeDecayTime]:
        MIDIControllers.decayTime,
    [NonRegisteredParameterTypesLSB.envelopeReleaseTime]:
        MIDIControllers.releaseTime
};

/**
 * The NRPN MSB of every drum parameter that can be set via NRPN.
 */
export const NRPNDrumParamMap = {
    pitchCoarse: NonRegisteredParameterTypesMSB.drumPitch,
    pitchFine: NonRegisteredParameterTypesMSB.drumPitchFine,
    level: NonRegisteredParameterTypesMSB.drumLevel,
    pan: NonRegisteredParameterTypesMSB.drumPan,
    reverbSend: NonRegisteredParameterTypesMSB.drumReverb,
    chorusSend: NonRegisteredParameterTypesMSB.drumChorus,
    variationSend: NonRegisteredParameterTypesMSB.drumVariation
} as const satisfies Partial<Record<keyof DrumParameter, number>>;

/**
 * The drum parameters that can be set via NRPN.
 */
export type NRPNDrumParameter = keyof typeof NRPNDrumParamMap;

/**
 * {@link NRPNDrumParamMap} reversed: the drum parameter by its NRPN MSB.
 */
export const NRPNDrumParamByMSB = new Map<number, NRPNDrumParameter>(
    Object.entries(NRPNDrumParamMap).map(([parameter, msb]) => [
        msb,
        parameter as NRPNDrumParameter
    ])
);

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

import type { GSEffectConstructor } from "./gs_effect";
import { GSThru } from "./effects/thru";
import { GSEqualizer } from "./effects/equalizer";
import { GSSpectrum } from "./effects/spectrum";
import { GSEnhancer } from "./effects/enhancer";
import { GSOverdrive } from "./effects/overdrive";
import { GSDistortion } from "./effects/distortion";
import { GSTremolo } from "./effects/tremolo";
import { GSAutoPan } from "./effects/auto_pan";
import { GSCompressor } from "./effects/compressor";
import { GSLimiter } from "./effects/limiter";
import { GSStereoChorus } from "./effects/stereo_chorus";
import { GSStereoFlanger } from "./effects/stereo_flanger";
import { GSStepFlanger } from "./effects/step_flanger";
import { GSSpaceD } from "./effects/space_d";
import { GSHexaChorus } from "./effects/hexa_chorus";
import { GSTremoloChorus } from "./effects/tremolo_chorus";
import { GSStereoDelay } from "./effects/stereo_delay";
import { GSModulationDelay } from "./effects/modulation_delay";
import { GSQuadTapDelay, GSTripleTapDelay } from "./effects/tap_delay";
import { GSTimeControlDelay } from "./effects/time_control_delay";
import { GSTwoVoicePitchShifter } from "./effects/two_voice_pitch_shifter";
import { GSFeedbackPitchShifter } from "./effects/feedback_pitch_shifter";
import { GSPhaser } from "./effects/phaser";
import { GSAutoWah } from "./effects/auto_wah";
import { GSHumanizer } from "./effects/humanizer";
import { GSRotary } from "./effects/rotary";
import { GSReverb } from "./effects/reverb";
import { GSGateReverb } from "./effects/gate_reverb";
import { GSLoFi1 } from "./effects/lo_fi_1";
import { GSLoFi2 } from "./effects/lo_fi_2";
import { GSThreeDAuto } from "./effects/three_d_auto";
import { GSThreeDManual } from "./effects/three_d_manual";
import { GSThreeDChorus } from "./effects/three_d_chorus";
import { GSThreeDDelay } from "./effects/three_d_delay";
import { GSChorusDelay, GSFlangerDelay } from "./effects/modulation_to_delay";
import { GSChorusFlanger } from "./effects/chorus_to_flanger";
import {
    GSChorusParallelDelay,
    GSFlangerParallelDelay
} from "./effects/modulation_parallel_delay";
import { GSChorusParallelFlanger } from "./effects/chorus_parallel_flanger";
import {
    GSOverdriveParallelAutoWah,
    GSOverdriveParallelOverdrive,
    GSOverdriveParallelPhaser,
    GSOverdriveParallelRotary,
    GSPhaserParallelAutoWah,
    GSPhaserParallelRotary
} from "./effects/parallel_combinations";
import {
    GSDistortionChorus,
    GSDistortionDelay,
    GSDistortionFlanger,
    GSOverdriveChorus,
    GSOverdriveDelay,
    GSOverdriveFlanger
} from "./effects/drive_combinations";
import {
    GSEnhancerChorus,
    GSEnhancerDelay,
    GSEnhancerFlanger
} from "./effects/enhancer_combinations";
import { GSRhodesMulti } from "./effects/rhodes_multi";
import { GSKeyboardMulti } from "./effects/keyboard_multi";
import { GSRotaryMulti } from "./effects/rotary_multi";
import {
    GSGuitarMulti1,
    GSGuitarMulti2,
    GSGuitarMulti3
} from "./effects/guitar_multis";
import { GSBassMulti } from "./effects/bass_multi";
import {
    GSCleanGuitarMulti1,
    GSCleanGuitarMulti2
} from "./effects/clean_guitar_multi";

/**
 * Every clean EFX type: Thru and the 64 SC-88Pro types.
 * @internal
 */
export const GS_EFFECT_LIST: GSEffectConstructor[] = [
    GSThru,
    GSEqualizer,
    GSSpectrum,
    GSEnhancer,
    GSOverdrive,
    GSDistortion,
    GSTremolo,
    GSAutoPan,
    GSCompressor,
    GSLimiter,
    GSStereoChorus,
    GSStereoFlanger,
    GSStepFlanger,
    GSSpaceD,
    GSHexaChorus,
    GSTremoloChorus,
    GSStereoDelay,
    GSModulationDelay,
    GSTripleTapDelay,
    GSQuadTapDelay,
    GSTimeControlDelay,
    GSTwoVoicePitchShifter,
    GSFeedbackPitchShifter,
    GSPhaser,
    GSAutoWah,
    GSHumanizer,
    GSRotary,
    GSReverb,
    GSGateReverb,
    GSLoFi1,
    GSLoFi2,
    GSThreeDAuto,
    GSThreeDManual,
    GSThreeDChorus,
    GSThreeDDelay,
    GSChorusDelay,
    GSFlangerDelay,
    GSChorusFlanger,
    GSChorusParallelDelay,
    GSFlangerParallelDelay,
    GSChorusParallelFlanger,
    GSOverdriveParallelOverdrive,
    GSOverdriveParallelRotary,
    GSOverdriveParallelPhaser,
    GSOverdriveParallelAutoWah,
    GSPhaserParallelRotary,
    GSPhaserParallelAutoWah,
    GSOverdriveChorus,
    GSOverdriveFlanger,
    GSOverdriveDelay,
    GSDistortionChorus,
    GSDistortionFlanger,
    GSDistortionDelay,
    GSEnhancerChorus,
    GSEnhancerFlanger,
    GSEnhancerDelay,
    GSRhodesMulti,
    GSKeyboardMulti,
    GSGuitarMulti1,
    GSGuitarMulti2,
    GSGuitarMulti3,
    GSCleanGuitarMulti1,
    GSCleanGuitarMulti2,
    GSBassMulti,
    GSRotaryMulti
];

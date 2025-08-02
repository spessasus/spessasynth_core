import { SpessaSynthWarn } from "../../../../../utils/loggin";
import { consoleColors } from "../../../../../utils/other";
import {
    type GeneratorType,
    generatorTypes
} from "../../../../../soundbank/basic_soundbank/generator_types";
import type { MIDIChannel } from "../../../engine_components/midi_channel";

/**
 * SoundBlaster AWE32 NRPN generator mappings.
 * http://archive.gamedev.net/archive/reference/articles/article445.html
 * https://github.com/user-attachments/files/15757220/adip301.pdf
 */
const AWE_NRPN_GENERATOR_MAPPINGS: GeneratorType[] = [
    generatorTypes.delayModLFO,
    generatorTypes.freqModLFO,

    generatorTypes.delayVibLFO,
    generatorTypes.freqVibLFO,

    generatorTypes.delayModEnv,
    generatorTypes.attackModEnv,
    generatorTypes.holdModEnv,
    generatorTypes.decayModEnv,
    generatorTypes.sustainModEnv,
    generatorTypes.releaseModEnv,

    generatorTypes.delayVolEnv,
    generatorTypes.attackVolEnv,
    generatorTypes.holdVolEnv,
    generatorTypes.decayVolEnv,
    generatorTypes.sustainVolEnv,
    generatorTypes.releaseVolEnv,

    generatorTypes.fineTune,

    generatorTypes.modLfoToPitch,
    generatorTypes.vibLfoToPitch,
    generatorTypes.modEnvToPitch,
    generatorTypes.modLfoToVolume,

    generatorTypes.initialFilterFc,
    generatorTypes.initialFilterQ,

    generatorTypes.modLfoToFilterFc,
    generatorTypes.modEnvToFilterFc,

    generatorTypes.chorusEffectsSend,
    generatorTypes.reverbEffectsSend
] as const;

/**
 * Function that emulates AWE32 similarly to fluidsynth
 * https://github.com/FluidSynth/fluidsynth/wiki/FluidFeatures
 *
 * Note: This makes use of findings by mrbumpy409:
 * https://github.com/fluidSynth/fluidsynth/issues/1473
 *
 * The excellent test files are available here, also collected and converted by mrbumpy409:
 * https://github.com/mrbumpy409/AWE32-midi-conversions
 */
export function handleAWE32NRPN(
    this: MIDIChannel,
    aweGen: number,
    dataLSB: number,
    dataMSB: number
) {
    // Helper functions
    const clip = (v: number, min: number, max: number) =>
        Math.max(min, Math.min(max, v));
    const msecToTimecents = (ms: number) =>
        Math.max(-32768, 1200 * Math.log2(ms / 1000));
    const hzToCents = (hz: number) => 6900 + 1200 * Math.log2(hz / 440);

    let dataValue = (dataMSB << 7) | dataLSB;
    // Center the value
    // Though ranges reported as 0 to 127 only use LSB
    dataValue -= 8192;
    const generator = AWE_NRPN_GENERATOR_MAPPINGS[aweGen];
    if (!generator) {
        SpessaSynthWarn(
            `Invalid AWE32 LSB: %c${aweGen}`,
            consoleColors.unrecognized
        );
    }
    let milliseconds, hertz, centibels, cents;
    switch (generator) {
        default:
            // This should not happen
            break;

        // Delays
        case generatorTypes.delayModLFO:
        case generatorTypes.delayVibLFO:
        case generatorTypes.delayVolEnv:
        case generatorTypes.delayModEnv:
            milliseconds = 4 * clip(dataValue, 0, 5900);
            // Convert to timecents
            this.setGeneratorOverride(generator, msecToTimecents(milliseconds));
            break;

        // Attacks
        case generatorTypes.attackVolEnv:
        case generatorTypes.attackModEnv:
            milliseconds = clip(dataValue, 0, 5940);
            // Convert to timecents
            this.setGeneratorOverride(generator, msecToTimecents(milliseconds));
            break;

        // Holds
        case generatorTypes.holdVolEnv:
        case generatorTypes.holdModEnv:
            milliseconds = clip(dataValue, 0, 8191);
            // Convert to timecents
            this.setGeneratorOverride(generator, msecToTimecents(milliseconds));
            break;

        // Decays and releases (share clips and units)
        case generatorTypes.decayModEnv:
        case generatorTypes.decayVolEnv:
        case generatorTypes.releaseVolEnv:
        case generatorTypes.releaseModEnv:
            milliseconds = 4 * clip(dataValue, 0, 5940);
            // Convert to timecents
            this.setGeneratorOverride(generator, msecToTimecents(milliseconds));
            break;

        // Lfo frequencies
        case generatorTypes.freqVibLFO:
        case generatorTypes.freqModLFO:
            hertz = 0.084 * dataLSB;
            // Convert to abs cents
            this.setGeneratorOverride(generator, hzToCents(hertz), true);
            break;

        // Sustains
        case generatorTypes.sustainVolEnv:
        case generatorTypes.sustainModEnv:
            // 0.75 dB is 7.5 cB
            centibels = dataLSB * 7.5;
            this.setGeneratorOverride(generator, centibels);
            break;

        // Pitch
        case generatorTypes.fineTune:
            // Data is already centered
            this.setGeneratorOverride(generator, dataValue, true);
            break;

        // Lfo to pitch
        case generatorTypes.modLfoToPitch:
        case generatorTypes.vibLfoToPitch:
            cents = clip(dataValue, -127, 127) * 9.375;
            this.setGeneratorOverride(generator, cents, true);
            break;

        // Env to pitch
        case generatorTypes.modEnvToPitch:
            cents = clip(dataValue, -127, 127) * 9.375;
            this.setGeneratorOverride(generator, cents);
            break;

        // Mod lfo to vol
        case generatorTypes.modLfoToVolume:
            // 0.1875 dB is 1.875 cB
            centibels = 1.875 * dataLSB;
            this.setGeneratorOverride(generator, centibels, true);
            break;

        // Filter fc
        case generatorTypes.initialFilterFc: {
            // Minimum: 100 Hz -> 4335 cents
            const fcCents = 4335 + 59 * dataLSB;
            this.setGeneratorOverride(generator, fcCents, true);
            break;
        }

        // Filter Q
        case generatorTypes.initialFilterQ:
            // Note: this uses the "modulator-ish" approach proposed by mrbumpy409
            // Here https://github.com/FluidSynth/fluidsynth/issues/1473
            centibels = 215 * (dataLSB / 127);
            this.setGeneratorOverride(generator, centibels, true);
            break;

        // To filterFc
        case generatorTypes.modLfoToFilterFc:
            cents = clip(dataValue, -64, 63) * 56.25;
            this.setGeneratorOverride(generator, cents, true);
            break;

        case generatorTypes.modEnvToFilterFc:
            cents = clip(dataValue, -64, 63) * 56.25;
            this.setGeneratorOverride(generator, cents);
            break;

        // Effects
        case generatorTypes.chorusEffectsSend:
        case generatorTypes.reverbEffectsSend:
            this.setGeneratorOverride(
                generator,
                clip(dataValue, 0, 255) * (1000 / 255)
            );
            break;
    }
}

import {
    type GeneratorType,
    GeneratorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import type { MIDIChannel } from "./midi_channel";
import { SpessaLog } from "../../../utils/loggin";

export interface ChannelGenerators {
    /**
     * An array of offsets generators for SF2 NRPN support.
     * A value of 0 means no change; -10 means 10 lower, etc.
     */
    offsets: Int16Array;
    /**
     * A small optimization that disables applying offsets until at least one is set.
     */
    offsetsEnabled: boolean;

    /**
     * An array of overrides generators for AWE32 NRPN support.
     * A value of GENERATOR_OVERRIDE_NO_CHANGE_VALUE (-32,767) means no change;
     * other values replace current generators.
     */
    overrides: Int16Array;
    /**
     * A small optimization that disables applying overrides until at least one is set.
     */
    overridesEnabled: boolean;
}

/**
 * SoundBlaster AWE32 NRPN generator mappings.
 * http://archive.gamedev.net/archive/reference/articles/article445.html
 * https://github.com/user-attachments/files/15757220/adip301.pdf
 */
const AWE_NRPN_GENERATOR_MAPPINGS: GeneratorType[] = [
    GeneratorTypes.delayModLFO,
    GeneratorTypes.freqModLFO,

    GeneratorTypes.delayVibLFO,
    GeneratorTypes.freqVibLFO,

    GeneratorTypes.delayModEnv,
    GeneratorTypes.attackModEnv,
    GeneratorTypes.holdModEnv,
    GeneratorTypes.decayModEnv,
    GeneratorTypes.sustainModEnv,
    GeneratorTypes.releaseModEnv,

    GeneratorTypes.delayVolEnv,
    GeneratorTypes.attackVolEnv,
    GeneratorTypes.holdVolEnv,
    GeneratorTypes.decayVolEnv,
    GeneratorTypes.sustainVolEnv,
    GeneratorTypes.releaseVolEnv,

    GeneratorTypes.fineTune,

    GeneratorTypes.modLfoToPitch,
    GeneratorTypes.vibLfoToPitch,
    GeneratorTypes.modEnvToPitch,
    GeneratorTypes.modLfoToVolume,

    GeneratorTypes.initialFilterFc,
    GeneratorTypes.initialFilterQ,

    GeneratorTypes.modLfoToFilterFc,
    GeneratorTypes.modEnvToFilterFc,

    GeneratorTypes.chorusEffectsSend,
    GeneratorTypes.reverbEffectsSend
] as const;

// Helper functions
const clip = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
const msToTimecents = (ms: number) =>
    Math.max(-32_768, 1200 * Math.log2(ms / 1000));
const hzToCents = (hz: number) => 6900 + 1200 * Math.log2(hz / 440);

/**
 * Function that emulates AWE32 similarly to fluidsynth
 * https://github.com/FluidSynth/fluidsynth/wiki/FluidFeatures
 *
 * Note: This makes use of findings by mrbumpy409:
 * https://github.com/fluidSynth/fluidsynth/issues/1473
 *
 * The excellent test files are available here, also collected and converted by mrbumpy409:
 * https://github.com/mrbumpy409/AWE32-midi-conversions
 * @param paramLSB NRPN LSB
 * @param dataValue 14-bit
 */
export function handleAWE32NRPN(
    this: MIDIChannel,
    paramLSB: number,
    dataValue: number
) {
    // Center the value
    // Though ranges reported as 0 to 127 only use LSB
    const dataLSB = dataValue & 0x7f;
    dataValue -= 8192;
    const generator = AWE_NRPN_GENERATOR_MAPPINGS[paramLSB];
    if (!generator) {
        SpessaLog.unsupported(
            `AWE32 LSB for ${this.channel}`,
            [paramLSB],
            "Invalid Generator Number"
        );
    }
    let milliseconds, hertz, centibels, cents;
    switch (generator) {
        default: {
            // This should not happen
            break;
        }

        // Delays
        case GeneratorTypes.delayModLFO:
        case GeneratorTypes.delayVibLFO:
        case GeneratorTypes.delayVolEnv:
        case GeneratorTypes.delayModEnv: {
            milliseconds = 4 * clip(dataValue, 0, 5900);
            // Convert to timecents
            this.setGeneratorOverride(generator, msToTimecents(milliseconds));
            break;
        }

        // Attacks
        case GeneratorTypes.attackVolEnv:
        case GeneratorTypes.attackModEnv: {
            milliseconds = clip(dataValue, 0, 5940);
            // Convert to timecents
            this.setGeneratorOverride(generator, msToTimecents(milliseconds));
            break;
        }

        // Holds
        case GeneratorTypes.holdVolEnv:
        case GeneratorTypes.holdModEnv: {
            milliseconds = clip(dataValue, 0, 8191);
            // Convert to timecents
            this.setGeneratorOverride(generator, msToTimecents(milliseconds));
            break;
        }

        // Decays and releases (share clips and units)
        case GeneratorTypes.decayModEnv:
        case GeneratorTypes.decayVolEnv:
        case GeneratorTypes.releaseVolEnv:
        case GeneratorTypes.releaseModEnv: {
            milliseconds = 4 * clip(dataValue, 0, 5940);
            // Convert to timecents
            this.setGeneratorOverride(generator, msToTimecents(milliseconds));
            break;
        }

        // Lfo frequencies
        case GeneratorTypes.freqVibLFO:
        case GeneratorTypes.freqModLFO: {
            hertz = 0.084 * dataLSB;
            // Convert to abs cents
            this.setGeneratorOverride(generator, hzToCents(hertz), true);
            break;
        }

        // Sustains
        case GeneratorTypes.sustainVolEnv:
        case GeneratorTypes.sustainModEnv: {
            // 0.75 dB is 7.5 cB
            centibels = dataLSB * 7.5;
            this.setGeneratorOverride(generator, centibels);
            break;
        }

        // Pitch
        case GeneratorTypes.fineTune: {
            // Data is already centered
            this.setGeneratorOverride(generator, dataValue, true);
            break;
        }

        // Lfo to pitch
        case GeneratorTypes.modLfoToPitch:
        case GeneratorTypes.vibLfoToPitch: {
            cents = clip(dataValue, -127, 127) * 9.375;
            this.setGeneratorOverride(generator, cents, true);
            break;
        }

        // Env to pitch
        case GeneratorTypes.modEnvToPitch: {
            cents = clip(dataValue, -127, 127) * 9.375;
            this.setGeneratorOverride(generator, cents);
            break;
        }

        // Mod lfo to vol
        case GeneratorTypes.modLfoToVolume: {
            // 0.1875 dB is 1.875 cB
            centibels = 1.875 * dataLSB;
            this.setGeneratorOverride(generator, centibels, true);
            break;
        }

        // Filter fc
        case GeneratorTypes.initialFilterFc: {
            // Minimum: 100 Hz -> 4335 cents
            const fcCents = 4335 + 59 * dataLSB;
            this.setGeneratorOverride(generator, fcCents, true);
            break;
        }

        // Filter Q
        case GeneratorTypes.initialFilterQ: {
            // Note: this uses the "modulator-ish" approach proposed by mrbumpy409
            // Here https://github.com/FluidSynth/fluidsynth/issues/1473
            centibels = 215 * (dataLSB / 127);
            this.setGeneratorOverride(generator, centibels, true);
            break;
        }

        // To filterFc
        case GeneratorTypes.modLfoToFilterFc: {
            cents = clip(dataValue, -64, 63) * 56.25;
            this.setGeneratorOverride(generator, cents, true);
            break;
        }

        case GeneratorTypes.modEnvToFilterFc: {
            cents = clip(dataValue, -64, 63) * 56.25;
            this.setGeneratorOverride(generator, cents);
            break;
        }

        // Effects
        case GeneratorTypes.chorusEffectsSend:
        case GeneratorTypes.reverbEffectsSend: {
            this.setGeneratorOverride(
                generator,
                clip(dataValue, 0, 255) * (1000 / 255)
            );
            break;
        }
    }
}

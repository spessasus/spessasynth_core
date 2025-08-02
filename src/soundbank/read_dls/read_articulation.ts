import { readLittleEndian } from "../../utils/byte_functions/little_endian";
import { DLS_1_NO_VIBRATO_MOD, DLS_1_NO_VIBRATO_PRESSURE } from "./default_dls_modulators";
import { getSF2ModulatorFromArticulator } from "./articulator_converter";
import { SpessaSynthWarn } from "../../utils/loggin";
import { Generator } from "../basic_soundbank/generator";
import { Modulator } from "../basic_soundbank/modulator";
import { type GeneratorType, generatorTypes } from "../basic_soundbank/generator_types";
import type { RIFFChunk } from "../basic_soundbank/riff_chunk";
import { DLSDestinations, DLSSources } from "../enums";

/**
 * Reads the articulator chunk
 * @param chunk
 * @param disableVibrato it seems that dls 1 does not have vibrato lfo, so we shall disable it
 * @returns
 */
export function readArticulation(
    chunk: RIFFChunk,
    disableVibrato: boolean
): { modulators: Modulator[]; generators: Generator[] } {
    const artData = chunk.chunkData;
    const generators: Generator[] = [];
    const modulators: Modulator[] = [];

    // CbSize (ignore)
    readLittleEndian(artData, 4);
    const connectionsAmount = readLittleEndian(artData, 4);
    for (let i = 0; i < connectionsAmount; i++) {
        // Read the block
        const source = readLittleEndian(artData, 2);
        const control = readLittleEndian(artData, 2);
        const destination = readLittleEndian(artData, 2);
        const transform = readLittleEndian(artData, 2);
        const scale = readLittleEndian(artData, 4) | 0;
        const value = scale >> 16; // Convert it to 16 bit as soundfont uses that

        // ModulatorConverterDebug(
        //     Source,
        //     Control,
        //     Destination,
        //     Value,
        //     Transform
        // );

        // Interpret this somehow...
        // If source and control are both zero, it's a generator
        if (source === 0 && control === 0 && transform === 0) {
            let generator: Generator | undefined;
            switch (destination) {
                case DLSDestinations.pan:
                    generator = new Generator(generatorTypes.pan, value); // Turn percent into tenths of percent
                    break;
                case DLSDestinations.gain:
                    generator = new Generator(
                        generatorTypes.initialAttenuation,
                        (-value * 10) / 0.4
                    ); // Turn to centibels and apply emu correction
                    break;
                case DLSDestinations.filterCutoff:
                    generator = new Generator(
                        generatorTypes.initialFilterFc,
                        value
                    );
                    break;
                case DLSDestinations.filterQ:
                    generator = new Generator(
                        generatorTypes.initialFilterQ,
                        value
                    );
                    break;

                // Mod lfo raw values it seems
                case DLSDestinations.modLfoFreq:
                    generator = new Generator(generatorTypes.freqModLFO, value);
                    break;
                case DLSDestinations.modLfoDelay:
                    generator = new Generator(
                        generatorTypes.delayModLFO,
                        value
                    );
                    break;
                case DLSDestinations.vibLfoFreq:
                    generator = new Generator(generatorTypes.freqVibLFO, value);
                    break;
                case DLSDestinations.vibLfoDelay:
                    generator = new Generator(
                        generatorTypes.delayVibLFO,
                        value
                    );
                    break;

                // Vol. env: all times are timecents like sf2
                case DLSDestinations.volEnvDelay:
                    generator = new Generator(
                        generatorTypes.delayVolEnv,
                        value
                    );
                    break;
                case DLSDestinations.volEnvAttack:
                    generator = new Generator(
                        generatorTypes.attackVolEnv,
                        value
                    );
                    break;
                case DLSDestinations.volEnvHold:
                    // Do not validate because keyNumToSomething
                    generator = new Generator(
                        generatorTypes.holdVolEnv,
                        value,
                        false
                    );
                    break;
                case DLSDestinations.volEnvDecay:
                    // Do not validate because keyNumToSomething
                    generator = new Generator(
                        generatorTypes.decayVolEnv,
                        value,
                        false
                    );
                    break;
                case DLSDestinations.volEnvRelease:
                    generator = new Generator(
                        generatorTypes.releaseVolEnv,
                        value
                    );
                    break;
                case DLSDestinations.volEnvSustain:
                    // Gain seems to be (1000 - value) / 10 = sustain dB
                    {
                        const sustainCb = 1000 - value;
                        generator = new Generator(
                            generatorTypes.sustainVolEnv,
                            sustainCb
                        );
                    }
                    break;

                // Mod env
                case DLSDestinations.modEnvDelay:
                    generator = new Generator(
                        generatorTypes.delayModEnv,
                        value
                    );
                    break;
                case DLSDestinations.modEnvAttack:
                    generator = new Generator(
                        generatorTypes.attackModEnv,
                        value
                    );
                    break;
                case DLSDestinations.modEnvHold:
                    // Do not validate because keyNumToSomething
                    generator = new Generator(
                        generatorTypes.holdModEnv,
                        value,
                        false
                    );
                    break;
                case DLSDestinations.modEnvDecay:
                    // Do not validate because keyNumToSomething
                    generator = new Generator(
                        generatorTypes.decayModEnv,
                        value,
                        false
                    );
                    break;
                case DLSDestinations.modEnvRelease:
                    generator = new Generator(
                        generatorTypes.releaseModEnv,
                        value
                    );
                    break;
                case DLSDestinations.modEnvSustain: {
                    // Dls uses 1%, soundfont uses 0.1%
                    const percentageSustain = 1000 - value;
                    generator = new Generator(
                        generatorTypes.sustainModEnv,
                        percentageSustain
                    );
                    break;
                }

                case DLSDestinations.reverbSend:
                    generator = new Generator(
                        generatorTypes.reverbEffectsSend,
                        value
                    );
                    break;
                case DLSDestinations.chorusSend:
                    generator = new Generator(
                        generatorTypes.chorusEffectsSend,
                        value
                    );
                    break;
                case DLSDestinations.pitch: {
                    // Split it up
                    const semi = Math.floor(value / 100);
                    const cents = Math.floor(value - semi * 100);
                    generator = new Generator(generatorTypes.fineTune, cents);
                    generators.push(
                        new Generator(generatorTypes.coarseTune, semi)
                    );
                    break;
                }
            }
            if (generator) {
                generators.push(generator);
            }
        }
        // If not, modulator?
        else {
            let isGenerator = true;

            const applyKeyToCorrection = (
                value: number,
                keyToGen: GeneratorType,
                realGen: GeneratorType
            ) => {
                // According to viena and another strange (with modulators) rendition of gm.dls in sf2,
                // It shall be divided by -128
                // And a strange correction needs to be applied to the real value:
                // Real + (60 / 128) * scale
                const keyToGenValue = value / -128;
                generators.push(new Generator(keyToGen, keyToGenValue));
                // Airfont 340 fix
                if (keyToGenValue <= 120) {
                    const correction = Math.round((60 / 128) * value);
                    generators.forEach((g) => {
                        if (g.generatorType === realGen) {
                            g.generatorValue += correction;
                        }
                    });
                }
            };

            // A few special cases which are generators:
            if (control === DLSSources.none) {
                // Mod lfo to pitch
                if (
                    source === DLSSources.modLfo &&
                    destination === DLSDestinations.pitch
                ) {
                    generators.push(
                        new Generator(generatorTypes.modLfoToPitch, value)
                    );
                } else if (
                    source === DLSSources.modLfo &&
                    destination === DLSDestinations.gain
                ) {
                    // Mod lfo to volume
                    generators.push(
                        new Generator(generatorTypes.modLfoToVolume, value)
                    );
                } else if (
                    source === DLSSources.modLfo &&
                    destination === DLSDestinations.filterCutoff
                ) {
                    // Mod lfo to filter
                    generators.push(
                        new Generator(generatorTypes.modLfoToFilterFc, value)
                    );
                } else if (
                    source === DLSSources.vibratoLfo &&
                    destination === DLSDestinations.pitch
                ) {
                    // Vib lfo to pitch
                    generators.push(
                        new Generator(generatorTypes.vibLfoToPitch, value)
                    );
                } else if (
                    source === DLSSources.modEnv &&
                    destination === DLSDestinations.pitch
                ) {
                    // Mod env to pitch
                    generators.push(
                        new Generator(generatorTypes.modEnvToPitch, value)
                    );
                } else if (
                    source === DLSSources.modEnv &&
                    destination === DLSDestinations.filterCutoff
                ) {
                    // Mod env to filter
                    generators.push(
                        new Generator(generatorTypes.modEnvToFilterFc, value)
                    );
                } else if (
                    source === DLSSources.keyNum &&
                    destination === DLSDestinations.pitch
                ) {
                    // Scale tuning (key number to pitch)
                    // This is just a soundfont generator, but the amount must be changed
                    // 12,800 means the regular scale (100)
                    generators.push(
                        new Generator(generatorTypes.scaleTuning, value / 128)
                    );
                } else if (
                    source === DLSSources.keyNum &&
                    destination === DLSDestinations.volEnvHold
                ) {
                    // Key to vol env hold
                    applyKeyToCorrection(
                        value,
                        generatorTypes.keyNumToVolEnvHold,
                        generatorTypes.holdVolEnv
                    );
                } else if (
                    source === DLSSources.keyNum &&
                    destination === DLSDestinations.volEnvDecay
                ) {
                    // Key to vol env decay
                    applyKeyToCorrection(
                        value,
                        generatorTypes.keyNumToVolEnvDecay,
                        generatorTypes.decayVolEnv
                    );
                } else if (
                    source === DLSSources.keyNum &&
                    destination === DLSDestinations.modEnvHold
                ) {
                    // Key to mod env hold
                    applyKeyToCorrection(
                        value,
                        generatorTypes.keyNumToModEnvHold,
                        generatorTypes.holdModEnv
                    );
                } else if (
                    source === DLSSources.keyNum &&
                    destination === DLSDestinations.modEnvDecay
                ) {
                    // Key to mod env decay
                    applyKeyToCorrection(
                        value,
                        generatorTypes.keyNumToModEnvDecay,
                        generatorTypes.decayModEnv
                    );
                } else {
                    isGenerator = false;
                }
            } else {
                isGenerator = false;
            }
            if (!isGenerator) {
                // UNCOMMENT TO ENABLE DEBUG
                // ModulatorConverterDebug(source, control, destination, value, transform)
                // Convert it to modulator
                const mod = getSF2ModulatorFromArticulator(
                    source,
                    control,
                    destination,
                    transform,
                    value
                );
                if (mod) {
                    // Some articulators cannot be turned into modulators, that's why this check is a thing
                    modulators.push(mod);
                } else {
                    SpessaSynthWarn("Failed converting to SF2 Modulator!");
                }
            }
        }
    }

    // It seems that dls 1 does not have vibrato lfo, so we shall disable it
    if (disableVibrato) {
        modulators.push(
            // Mod to vib
            Modulator.copy(DLS_1_NO_VIBRATO_MOD),
            // Press to vib
            Modulator.copy(DLS_1_NO_VIBRATO_PRESSURE)
        );
    }

    return { modulators: modulators, generators: generators };
}

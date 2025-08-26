import {
    DLSDestinations,
    DLSSources,
    generatorTypes,
    type ModulatorCurveType,
    modulatorCurveTypes,
    type ModulatorSourceEnum,
    modulatorSources
} from "../../enums";
import {
    DecodedModulator,
    getModSourceEnum,
    Modulator
} from "../../basic_soundbank/modulator";

import { SpessaSynthWarn } from "../../../utils/loggin";
import { type GeneratorType } from "../../basic_soundbank/generator_types";
import type { ModulatorNumericBool, ModulatorSource } from "../../types";
import { midiControllers } from "../../../midi/enums";

function getSF2SourceFromDLS(source: number) {
    let sourceEnum: ModulatorSource | undefined = undefined;
    let isCC = false;
    switch (source) {
        default:
        case DLSSources.modLfo:
        case DLSSources.vibratoLfo:
        case DLSSources.coarseTune:
        case DLSSources.fineTune:
        case DLSSources.modEnv:
            return undefined; // Cannot be this in sf2

        case DLSSources.keyNum:
            sourceEnum = modulatorSources.noteOnKeyNum;
            break;
        case DLSSources.none:
            sourceEnum = modulatorSources.noController;
            break;
        case DLSSources.modulationWheel:
            sourceEnum = midiControllers.modulationWheel;
            isCC = true;
            break;
        case DLSSources.pan:
            sourceEnum = midiControllers.pan;
            isCC = true;
            break;
        case DLSSources.reverb:
            sourceEnum = midiControllers.reverbDepth;
            isCC = true;
            break;
        case DLSSources.chorus:
            sourceEnum = midiControllers.chorusDepth;
            isCC = true;
            break;
        case DLSSources.expression:
            sourceEnum = midiControllers.expressionController;
            isCC = true;
            break;
        case DLSSources.volume:
            sourceEnum = midiControllers.mainVolume;
            isCC = true;
            break;
        case DLSSources.velocity:
            sourceEnum = modulatorSources.noteOnVelocity;
            break;
        case DLSSources.polyPressure:
            sourceEnum = modulatorSources.polyPressure;
            break;
        case DLSSources.channelPressure:
            sourceEnum = modulatorSources.channelPressure;
            break;
        case DLSSources.pitchWheel:
            sourceEnum = modulatorSources.pitchWheel;
            break;
        case DLSSources.pitchWheelRange:
            sourceEnum = modulatorSources.pitchWheelRange;
            break;
    }
    if (sourceEnum === undefined) {
        throw new Error(`Unknown DLS Source: ${source}`);
    }
    return { enum: sourceEnum, isCC: isCC };
}

/**
 * @param destination
 * @param amount
 * @returns  transform amount to sf2 units
 */
function getSF2GeneratorFromDLS(
    destination: number,
    amount: number
): GeneratorType | undefined | { gen: GeneratorType; newAmount: number } {
    switch (destination) {
        default:
        case DLSDestinations.none:
            return undefined;
        case DLSDestinations.pan:
            return generatorTypes.pan;
        case DLSDestinations.gain:
            return {
                gen: generatorTypes.initialAttenuation,
                newAmount: amount * -1
            };
        case DLSDestinations.pitch:
            return generatorTypes.fineTune;
        case DLSDestinations.keyNum:
            return generatorTypes.overridingRootKey;

        // Vol env
        case DLSDestinations.volEnvDelay:
            return generatorTypes.delayVolEnv;
        case DLSDestinations.volEnvAttack:
            return generatorTypes.attackVolEnv;
        case DLSDestinations.volEnvHold:
            return generatorTypes.holdVolEnv;
        case DLSDestinations.volEnvDecay:
            return generatorTypes.decayVolEnv;
        case DLSDestinations.volEnvSustain:
            return {
                gen: generatorTypes.sustainVolEnv,
                newAmount: 1000 - amount
            };
        case DLSDestinations.volEnvRelease:
            return generatorTypes.releaseVolEnv;

        // Mod env
        case DLSDestinations.modEnvDelay:
            return generatorTypes.delayModEnv;
        case DLSDestinations.modEnvAttack:
            return generatorTypes.attackModEnv;
        case DLSDestinations.modEnvHold:
            return generatorTypes.holdModEnv;
        case DLSDestinations.modEnvDecay:
            return generatorTypes.decayModEnv;
        case DLSDestinations.modEnvSustain:
            return {
                gen: generatorTypes.sustainModEnv,
                newAmount: (1000 - amount) / 10
            };
        case DLSDestinations.modEnvRelease:
            return generatorTypes.releaseModEnv;

        case DLSDestinations.filterCutoff:
            return generatorTypes.initialFilterFc;
        case DLSDestinations.filterQ:
            return generatorTypes.initialFilterQ;
        case DLSDestinations.chorusSend:
            return generatorTypes.chorusEffectsSend;
        case DLSDestinations.reverbSend:
            return generatorTypes.reverbEffectsSend;

        // Lfo
        case DLSDestinations.modLfoFreq:
            return generatorTypes.freqModLFO;
        case DLSDestinations.modLfoDelay:
            return generatorTypes.delayModLFO;
        case DLSDestinations.vibLfoFreq:
            return generatorTypes.freqVibLFO;
        case DLSDestinations.vibLfoDelay:
            return generatorTypes.delayVibLFO;
    }
}

/**
 * Checks for combos such as mod lfo as source and pitch as destination which results in modLfoToPitch
 * @param source
 * @param destination
 * @returns real destination
 */
function checkForSpecialDLSCombo(
    source: number,
    destination: number
): GeneratorType | undefined {
    if (
        source === DLSSources.vibratoLfo &&
        destination === DLSDestinations.pitch
    ) {
        // Vibrato lfo to pitch
        return generatorTypes.vibLfoToPitch;
    } else if (
        source === DLSSources.modLfo &&
        destination === DLSDestinations.pitch
    ) {
        // Mod lfo to pitch
        return generatorTypes.modLfoToPitch;
    } else if (
        source === DLSSources.modLfo &&
        destination === DLSDestinations.filterCutoff
    ) {
        // Mod lfo to filter
        return generatorTypes.modLfoToFilterFc;
    } else if (
        source === DLSSources.modLfo &&
        destination === DLSDestinations.gain
    ) {
        // Mod lfo to volume
        return generatorTypes.modLfoToVolume;
    } else if (
        source === DLSSources.modEnv &&
        destination === DLSDestinations.filterCutoff
    ) {
        // Mod envelope to filter
        return generatorTypes.modEnvToFilterFc;
    } else if (
        source === DLSSources.modEnv &&
        destination === DLSDestinations.pitch
    ) {
        // Mod envelope to pitch
        return generatorTypes.modEnvToPitch;
    } else {
        return undefined;
    }
}

export function getSF2ModulatorFromArticulator(
    source: number,
    control: number,
    destination: number,
    transform: number,
    value: number
): Modulator | undefined {
    // ModulatorConverterDebug(
    //     Source,
    //     Control,
    //     Destination,
    //     Value,
    //     Transform
    // );
    // Check for special combinations
    const specialDestination = checkForSpecialDLSCombo(source, destination);
    let destinationGenerator: GeneratorType;
    let sf2Source: { enum: number; isCC: boolean } | undefined;
    let swapSources = false;
    let isSourceNoController = false;
    let newValue = value;
    if (specialDestination === undefined) {
        // Determine destination
        const sf2GenDestination = getSF2GeneratorFromDLS(destination, value);
        if (sf2GenDestination === undefined) {
            // Cannot be a valid modulator
            SpessaSynthWarn(`Invalid destination: ${destination}`);
            return undefined;
        }
        if (typeof sf2GenDestination === "object") {
            newValue = sf2GenDestination.newAmount;
            destinationGenerator = sf2GenDestination.gen;
        } else {
            destinationGenerator = sf2GenDestination;
        }
        sf2Source = getSF2SourceFromDLS(source);
        if (sf2Source === undefined) {
            // Cannot be a valid modulator
            SpessaSynthWarn(`Invalid source: ${source}`);
            return undefined;
        }
    } else {
        destinationGenerator = specialDestination;
        swapSources = true;
        sf2Source = { enum: modulatorSources.noController, isCC: false };
        isSourceNoController = true;
    }
    const sf2SecondSource = getSF2SourceFromDLS(control);
    if (sf2SecondSource === undefined) {
        // Cannot be a valid modulator
        SpessaSynthWarn(`Invalid control: ${control}`);
        return undefined;
    }

    // Get transforms and final enums
    let sourceEnumFinal;
    if (isSourceNoController) {
        // We force it into this state because before it was some strange value,
        // Like vibrato lfo bipolar, for example,
        // Since we turn it into NoController -> vibLfoToPitch,
        // The result is the same and bipolar controller is technically 0
        sourceEnumFinal = 0x0;
    } else {
        // Output transform is ignored as it's not a thing in soundfont format
        // Unless the curve type of source is linear, then output is copied
        const outputTransform = transform & 0b1111;
        // Source curve type maps to a soundfont curve type in section 2.10, table 9
        let sourceTransform = (transform >> 10) & 0b1111;
        if (
            sourceTransform === modulatorCurveTypes.linear &&
            outputTransform !== modulatorCurveTypes.linear
        ) {
            sourceTransform = outputTransform;
        }
        const sourceIsBipolar = (transform >> 14) & 1;
        let sourceIsNegative = (transform >> 15) & 1;
        // Special case: for attenuation, invert source (dls gain is the opposite of sf2 attenuation)
        if (destinationGenerator === generatorTypes.initialAttenuation) {
            // If the value is negative, the source shall be negative!
            // Why?
            // IDK, it makes it work with ROCK.RMI and NOKIA_S30.dls
            if (value < 0) {
                sourceIsNegative = 1;
            }
        }
        sourceEnumFinal = getModSourceEnum(
            sourceTransform as ModulatorCurveType,
            sourceIsBipolar as ModulatorNumericBool,
            sourceIsNegative as ModulatorNumericBool,
            sf2Source.isCC ? 1 : 0,
            sf2Source.enum as ModulatorSourceEnum
        );
    }

    // A corrupted rendition of gm.dls was found under
    // https://sembiance.com/fileFormatSamples/audio/downloadableSoundBank/
    // Which specifies a whopping -32,768 decibels of attenuation
    if (destinationGenerator === generatorTypes.initialAttenuation) {
        newValue = Math.max(960, Math.min(0, newValue));
    }

    const secSourceTransform = (transform >> 4) & 0b1111;
    const secSourceIsBipolar = (transform >> 8) & 1;
    const secSourceIsNegative = (transform >> 9) & 1;
    let secSourceEnumFinal = getModSourceEnum(
        secSourceTransform as ModulatorCurveType,
        secSourceIsBipolar as ModulatorNumericBool,
        secSourceIsNegative as ModulatorNumericBool,
        sf2SecondSource.isCC ? 1 : 0,
        sf2SecondSource.enum as ModulatorSourceEnum
    );

    if (swapSources) {
        const temp = secSourceEnumFinal;
        secSourceEnumFinal = sourceEnumFinal;
        sourceEnumFinal = temp;
    }

    // Return the modulator!
    return new DecodedModulator(
        sourceEnumFinal,
        secSourceEnumFinal,
        destinationGenerator,
        newValue,
        0x0
    );
}

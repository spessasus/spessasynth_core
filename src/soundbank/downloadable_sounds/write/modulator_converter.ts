import {
    type DLSDestination,
    DLSDestinations,
    type DLSSource,
    DLSSources,
    generatorTypes,
    modulatorCurveTypes,
    modulatorSources
} from "../../enums";
import { Articulator } from "./articulator";
import { SpessaSynthWarn } from "../../../utils/loggin";
import type { Generator } from "../../basic_soundbank/generator";
import type { Modulator } from "../../basic_soundbank/modulator";
import { midiControllers } from "../../../midi/enums";

function getDLSSourceFromSf2Source(cc: 0 | 1, index: number) {
    if (cc) {
        switch (index) {
            default:
                // DLS supports limited controllers
                return undefined;

            case midiControllers.modulationWheel:
                return DLSSources.modulationWheel;
            case midiControllers.mainVolume:
                return DLSSources.volume;
            case midiControllers.pan:
                return DLSSources.pan;
            case midiControllers.expressionController:
                return DLSSources.expression;
            case midiControllers.chorusDepth:
                return DLSSources.chorus;
            case midiControllers.reverbDepth:
                return DLSSources.reverb;
        }
    } else {
        switch (index) {
            default:
                // Cannot be a DLS articulator
                return undefined;

            case modulatorSources.noteOnKeyNum:
                return DLSSources.keyNum;
            case modulatorSources.noteOnVelocity:
                return DLSSources.velocity;
            case modulatorSources.noController:
                return DLSSources.none;
            case modulatorSources.polyPressure:
                return DLSSources.polyPressure;
            case modulatorSources.channelPressure:
                return DLSSources.channelPressure;
            case modulatorSources.pitchWheel:
                return DLSSources.pitchWheel;
            case modulatorSources.pitchWheelRange:
                return DLSSources.pitchWheelRange;
        }
    }
}

function getDLSDestinationFromSf2(
    dest: number,
    amount: number
): number | undefined | { dest: number; amount: number } {
    switch (dest) {
        default:
            return undefined;

        case generatorTypes.initialAttenuation:
            // The amount does not get EMU corrected here, as this only applies to modulator attenuation
            // The generator (affected) attenuation is handled in wsmp.
            return { dest: DLSDestinations.gain, amount: -amount };
        case generatorTypes.fineTune:
            return DLSDestinations.pitch;
        case generatorTypes.pan:
            return DLSDestinations.pan;
        case generatorTypes.keyNum:
            return DLSDestinations.keyNum;

        case generatorTypes.reverbEffectsSend:
            return DLSDestinations.reverbSend;
        case generatorTypes.chorusEffectsSend:
            return DLSDestinations.chorusSend;

        case generatorTypes.freqModLFO:
            return DLSDestinations.modLfoFreq;
        case generatorTypes.delayModLFO:
            return DLSDestinations.modLfoDelay;

        case generatorTypes.delayVibLFO:
            return DLSDestinations.vibLfoDelay;
        case generatorTypes.freqVibLFO:
            return DLSDestinations.vibLfoFreq;

        case generatorTypes.delayVolEnv:
            return DLSDestinations.volEnvDelay;
        case generatorTypes.attackVolEnv:
            return DLSDestinations.volEnvAttack;
        case generatorTypes.holdVolEnv:
            return DLSDestinations.volEnvHold;
        case generatorTypes.decayVolEnv:
            return DLSDestinations.volEnvDecay;
        case generatorTypes.sustainVolEnv:
            return {
                dest: DLSDestinations.volEnvSustain,
                amount: 1000 - amount
            };
        case generatorTypes.releaseVolEnv:
            return DLSDestinations.volEnvRelease;

        case generatorTypes.delayModEnv:
            return DLSDestinations.modEnvDelay;
        case generatorTypes.attackModEnv:
            return DLSDestinations.modEnvAttack;
        case generatorTypes.holdModEnv:
            return DLSDestinations.modEnvHold;
        case generatorTypes.decayModEnv:
            return DLSDestinations.modEnvDecay;
        case generatorTypes.sustainModEnv:
            return {
                dest: DLSDestinations.modEnvSustain,
                amount: 1000 - amount
            };
        case generatorTypes.releaseModEnv:
            return DLSDestinations.modEnvRelease;

        case generatorTypes.initialFilterFc:
            return DLSDestinations.filterCutoff;
        case generatorTypes.initialFilterQ:
            return DLSDestinations.filterQ;
    }
}

function checkSF2SpecialCombos(dest: number, amt: number) {
    switch (dest) {
        default:
            return undefined;
        // Mod env
        case generatorTypes.modEnvToFilterFc:
            return {
                source: DLSSources.modEnv,
                dest: DLSDestinations.filterCutoff,
                amt: amt,
                isBipolar: false
            };
        case generatorTypes.modEnvToPitch:
            return {
                source: DLSSources.modEnv,
                dest: DLSDestinations.pitch,
                amt: amt,
                isBipolar: false
            };

        // Mod lfo
        case generatorTypes.modLfoToFilterFc:
            return {
                source: DLSSources.modLfo,
                dest: DLSDestinations.filterCutoff,
                amt: amt,
                isBipolar: true
            };
        case generatorTypes.modLfoToVolume:
            return {
                source: DLSSources.modLfo,
                dest: DLSDestinations.gain,
                amt: amt,
                isBipolar: true
            };
        case generatorTypes.modLfoToPitch:
            return {
                source: DLSSources.modLfo,
                dest: DLSDestinations.pitch,
                amt: amt,
                isBipolar: true
            };

        // Vib lfo
        case generatorTypes.vibLfoToPitch:
            return {
                source: DLSSources.vibratoLfo,
                dest: DLSDestinations.pitch,
                amt: amt,
                isBipolar: true
            };

        // Key to something
        case generatorTypes.keyNumToVolEnvHold:
            return {
                source: DLSSources.keyNum,
                dest: DLSDestinations.volEnvHold,
                amt: amt,
                isBipolar: true
            };
        case generatorTypes.keyNumToVolEnvDecay:
            return {
                source: DLSSources.keyNum,
                dest: DLSDestinations.volEnvDecay,
                amt: amt,
                isBipolar: true
            };
        case generatorTypes.keyNumToModEnvHold:
            return {
                source: DLSSources.keyNum,
                dest: DLSDestinations.modEnvHold,
                amt: amt,
                isBipolar: true
            };
        case generatorTypes.keyNumToModEnvDecay:
            return {
                source: DLSSources.keyNum,
                dest: DLSDestinations.modEnvDecay,
                amt: amt,
                isBipolar: true
            };

        // Scale tuning is implemented in DLS via an articulator:
        // KeyNum to relative pitch at 12,800 cents.
        // Change that to scale tuning * 128.
        // Therefore, a regular scale is still 12,800, half is 6400, etc.
        case generatorTypes.scaleTuning:
            return {
                source: DLSSources.keyNum,
                dest: DLSDestinations.pitch,
                amt: amt * 128,
                isBipolar: false // According to table 4, this should be false.
            };
    }
}

export function getDLSArticulatorFromSf2Generator(
    gen: Generator
): Articulator | undefined {
    const dest = getDLSDestinationFromSf2(
        gen.generatorType,
        gen.generatorValue
    );
    let destination = dest;
    let source = 0;
    let amount = gen.generatorValue;
    if (typeof dest === "object") {
        amount = dest.amount;
        destination = dest.dest;
    }
    // Check for special combo
    const combo = checkSF2SpecialCombos(gen.generatorType, gen.generatorValue);
    if (combo !== undefined) {
        amount = combo.amt;
        destination = combo.dest;
        source = combo.source;
    } else if (destination === undefined) {
        SpessaSynthWarn(`Invalid generator type: ${gen.generatorType}`);
        return undefined;
    }
    return new Articulator(
        source as DLSSource,
        0,
        destination as DLSDestination,
        amount,
        0
    );
}

export function getDLSArticulatorFromSf2Modulator(
    mod: Modulator
): Articulator | undefined {
    if (mod.transformType !== 0) {
        SpessaSynthWarn("Other transform types are not supported.");
        return undefined;
    }
    let source: number | undefined = getDLSSourceFromSf2Source(
        mod.sourceUsesCC,
        mod.sourceIndex
    );
    let sourceTransformType = mod.sourceCurveType;
    let sourceBipolar = mod.sourcePolarity;
    let sourceDirection = mod.sourceDirection;
    if (source === undefined) {
        SpessaSynthWarn(
            `Invalid source: ${mod.sourceIndex}, CC: ${mod.sourceUsesCC}`
        );
        return undefined;
    }
    let control: number | undefined = getDLSSourceFromSf2Source(
        mod.secSrcUsesCC,
        mod.secSrcIndex
    );
    let controlTransformType = mod.secSrcCurveType;
    let controlBipolar = mod.secSrcPolarity;
    let controlDirection = mod.secSrcDirection;
    if (control === undefined) {
        SpessaSynthWarn(
            `Invalid secondary source: ${mod.secSrcIndex}, CC: ${mod.secSrcUsesCC}`
        );
        return undefined;
    }
    const dlsDestinationFromSf2 = getDLSDestinationFromSf2(
        mod.destination,
        mod.transformAmount
    );
    let destination = dlsDestinationFromSf2;
    let amt = mod.transformAmount;
    if (typeof dlsDestinationFromSf2 === "object") {
        destination = dlsDestinationFromSf2.dest;
        amt = dlsDestinationFromSf2.amount;
    }
    const specialCombo = checkSF2SpecialCombos(
        mod.destination,
        mod.transformAmount
    );
    if (specialCombo !== undefined) {
        amt = specialCombo.amt;
        // Move the source to control
        control = source;
        controlTransformType = sourceTransformType;
        controlBipolar = sourceBipolar;
        controlDirection = sourceDirection;

        // Set source as static as it's either: env, lfo or key num
        sourceTransformType = modulatorCurveTypes.linear;
        sourceBipolar = specialCombo.isBipolar ? 1 : 0;
        sourceDirection = 0;
        source = specialCombo.source;
        destination = specialCombo.dest;
    } else if (destination === undefined) {
        SpessaSynthWarn(`Invalid destination: ${mod.destination}`);
        return undefined;
    }

    // Source curve type maps to a soundfont curve type in section 2.10, table 9
    let transform = 0;
    transform |= controlTransformType << 4;
    transform |= controlBipolar << 8;
    transform |= controlDirection << 9;

    // Use the source curve in output transform
    transform |= sourceTransformType;
    transform |= sourceBipolar << 14;
    transform |= sourceDirection << 15;
    return new Articulator(
        source as DLSSource,
        control as DLSSource,
        destination as DLSDestination,
        amt,
        transform
    );
}

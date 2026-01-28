import { ConnectionSource } from "./connection_source";
import {
    type DLSDestination,
    dlsDestinations,
    type DLSSource,
    dlsSources,
    type DLSTransform,
    modulatorCurveTypes
} from "../enums";
import { IndexedByteArray } from "../../utils/indexed_array";
import {
    readLittleEndianIndexed,
    writeDword,
    writeWord
} from "../../utils/byte_functions/little_endian";
import { bitMaskToBool } from "../../utils/byte_functions/bit_mask";
import { Generator } from "../basic_soundbank/generator";
import {
    type GeneratorType,
    generatorTypes
} from "../basic_soundbank/generator_types";
import { SpessaSynthInfo, SpessaSynthWarn } from "../../utils/loggin";
import { BasicZone } from "../basic_soundbank/basic_zone";
import { consoleColors } from "../../utils/other";
import { ModulatorSource } from "../basic_soundbank/modulator_source";
import { Modulator } from "../basic_soundbank/modulator";
import type { DownloadableSoundsArticulation } from "./articulation";
import {
    DEFAULT_DLS_CHORUS,
    DEFAULT_DLS_REVERB
} from "./default_dls_modulators";

const invalidGeneratorTypes = new Set<GeneratorType>([
    generatorTypes.sampleModes, // Set in wave sample
    generatorTypes.initialAttenuation, // Set in wave sample
    generatorTypes.keyRange, // Set in region header
    generatorTypes.velRange, // Set in region header
    generatorTypes.sampleID, // Set in wave link
    generatorTypes.fineTune, // Set in wave sample
    generatorTypes.coarseTune, // Set in wave sample
    generatorTypes.startAddrsOffset, // Does not exist in DLS
    generatorTypes.startAddrsCoarseOffset, // Does not exist in DLS
    generatorTypes.endAddrOffset, // Does not exist in DLS
    generatorTypes.endAddrsCoarseOffset, // Set in wave sample
    generatorTypes.startloopAddrsOffset, // Set in wave sample
    generatorTypes.startloopAddrsCoarseOffset, // Set in wave sample
    generatorTypes.endloopAddrsOffset, // Set in wave sample
    generatorTypes.endloopAddrsCoarseOffset, // Set in wave sample
    generatorTypes.overridingRootKey, // Set in wave sample
    generatorTypes.exclusiveClass // Set in region header
] as const);

/**
 * Represents a single DLS articulator (connection block)
 */
export class ConnectionBlock {
    /**
     * Like SF2 modulator source.
     */
    public readonly source: ConnectionSource;
    /**
     * Like SF2 modulator secondary source.
     */
    public readonly control: ConnectionSource;
    /**
     * Like SF2 destination.
     */
    public readonly destination: DLSDestination;
    /**
     * Like SF2 amount, but long (32-bit) instead of short.
     */
    public readonly scale: number;
    /**
     * Like SF2 source transforms.
     */
    public readonly transform: DLSTransform;

    public constructor(
        source = new ConnectionSource(),
        control = new ConnectionSource(),
        destination: DLSDestination,
        transform: DLSTransform,
        scale: number
    ) {
        this.source = source;
        this.control = control;
        this.destination = destination;
        this.transform = transform;
        this.scale = scale;
    }

    public get isStaticParameter() {
        return (
            this.source.source === dlsSources.none &&
            this.control.source === dlsSources.none
        );
    }

    public get shortScale() {
        return this.scale >> 16;
    }

    private get transformName() {
        return (
            Object.keys(modulatorCurveTypes).find(
                (k) =>
                    modulatorCurveTypes[
                        k as keyof typeof modulatorCurveTypes
                    ] === this.transform
            ) ?? this.transform.toString()
        );
    }

    private get destinationName() {
        return (
            Object.keys(dlsDestinations).find(
                (k) =>
                    dlsDestinations[k as keyof typeof dlsDestinations] ===
                    this.destination
            ) ?? this.destination.toString()
        );
    }

    public static read(artData: IndexedByteArray) {
        const usSource = readLittleEndianIndexed(artData, 2);
        const usControl = readLittleEndianIndexed(artData, 2);
        const usDestination = readLittleEndianIndexed(
            artData,
            2
        ) as DLSDestination;
        const usTransform = readLittleEndianIndexed(artData, 2);
        const lScale = readLittleEndianIndexed(artData, 4) | 0;
        /*
        2.10 <art2-ck>, Level 2 Articulator Chunk
        usTransform
        Bits 0-3 specify one of 16 possible output transforms. Bits 4-7 specify one of 16 possible transforms to apply to
        the usControl input. Bits 8 and 9 specify whether the usControl input should be inverted and/or bipolar. Bits 10-13
        specify one of 16 possible transforms to apply to the usSource input. Bit 14 and 15 specify whether the usSource
        input should be inverted and/or bipolar.
       */
        // Decode usTransform
        const transform = (usTransform & 0x0f) as DLSTransform;

        // Decode usControl
        const controlTransform = ((usTransform >> 4) & 0x0f) as DLSTransform;
        const controlBipolar = bitMaskToBool(usTransform, 8);
        const controlInvert = bitMaskToBool(usTransform, 9);
        const control = new ConnectionSource(
            usControl as DLSSource,
            controlTransform,
            controlBipolar,
            controlInvert
        );

        // Decode usSource
        const sourceTransform = ((usTransform >> 10) & 0x0f) as DLSTransform;
        const sourceBipolar = bitMaskToBool(usTransform, 14);
        const sourceInvert = bitMaskToBool(usTransform, 15);

        const source = new ConnectionSource(
            usSource as DLSSource,
            sourceTransform,
            sourceBipolar,
            sourceInvert
        );

        return new ConnectionBlock(
            source,
            control,
            usDestination,
            transform,
            lScale
        );
    }

    public static fromSFModulator(
        m: Modulator,
        articulation: DownloadableSoundsArticulation
    ) {
        const failed = (msg: string) => {
            SpessaSynthWarn(
                `Failed converting SF modulator into DLS:\n ${m.toString()} \n(${msg})`
            );
        };

        if (m.transformType !== 0) {
            failed("Absolute transform type is not supported");
            return;
        }
        // Do not write the default DLS effect modulators
        if (
            Modulator.isIdentical(m, DEFAULT_DLS_CHORUS, true) ||
            Modulator.isIdentical(m, DEFAULT_DLS_REVERB, true)
        ) {
            return;
        }
        let source = ConnectionSource.fromSFSource(m.primarySource);
        if (!source) {
            failed("Invalid primary source");
            return;
        }
        let control = ConnectionSource.fromSFSource(m.secondarySource);
        if (!control) {
            failed("Invalid secondary source");
            return;
        }
        const dlsDestination = ConnectionBlock.fromSFDestination(
            m.destination,
            m.transformAmount
        );
        if (dlsDestination === undefined) {
            failed("Invalid destination");
            return;
        }
        let amount = m.transformAmount;
        let destination: DLSDestination;
        if (typeof dlsDestination === "number") {
            destination = dlsDestination;
        } else {
            destination = dlsDestination.destination;
            amount = dlsDestination.amount;
            /*
             Check for a special case, for example mod wheel to vibLfoToPitch
             comprises vibLFO source, mod wheel control and pitch destination.
            */
            if (dlsDestination.source !== dlsSources.none) {
                if (
                    control.source !== dlsSources.none &&
                    source.source !== dlsSources.none
                ) {
                    failed(
                        "Articulation generators with secondary source are not supported"
                    );
                    return;
                }
                // Move the source to control if needed
                if (source.source !== dlsSources.none) {
                    control = source;
                }
                source = new ConnectionSource(
                    dlsDestination.source,
                    modulatorCurveTypes.linear,
                    dlsDestination.isBipolar
                );
            }
        }
        const bloc = new ConnectionBlock(
            source,
            control,
            destination,
            0,
            amount << 16
        );
        articulation.connectionBlocks.push(bloc);
    }

    public static copyFrom(inputBlock: ConnectionBlock) {
        return new ConnectionBlock(
            ConnectionSource.copyFrom(inputBlock.source),
            ConnectionSource.copyFrom(inputBlock.control),
            inputBlock.destination,
            inputBlock.transform,
            inputBlock.scale
        );
    }

    public static fromSFGenerator(
        generator: Generator,
        articulation: DownloadableSoundsArticulation
    ) {
        if (invalidGeneratorTypes.has(generator.generatorType)) {
            return;
        }

        const failed = (msg: string) => {
            SpessaSynthWarn(
                `Failed converting SF2 generator into DLS:\n ${generator.toString()} \n(${msg})`
            );
        };

        const dlsDestination = ConnectionBlock.fromSFDestination(
            generator.generatorType,
            generator.generatorValue
        );
        if (dlsDestination === undefined) {
            failed("Invalid type");
            return;
        }
        const source = new ConnectionSource();
        let destination: DLSDestination;
        let amount = generator.generatorValue;

        // Envelope generators are limited to 40 seconds,
        // However the keyToEnv correction makes us use the full SF range.

        if (typeof dlsDestination === "number") {
            destination = dlsDestination;
        } else {
            destination = dlsDestination.destination;
            amount = dlsDestination.amount;

            source.source = dlsDestination.source;
            source.bipolar = dlsDestination.isBipolar;
        }

        articulation.connectionBlocks.push(
            new ConnectionBlock(
                source,
                new ConnectionSource(),
                destination,
                0,
                amount << 16
            )
        );
    }

    private static fromSFDestination(
        dest: GeneratorType,
        amount: number
    ):
        | DLSDestination
        | {
              source: DLSSource;
              destination: DLSDestination;
              isBipolar: boolean;
              amount: number;
          }
        | undefined {
        switch (dest) {
            default: {
                return undefined;
            }

            case generatorTypes.initialAttenuation: {
                // The amount does not get EMU corrected here, as this only applies to modulator attenuation
                // The generator (affected) attenuation is handled in wsmp.
                return {
                    destination: dlsDestinations.gain,
                    amount: -amount,
                    isBipolar: false,
                    source: dlsSources.none
                };
            }
            case generatorTypes.fineTune: {
                return dlsDestinations.pitch;
            }
            case generatorTypes.pan: {
                return dlsDestinations.pan;
            }
            case generatorTypes.keyNum: {
                return dlsDestinations.keyNum;
            }

            case generatorTypes.reverbEffectsSend: {
                return dlsDestinations.reverbSend;
            }
            case generatorTypes.chorusEffectsSend: {
                return dlsDestinations.chorusSend;
            }

            case generatorTypes.freqModLFO: {
                return dlsDestinations.modLfoFreq;
            }
            case generatorTypes.delayModLFO: {
                return dlsDestinations.modLfoDelay;
            }

            case generatorTypes.delayVibLFO: {
                return dlsDestinations.vibLfoDelay;
            }
            case generatorTypes.freqVibLFO: {
                return dlsDestinations.vibLfoFreq;
            }

            case generatorTypes.delayVolEnv: {
                return dlsDestinations.volEnvDelay;
            }
            case generatorTypes.attackVolEnv: {
                return dlsDestinations.volEnvAttack;
            }
            case generatorTypes.holdVolEnv: {
                return dlsDestinations.volEnvHold;
            }
            case generatorTypes.decayVolEnv: {
                return dlsDestinations.volEnvDecay;
            }
            case generatorTypes.sustainVolEnv: {
                return {
                    destination: dlsDestinations.volEnvSustain,
                    amount: 1000 - amount,
                    isBipolar: false,
                    source: dlsSources.none
                };
            }
            case generatorTypes.releaseVolEnv: {
                return dlsDestinations.volEnvRelease;
            }

            case generatorTypes.delayModEnv: {
                return dlsDestinations.modEnvDelay;
            }
            case generatorTypes.attackModEnv: {
                return dlsDestinations.modEnvAttack;
            }
            case generatorTypes.holdModEnv: {
                return dlsDestinations.modEnvHold;
            }
            case generatorTypes.decayModEnv: {
                return dlsDestinations.modEnvDecay;
            }
            case generatorTypes.sustainModEnv: {
                return {
                    destination: dlsDestinations.modEnvSustain,
                    amount: 1000 - amount,
                    isBipolar: false,
                    source: dlsSources.none
                };
            }
            case generatorTypes.releaseModEnv: {
                return dlsDestinations.modEnvRelease;
            }

            case generatorTypes.initialFilterFc: {
                return dlsDestinations.filterCutoff;
            }
            case generatorTypes.initialFilterQ: {
                return dlsDestinations.filterQ;
            }

            // Mod env
            case generatorTypes.modEnvToFilterFc: {
                return {
                    source: dlsSources.modEnv,
                    destination: dlsDestinations.filterCutoff,
                    amount,
                    isBipolar: false
                };
            }
            case generatorTypes.modEnvToPitch: {
                return {
                    source: dlsSources.modEnv,
                    destination: dlsDestinations.pitch,
                    amount,
                    isBipolar: false
                };
            }

            // Mod lfo
            case generatorTypes.modLfoToFilterFc: {
                return {
                    source: dlsSources.modLfo,
                    destination: dlsDestinations.filterCutoff,
                    amount,
                    isBipolar: true
                };
            }
            case generatorTypes.modLfoToVolume: {
                return {
                    source: dlsSources.modLfo,
                    destination: dlsDestinations.gain,
                    amount,
                    isBipolar: true
                };
            }
            case generatorTypes.modLfoToPitch: {
                return {
                    source: dlsSources.modLfo,
                    destination: dlsDestinations.pitch,
                    amount,
                    isBipolar: true
                };
            }

            // Vib lfo
            case generatorTypes.vibLfoToPitch: {
                return {
                    source: dlsSources.vibratoLfo,
                    destination: dlsDestinations.pitch,
                    amount,
                    isBipolar: true
                };
            }

            // Key to something
            case generatorTypes.keyNumToVolEnvHold: {
                return {
                    source: dlsSources.keyNum,
                    destination: dlsDestinations.volEnvHold,
                    amount,
                    isBipolar: true
                };
            }
            case generatorTypes.keyNumToVolEnvDecay: {
                return {
                    source: dlsSources.keyNum,
                    destination: dlsDestinations.volEnvDecay,
                    amount,
                    isBipolar: true
                };
            }
            case generatorTypes.keyNumToModEnvHold: {
                return {
                    source: dlsSources.keyNum,
                    destination: dlsDestinations.modEnvHold,
                    amount,
                    isBipolar: true
                };
            }
            case generatorTypes.keyNumToModEnvDecay: {
                return {
                    source: dlsSources.keyNum,
                    destination: dlsDestinations.modEnvDecay,
                    amount,
                    isBipolar: true
                };
            }

            case generatorTypes.scaleTuning: {
                // Scale tuning is implemented in DLS via an articulator:
                // KeyNum to relative pitch at 12,800 cents.
                // Change that to scale tuning * 128.
                // Therefore, a regular scale is still 12,800, half is 6400, etc.
                return {
                    source: dlsSources.keyNum,
                    destination: dlsDestinations.pitch,
                    amount: amount * 128,
                    isBipolar: false // According to table 4, this should be false.
                };
            }
        }
    }

    public toString() {
        return (
            `Source: ${this.source.toString()},\n` +
            `Control: ${this.control.toString()},\n` +
            `Scale: ${this.scale} >> 16 = ${this.shortScale},\n` +
            `Output transform: ${this.transformName}\n` +
            `Destination: ${this.destinationName}`
        );
    }

    public write() {
        const out = new IndexedByteArray(12);
        writeWord(out, this.source.source);
        writeWord(out, this.control.source);
        writeWord(out, this.destination);
        const transformEnum =
            this.transform |
            (this.control.toTransformFlag() << 4) |
            (this.source.toTransformFlag() << 10);
        writeWord(out, transformEnum);
        writeDword(out, this.scale);
        return out;
    }

    public toSFGenerator(zone: BasicZone) {
        const destination = this.destination;
        // SF2 uses 16-bit amounts, DLS uses 32-bit scale.
        const value = this.shortScale;

        switch (destination) {
            default: {
                SpessaSynthInfo(
                    `%cFailed converting DLS articulator into SF generator: %c${this.toString()}%c\n(invalid destination)`,
                    consoleColors.warn,
                    consoleColors.value,
                    consoleColors.unrecognized
                );
                return;
            }

            case dlsDestinations.pan: {
                zone.setGenerator(generatorTypes.pan, value);
                break;
            }
            case dlsDestinations.gain: {
                // Turn to centibels and apply emu correction
                zone.addToGenerator(
                    generatorTypes.initialAttenuation,
                    -value / 0.4
                );
                break;
            }
            case dlsDestinations.filterCutoff: {
                zone.setGenerator(generatorTypes.initialFilterFc, value);
                break;
            }
            case dlsDestinations.filterQ: {
                zone.setGenerator(generatorTypes.initialFilterQ, value);
                break;
            }

            // Mod LFO raw values it seems
            case dlsDestinations.modLfoFreq: {
                zone.setGenerator(generatorTypes.freqModLFO, value);
                break;
            }
            case dlsDestinations.modLfoDelay: {
                zone.setGenerator(generatorTypes.delayModLFO, value);
                break;
            }
            case dlsDestinations.vibLfoFreq: {
                zone.setGenerator(generatorTypes.freqVibLFO, value);
                break;
            }
            case dlsDestinations.vibLfoDelay: {
                zone.setGenerator(generatorTypes.delayVibLFO, value);
                break;
            }

            // Vol. env: all times are timecents like sf2
            case dlsDestinations.volEnvDelay: {
                zone.setGenerator(generatorTypes.delayVolEnv, value);
                break;
            }
            case dlsDestinations.volEnvAttack: {
                zone.setGenerator(generatorTypes.attackVolEnv, value);
                break;
            }
            case dlsDestinations.volEnvHold: {
                zone.setGenerator(generatorTypes.holdVolEnv, value);
                break;
            }
            case dlsDestinations.volEnvDecay: {
                zone.setGenerator(generatorTypes.decayVolEnv, value);
                break;
            }
            case dlsDestinations.volEnvRelease: {
                zone.setGenerator(generatorTypes.releaseVolEnv, value);
                break;
            }
            case dlsDestinations.volEnvSustain: {
                // Gain seems to be (1000 - value) = sustain cB
                zone.setGenerator(generatorTypes.sustainVolEnv, 1000 - value);
                break;
            }

            // Mod env
            case dlsDestinations.modEnvDelay: {
                zone.setGenerator(generatorTypes.delayModEnv, value);
                break;
            }
            case dlsDestinations.modEnvAttack: {
                zone.setGenerator(generatorTypes.attackModEnv, value);
                break;
            }
            case dlsDestinations.modEnvHold: {
                zone.setGenerator(generatorTypes.holdModEnv, value);
                break;
            }
            case dlsDestinations.modEnvDecay: {
                zone.setGenerator(generatorTypes.decayModEnv, value);
                break;
            }
            case dlsDestinations.modEnvRelease: {
                zone.setGenerator(generatorTypes.releaseModEnv, value);
                break;
            }
            case dlsDestinations.modEnvSustain: {
                // DLS uses 0.1%, SF uses 0.1%
                zone.setGenerator(generatorTypes.sustainModEnv, 1000 - value);
                break;
            }

            case dlsDestinations.reverbSend: {
                zone.setGenerator(generatorTypes.reverbEffectsSend, value);
                break;
            }
            case dlsDestinations.chorusSend: {
                zone.setGenerator(generatorTypes.chorusEffectsSend, value);
                break;
            }
            case dlsDestinations.pitch: {
                zone.fineTuning += value;
                break;
            }
        }
    }

    public toSFModulator(zone: BasicZone) {
        // Output modulator variables
        let amount = this.shortScale;
        let modulatorDestination: GeneratorType;
        let primarySource: ModulatorSource | undefined;
        let secondarySource = new ModulatorSource();

        const specialDestination = this.toCombinedSFDestination();
        if (specialDestination) {
            /*
             Special destination detected.
             This means modLfoToPitch for example, as an SF modulator like

             CC#1 -> | x50 | -> modLfoToPitch

             In DLS is:

             Mod LFO -> | x50 | -> pitch
             CC#1    -> |     |
            */
            modulatorDestination = specialDestination;
            const controlSF = this.control.toSFSource();
            if (!controlSF) {
                this.failedConversion("Invalid control");
                return;
            }
            primarySource = controlSF;
        } else {
            // Convert destination
            const convertedDestination = this.toSFDestination();
            if (!convertedDestination) {
                // Cannot be a valid modulator
                this.failedConversion("Invalid destination");
                return;
            }
            // The conversion may specify an adjusted value
            if (typeof convertedDestination === "object") {
                amount = convertedDestination.newAmount;
                modulatorDestination = convertedDestination.gen;
            } else {
                modulatorDestination = convertedDestination;
            }
            const convertedPrimary = this.source.toSFSource();
            if (!convertedPrimary) {
                this.failedConversion("Invalid source");
                return;
            }
            primarySource = convertedPrimary;

            const convertedSecondary = this.control.toSFSource();
            if (!convertedSecondary) {
                this.failedConversion("Invalid control");
                return;
            }
            secondarySource = convertedSecondary;
        }
        // Output transform is ignored as it's not a thing in soundfont format
        // Unless the curve type of source is linear, then output is copied.
        // Testcase: Fury.dls (sets concave output transform for the key to attenuation)
        if (
            this.transform !== modulatorCurveTypes.linear &&
            primarySource.curveType === modulatorCurveTypes.linear
        ) {
            primarySource.curveType = this.transform;
        }

        if (modulatorDestination === generatorTypes.initialAttenuation) {
            if (
                this.source.source === dlsSources.velocity ||
                this.source.source === dlsSources.volume ||
                this.source.source === dlsSources.expression
            ) {
                /*
                Some DLS banks (example: Fury.dls or 1 - House.rmi) only specify the output transform,
                while completely omitting the invert flag for this articulator.
                This results in the modulator rendering the voice inaudible, as the attenuation increases with velocity,
                which also conflicts with the default velToAtt modulator
                Yet most software seems to load them fine, so we invert it here.
                 */
                primarySource.isNegative = true;
            }

            // A corrupted rendition of gm.dls was found under
            // https://sembiance.com/fileFormatSamples/audio/downloadableSoundBank/
            // Name: (GM.dls)
            // Which specifies a whopping 32,768 centibels of attenuation
            amount = Math.min(960, Math.max(0, amount));
        }

        // Get the modulator!
        const mod = new Modulator(
            primarySource,
            secondarySource,
            modulatorDestination,
            amount,
            0
        );
        zone.addModulators(mod);
    }

    /**
     * Checks for an SF generator that consists of DLS source and destination (such as mod LFO and pitch)
     * @returns either a matching SF generator or nothing.
     */
    public toCombinedSFDestination(): GeneratorType | undefined {
        const source = this.source.source;
        const destination = this.destination;
        if (
            source === dlsSources.vibratoLfo &&
            destination === dlsDestinations.pitch
        ) {
            // Vibrato lfo to pitch
            return generatorTypes.vibLfoToPitch;
        } else if (
            source === dlsSources.modLfo &&
            destination === dlsDestinations.pitch
        ) {
            // Mod lfo to pitch
            return generatorTypes.modLfoToPitch;
        } else if (
            source === dlsSources.modLfo &&
            destination === dlsDestinations.filterCutoff
        ) {
            // Mod lfo to filter
            return generatorTypes.modLfoToFilterFc;
        } else if (
            source === dlsSources.modLfo &&
            destination === dlsDestinations.gain
        ) {
            // Mod lfo to volume
            return generatorTypes.modLfoToVolume;
        } else if (
            source === dlsSources.modEnv &&
            destination === dlsDestinations.filterCutoff
        ) {
            // Mod envelope to filter
            return generatorTypes.modEnvToFilterFc;
        } else if (
            source === dlsSources.modEnv &&
            destination === dlsDestinations.pitch
        ) {
            // Mod envelope to pitch
            return generatorTypes.modEnvToPitch;
        } else {
            return undefined;
        }
    }

    private failedConversion(msg: string) {
        SpessaSynthInfo(
            `%cFailed converting DLS articulator into SF2:\n %c${this.toString()}%c\n(${msg})`,
            consoleColors.warn,
            consoleColors.value,
            consoleColors.unrecognized
        );
    }

    /**
     * Converts DLS destination of this block to an SF2 one, also with the correct amount.
     * @private
     */
    private toSFDestination():
        | GeneratorType
        | undefined
        | { gen: GeneratorType; newAmount: number } {
        const amount = this.shortScale;
        switch (this.destination) {
            default:
            case dlsDestinations.none: {
                return undefined;
            }
            case dlsDestinations.pan: {
                return generatorTypes.pan;
            }
            case dlsDestinations.gain: {
                return {
                    // DLS uses gain, SF uses attenuation
                    gen: generatorTypes.initialAttenuation,
                    newAmount: -amount
                };
            }
            case dlsDestinations.pitch: {
                return generatorTypes.fineTune;
            }
            case dlsDestinations.keyNum: {
                return generatorTypes.overridingRootKey;
            }

            // Vol env
            case dlsDestinations.volEnvDelay: {
                return generatorTypes.delayVolEnv;
            }
            case dlsDestinations.volEnvAttack: {
                return generatorTypes.attackVolEnv;
            }
            case dlsDestinations.volEnvHold: {
                return generatorTypes.holdVolEnv;
            }
            case dlsDestinations.volEnvDecay: {
                return generatorTypes.decayVolEnv;
            }
            case dlsDestinations.volEnvSustain: {
                return {
                    gen: generatorTypes.sustainVolEnv,
                    newAmount: 1000 - amount
                };
            }
            case dlsDestinations.volEnvRelease: {
                return generatorTypes.releaseVolEnv;
            }

            // Mod env
            case dlsDestinations.modEnvDelay: {
                return generatorTypes.delayModEnv;
            }
            case dlsDestinations.modEnvAttack: {
                return generatorTypes.attackModEnv;
            }
            case dlsDestinations.modEnvHold: {
                return generatorTypes.holdModEnv;
            }
            case dlsDestinations.modEnvDecay: {
                return generatorTypes.decayModEnv;
            }
            case dlsDestinations.modEnvSustain: {
                return {
                    gen: generatorTypes.sustainModEnv,
                    newAmount: 1000 - amount
                };
            }
            case dlsDestinations.modEnvRelease: {
                return generatorTypes.releaseModEnv;
            }

            case dlsDestinations.filterCutoff: {
                return generatorTypes.initialFilterFc;
            }
            case dlsDestinations.filterQ: {
                return generatorTypes.initialFilterQ;
            }
            case dlsDestinations.chorusSend: {
                return generatorTypes.chorusEffectsSend;
            }
            case dlsDestinations.reverbSend: {
                return generatorTypes.reverbEffectsSend;
            }

            // Lfo
            case dlsDestinations.modLfoFreq: {
                return generatorTypes.freqModLFO;
            }
            case dlsDestinations.modLfoDelay: {
                return generatorTypes.delayModLFO;
            }
            case dlsDestinations.vibLfoFreq: {
                return generatorTypes.freqVibLFO;
            }
            case dlsDestinations.vibLfoDelay: {
                return generatorTypes.delayVibLFO;
            }
        }
    }
}

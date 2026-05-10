import { ConnectionSource } from "./connection_source";
import { ModulatorCurveTypes } from "../enums";
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
    GeneratorTypes
} from "../basic_soundbank/generator_types";
import { SpessaLog } from "../../utils/loggin";
import { BasicZone } from "../basic_soundbank/basic_zone";
import { ConsoleColors } from "../../utils/other";
import { ModulatorSource } from "../basic_soundbank/modulator_source";
import { Modulator } from "../basic_soundbank/modulator";
import type { DownloadableSoundsArticulation } from "./articulation";
import {
    DEFAULT_DLS_CHORUS,
    DEFAULT_DLS_REVERB
} from "./default_dls_modulators";
import {
    type DLSDestination,
    DLSDestinations,
    type DLSSource,
    DLSSources,
    type DLSTransform
} from "./enums";

const invalidGeneratorTypes = new Set<GeneratorType>([
    GeneratorTypes.sampleModes, // Set in wave sample
    GeneratorTypes.initialAttenuation, // Set in wave sample
    GeneratorTypes.keyRange, // Set in region header
    GeneratorTypes.velRange, // Set in region header
    GeneratorTypes.sampleID, // Set in wave link
    GeneratorTypes.fineTune, // Set in wave sample
    GeneratorTypes.coarseTune, // Set in wave sample
    GeneratorTypes.startAddrsOffset, // Does not exist in DLS
    GeneratorTypes.startAddrsCoarseOffset, // Does not exist in DLS
    GeneratorTypes.endAddrOffset, // Does not exist in DLS
    GeneratorTypes.endAddrsCoarseOffset, // Set in wave sample
    GeneratorTypes.startloopAddrsOffset, // Set in wave sample
    GeneratorTypes.startloopAddrsCoarseOffset, // Set in wave sample
    GeneratorTypes.endloopAddrsOffset, // Set in wave sample
    GeneratorTypes.endloopAddrsCoarseOffset, // Set in wave sample
    GeneratorTypes.overridingRootKey, // Set in wave sample
    GeneratorTypes.exclusiveClass // Set in region header
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
            this.source.source === DLSSources.none &&
            this.control.source === DLSSources.none
        );
    }

    public get shortScale() {
        return this.scale >> 16;
    }

    private get transformName() {
        return (
            Object.keys(ModulatorCurveTypes).find(
                (k) =>
                    ModulatorCurveTypes[
                        k as keyof typeof ModulatorCurveTypes
                    ] === this.transform
            ) ?? this.transform.toString()
        );
    }

    private get destinationName() {
        return (
            Object.keys(DLSDestinations).find(
                (k) =>
                    DLSDestinations[k as keyof typeof DLSDestinations] ===
                    this.destination
            ) ?? this.destination.toString()
        );
    }

    public static read(artData: IndexedByteArray) {
        const usSource = readLittleEndianIndexed(artData, 2) as DLSSource;
        const usControl = readLittleEndianIndexed(artData, 2) as DLSSource;
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
            usControl,
            controlTransform,
            controlBipolar,
            controlInvert
        );

        // Decode usSource
        const sourceTransform = ((usTransform >> 10) & 0x0f) as DLSTransform;
        const sourceBipolar = bitMaskToBool(usTransform, 14);
        const sourceInvert = bitMaskToBool(usTransform, 15);

        const source = new ConnectionSource(
            usSource,
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
            SpessaLog.warn(
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
            if (dlsDestination.source !== DLSSources.none) {
                if (
                    control.source !== DLSSources.none &&
                    source.source !== DLSSources.none
                ) {
                    failed(
                        "Articulation generators with secondary source are not supported"
                    );
                    return;
                }
                // Move the source to control if needed
                if (source.source !== DLSSources.none) {
                    control = source;
                }
                source = new ConnectionSource(
                    dlsDestination.source,
                    ModulatorCurveTypes.linear,
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
        if (invalidGeneratorTypes.has(generator.type)) {
            return;
        }

        const failed = (msg: string) => {
            SpessaLog.warn(
                `Failed converting SF2 generator into DLS:\n ${generator.toString()} \n(${msg})`
            );
        };

        const dlsDestination = ConnectionBlock.fromSFDestination(
            generator.type,
            generator.value
        );
        if (dlsDestination === undefined) {
            failed("Invalid type");
            return;
        }
        const source = new ConnectionSource();
        let destination: DLSDestination;
        let amount = generator.value;

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

            case GeneratorTypes.initialAttenuation: {
                // The amount does not get EMU corrected here, as this only applies to modulator attenuation
                // The generator (affected) attenuation is handled in wsmp.
                return {
                    destination: DLSDestinations.gain,
                    amount: -amount,
                    isBipolar: false,
                    source: DLSSources.none
                };
            }
            case GeneratorTypes.fineTune: {
                return DLSDestinations.pitch;
            }
            case GeneratorTypes.pan: {
                return DLSDestinations.pan;
            }
            case GeneratorTypes.keyNum: {
                return DLSDestinations.keyNum;
            }

            case GeneratorTypes.reverbEffectsSend: {
                return DLSDestinations.reverbSend;
            }
            case GeneratorTypes.chorusEffectsSend: {
                return DLSDestinations.chorusSend;
            }

            case GeneratorTypes.freqModLFO: {
                return DLSDestinations.modLfoFreq;
            }
            case GeneratorTypes.delayModLFO: {
                return DLSDestinations.modLfoDelay;
            }

            case GeneratorTypes.delayVibLFO: {
                return DLSDestinations.vibLfoDelay;
            }
            case GeneratorTypes.freqVibLFO: {
                return DLSDestinations.vibLfoFreq;
            }

            case GeneratorTypes.delayVolEnv: {
                return DLSDestinations.volEnvDelay;
            }
            case GeneratorTypes.attackVolEnv: {
                return DLSDestinations.volEnvAttack;
            }
            case GeneratorTypes.holdVolEnv: {
                return DLSDestinations.volEnvHold;
            }
            case GeneratorTypes.decayVolEnv: {
                return DLSDestinations.volEnvDecay;
            }
            case GeneratorTypes.sustainVolEnv: {
                return {
                    destination: DLSDestinations.volEnvSustain,
                    amount: 1000 - amount,
                    isBipolar: false,
                    source: DLSSources.none
                };
            }
            case GeneratorTypes.releaseVolEnv: {
                return DLSDestinations.volEnvRelease;
            }

            case GeneratorTypes.delayModEnv: {
                return DLSDestinations.modEnvDelay;
            }
            case GeneratorTypes.attackModEnv: {
                return DLSDestinations.modEnvAttack;
            }
            case GeneratorTypes.holdModEnv: {
                return DLSDestinations.modEnvHold;
            }
            case GeneratorTypes.decayModEnv: {
                return DLSDestinations.modEnvDecay;
            }
            case GeneratorTypes.sustainModEnv: {
                return {
                    destination: DLSDestinations.modEnvSustain,
                    amount: 1000 - amount,
                    isBipolar: false,
                    source: DLSSources.none
                };
            }
            case GeneratorTypes.releaseModEnv: {
                return DLSDestinations.modEnvRelease;
            }

            case GeneratorTypes.initialFilterFc: {
                return DLSDestinations.filterCutoff;
            }
            case GeneratorTypes.initialFilterQ: {
                return DLSDestinations.filterQ;
            }

            // Mod env
            case GeneratorTypes.modEnvToFilterFc: {
                return {
                    source: DLSSources.modEnv,
                    destination: DLSDestinations.filterCutoff,
                    amount,
                    isBipolar: false
                };
            }
            case GeneratorTypes.modEnvToPitch: {
                return {
                    source: DLSSources.modEnv,
                    destination: DLSDestinations.pitch,
                    amount,
                    isBipolar: false
                };
            }

            // Mod lfo
            case GeneratorTypes.modLfoToFilterFc: {
                return {
                    source: DLSSources.modLfo,
                    destination: DLSDestinations.filterCutoff,
                    amount,
                    isBipolar: true
                };
            }
            case GeneratorTypes.modLfoToVolume: {
                return {
                    source: DLSSources.modLfo,
                    destination: DLSDestinations.gain,
                    amount,
                    isBipolar: true
                };
            }
            case GeneratorTypes.modLfoToPitch: {
                return {
                    source: DLSSources.modLfo,
                    destination: DLSDestinations.pitch,
                    amount,
                    isBipolar: true
                };
            }

            // Vib lfo
            case GeneratorTypes.vibLfoToPitch: {
                return {
                    source: DLSSources.vibratoLfo,
                    destination: DLSDestinations.pitch,
                    amount,
                    isBipolar: true
                };
            }

            // Key to something
            case GeneratorTypes.keyNumToVolEnvHold: {
                return {
                    source: DLSSources.keyNum,
                    destination: DLSDestinations.volEnvHold,
                    amount,
                    isBipolar: true
                };
            }
            case GeneratorTypes.keyNumToVolEnvDecay: {
                return {
                    source: DLSSources.keyNum,
                    destination: DLSDestinations.volEnvDecay,
                    amount,
                    isBipolar: true
                };
            }
            case GeneratorTypes.keyNumToModEnvHold: {
                return {
                    source: DLSSources.keyNum,
                    destination: DLSDestinations.modEnvHold,
                    amount,
                    isBipolar: true
                };
            }
            case GeneratorTypes.keyNumToModEnvDecay: {
                return {
                    source: DLSSources.keyNum,
                    destination: DLSDestinations.modEnvDecay,
                    amount,
                    isBipolar: true
                };
            }

            case GeneratorTypes.scaleTuning: {
                // Scale tuning is implemented in DLS via an articulator:
                // KeyNum to relative pitch at 12,800 cents.
                // Change that to scale tuning * 128.
                // Therefore, a regular scale is still 12,800, half is 6400, etc.
                return {
                    source: DLSSources.keyNum,
                    destination: DLSDestinations.pitch,
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
                SpessaLog.info(
                    `%cFailed converting DLS articulator into SF generator: %c${this.toString()}%c\n(invalid destination)`,
                    ConsoleColors.warn,
                    ConsoleColors.value,
                    ConsoleColors.unrecognized
                );
                return;
            }

            case DLSDestinations.pan: {
                zone.setGenerator(GeneratorTypes.pan, value);
                break;
            }
            case DLSDestinations.gain: {
                // Turn to centibels and apply emu correction
                zone.addToGenerator(
                    GeneratorTypes.initialAttenuation,
                    -value / 0.4
                );
                break;
            }
            case DLSDestinations.filterCutoff: {
                zone.setGenerator(GeneratorTypes.initialFilterFc, value);
                break;
            }
            case DLSDestinations.filterQ: {
                zone.setGenerator(GeneratorTypes.initialFilterQ, value);
                break;
            }

            // Mod LFO raw values it seems
            case DLSDestinations.modLfoFreq: {
                zone.setGenerator(GeneratorTypes.freqModLFO, value);
                break;
            }
            case DLSDestinations.modLfoDelay: {
                zone.setGenerator(GeneratorTypes.delayModLFO, value);
                break;
            }
            case DLSDestinations.vibLfoFreq: {
                zone.setGenerator(GeneratorTypes.freqVibLFO, value);
                break;
            }
            case DLSDestinations.vibLfoDelay: {
                zone.setGenerator(GeneratorTypes.delayVibLFO, value);
                break;
            }

            // Vol. env: all times are timecents like sf2
            case DLSDestinations.volEnvDelay: {
                zone.setGenerator(GeneratorTypes.delayVolEnv, value);
                break;
            }
            case DLSDestinations.volEnvAttack: {
                zone.setGenerator(GeneratorTypes.attackVolEnv, value);
                break;
            }
            case DLSDestinations.volEnvHold: {
                zone.setGenerator(GeneratorTypes.holdVolEnv, value);
                break;
            }
            case DLSDestinations.volEnvDecay: {
                zone.setGenerator(GeneratorTypes.decayVolEnv, value);
                break;
            }
            case DLSDestinations.volEnvRelease: {
                zone.setGenerator(GeneratorTypes.releaseVolEnv, value);
                break;
            }
            case DLSDestinations.volEnvSustain: {
                // Gain seems to be (1000 - value) = sustain cB
                zone.setGenerator(GeneratorTypes.sustainVolEnv, 1000 - value);
                break;
            }

            // Mod env
            case DLSDestinations.modEnvDelay: {
                zone.setGenerator(GeneratorTypes.delayModEnv, value);
                break;
            }
            case DLSDestinations.modEnvAttack: {
                zone.setGenerator(GeneratorTypes.attackModEnv, value);
                break;
            }
            case DLSDestinations.modEnvHold: {
                zone.setGenerator(GeneratorTypes.holdModEnv, value);
                break;
            }
            case DLSDestinations.modEnvDecay: {
                zone.setGenerator(GeneratorTypes.decayModEnv, value);
                break;
            }
            case DLSDestinations.modEnvRelease: {
                zone.setGenerator(GeneratorTypes.releaseModEnv, value);
                break;
            }
            case DLSDestinations.modEnvSustain: {
                // DLS uses 0.1%, SF uses 0.1%
                zone.setGenerator(GeneratorTypes.sustainModEnv, 1000 - value);
                break;
            }

            case DLSDestinations.reverbSend: {
                zone.setGenerator(GeneratorTypes.reverbEffectsSend, value);
                break;
            }
            case DLSDestinations.chorusSend: {
                zone.setGenerator(GeneratorTypes.chorusEffectsSend, value);
                break;
            }
            case DLSDestinations.pitch: {
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
            this.transform !== ModulatorCurveTypes.linear &&
            primarySource.curveType === ModulatorCurveTypes.linear
        ) {
            primarySource.curveType = this.transform;
        }

        if (modulatorDestination === GeneratorTypes.initialAttenuation) {
            if (
                this.source.source === DLSSources.velocity ||
                this.source.source === DLSSources.volume ||
                this.source.source === DLSSources.expression
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
            source === DLSSources.vibratoLfo &&
            destination === DLSDestinations.pitch
        ) {
            // Vibrato lfo to pitch
            return GeneratorTypes.vibLfoToPitch;
        } else if (
            source === DLSSources.modLfo &&
            destination === DLSDestinations.pitch
        ) {
            // Mod lfo to pitch
            return GeneratorTypes.modLfoToPitch;
        } else if (
            source === DLSSources.modLfo &&
            destination === DLSDestinations.filterCutoff
        ) {
            // Mod lfo to filter
            return GeneratorTypes.modLfoToFilterFc;
        } else if (
            source === DLSSources.modLfo &&
            destination === DLSDestinations.gain
        ) {
            // Mod lfo to volume
            return GeneratorTypes.modLfoToVolume;
        } else if (
            source === DLSSources.modEnv &&
            destination === DLSDestinations.filterCutoff
        ) {
            // Mod envelope to filter
            return GeneratorTypes.modEnvToFilterFc;
        } else if (
            source === DLSSources.modEnv &&
            destination === DLSDestinations.pitch
        ) {
            // Mod envelope to pitch
            return GeneratorTypes.modEnvToPitch;
        } else {
            return undefined;
        }
    }

    private failedConversion(msg: string) {
        SpessaLog.info(
            `%cFailed converting DLS articulator into SF2:\n %c${this.toString()}%c\n(${msg})`,
            ConsoleColors.warn,
            ConsoleColors.value,
            ConsoleColors.unrecognized
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
            case DLSDestinations.none: {
                return undefined;
            }
            case DLSDestinations.pan: {
                return GeneratorTypes.pan;
            }
            case DLSDestinations.gain: {
                return {
                    // DLS uses gain, SF uses attenuation
                    gen: GeneratorTypes.initialAttenuation,
                    newAmount: -amount
                };
            }
            case DLSDestinations.pitch: {
                return GeneratorTypes.fineTune;
            }
            case DLSDestinations.keyNum: {
                return GeneratorTypes.overridingRootKey;
            }

            // Vol env
            case DLSDestinations.volEnvDelay: {
                return GeneratorTypes.delayVolEnv;
            }
            case DLSDestinations.volEnvAttack: {
                return GeneratorTypes.attackVolEnv;
            }
            case DLSDestinations.volEnvHold: {
                return GeneratorTypes.holdVolEnv;
            }
            case DLSDestinations.volEnvDecay: {
                return GeneratorTypes.decayVolEnv;
            }
            case DLSDestinations.volEnvSustain: {
                return {
                    gen: GeneratorTypes.sustainVolEnv,
                    newAmount: 1000 - amount
                };
            }
            case DLSDestinations.volEnvRelease: {
                return GeneratorTypes.releaseVolEnv;
            }

            // Mod env
            case DLSDestinations.modEnvDelay: {
                return GeneratorTypes.delayModEnv;
            }
            case DLSDestinations.modEnvAttack: {
                return GeneratorTypes.attackModEnv;
            }
            case DLSDestinations.modEnvHold: {
                return GeneratorTypes.holdModEnv;
            }
            case DLSDestinations.modEnvDecay: {
                return GeneratorTypes.decayModEnv;
            }
            case DLSDestinations.modEnvSustain: {
                return {
                    gen: GeneratorTypes.sustainModEnv,
                    newAmount: 1000 - amount
                };
            }
            case DLSDestinations.modEnvRelease: {
                return GeneratorTypes.releaseModEnv;
            }

            case DLSDestinations.filterCutoff: {
                return GeneratorTypes.initialFilterFc;
            }
            case DLSDestinations.filterQ: {
                return GeneratorTypes.initialFilterQ;
            }
            case DLSDestinations.chorusSend: {
                return GeneratorTypes.chorusEffectsSend;
            }
            case DLSDestinations.reverbSend: {
                return GeneratorTypes.reverbEffectsSend;
            }

            // Lfo
            case DLSDestinations.modLfoFreq: {
                return GeneratorTypes.freqModLFO;
            }
            case DLSDestinations.modLfoDelay: {
                return GeneratorTypes.delayModLFO;
            }
            case DLSDestinations.vibLfoFreq: {
                return GeneratorTypes.freqVibLFO;
            }
            case DLSDestinations.vibLfoDelay: {
                return GeneratorTypes.delayVibLFO;
            }
        }
    }
}

import {
    type DLSDestination,
    DLSDestinations,
    type DLSSource,
    DLSSources,
    type DLSTransform,
    type GeneratorType,
    generatorTypes,
    modulatorCurveTypes,
    modulatorSources
} from "../../enums";
import {
    findRIFFListType,
    readRIFFChunk,
    type RIFFChunk,
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../../../utils/riff_chunk";
import {
    readLittleEndianIndexed,
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { DLSVerifier } from "./dls_verifier";
import type { BasicZone } from "../../basic_soundbank/basic_zone";
import {
    BasicInstrumentZone,
    Modulator,
    type ModulatorSourceIndex
} from "../../exports";
import { midiControllers } from "../../../midi/enums";
import { SpessaSynthWarn } from "../../../utils/loggin";
import {
    DLS_1_NO_VIBRATO_MOD,
    DLS_1_NO_VIBRATO_PRESSURE
} from "./default_dls_modulators";
import { bitMaskToBool } from "../../../utils/byte_functions/bit_mask";
import { ModulatorSource } from "../../basic_soundbank/modulator_source";

type KeyToEnv =
    | typeof generatorTypes.keyNumToModEnvDecay
    | typeof generatorTypes.keyNumToModEnvHold
    | typeof generatorTypes.keyNumToVolEnvDecay
    | typeof generatorTypes.keyNumToVolEnvHold;

class ConnectionSource {
    public readonly source: DLSSource;
    public readonly transform: DLSTransform;
    public readonly bipolar: boolean;
    public readonly invert: boolean;

    public constructor(
        source: DLSSource,
        transform: DLSTransform,
        bipolar: boolean,
        invert: boolean
    ) {
        this.source = source;
        this.transform = transform;
        this.bipolar = bipolar;
        this.invert = invert;
    }

    public get sourceName() {
        return (
            Object.keys(DLSSources).find(
                (k) => DLSSources[k as keyof typeof DLSSources] === this.source
            ) ?? this.source.toString()
        );
    }

    public toString() {
        return `${this.sourceName} ${this.transform} ${this.bipolar ? "bipolar" : "unipolar"} ${this.invert ? "inverted" : "normal"}`;
    }

    public toTransformFlag() {
        return (
            this.transform |
            ((this.bipolar ? 1 : 0) << 4) |
            ((this.invert ? 1 : 0) << 5)
        );
    }

    public toSFSource(): ModulatorSource | undefined {
        let sourceEnum: ModulatorSourceIndex | undefined = undefined;
        let isCC = false;
        switch (this.source) {
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
            return undefined;
        }
        return new ModulatorSource(
            sourceEnum,
            this.transform,
            isCC,
            this.bipolar,
            this.invert
        );
    }
}

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
        usSource: number,
        usControl: number,
        usDestination: number,
        usTransform: number,
        lScale: number
    ) {
        /*
         2.10 <art2-ck>, Level 2 Articulator Chunk
         usTransform
         Bits 0-3 specify one of 16 possible output transforms. Bits 4-7 specify one of 16 possible transforms to apply to
         the usControl input. Bits 8 and 9 specify whether the usControl input should be inverted and/or bipolar. Bits 10-13
         specify one of 16 possible transforms to apply to the usSource input. Bit 14 and 15 specify whether the usSource
         input should be inverted and/or bipolar.
        */
        // Decode usTransform
        this.transform = (usTransform & 0x0f) as DLSTransform;

        const controlTransform = ((usTransform >> 4) & 0x0f) as DLSTransform;
        const controlBipolar = bitMaskToBool(usTransform, 8);
        const controlInvert = bitMaskToBool(usTransform, 9);
        this.control = new ConnectionSource(
            usControl as DLSSource,
            controlTransform,
            controlBipolar,
            controlInvert
        );

        const sourceTransform = ((usTransform >> 10) & 0x0f) as DLSTransform;
        const sourceBipolar = bitMaskToBool(usTransform, 14);
        const sourceInvert = bitMaskToBool(usTransform, 15);

        this.source = new ConnectionSource(
            usSource as DLSSource,
            sourceTransform,
            sourceBipolar,
            sourceInvert
        );
        this.destination = usDestination as DLSDestination;
        this.scale = lScale;
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

    public get destinationName() {
        return (
            Object.keys(DLSDestinations).find(
                (k) =>
                    DLSDestinations[k as keyof typeof DLSDestinations] ===
                    this.destination
            ) ?? this.destination.toString()
        );
    }

    public static read(artData: IndexedByteArray) {
        return new ConnectionBlock(
            // UsSource
            readLittleEndianIndexed(artData, 2),
            // UsControl
            readLittleEndianIndexed(artData, 2),
            // UsDestination
            readLittleEndianIndexed(artData, 2),
            // UsTransform
            readLittleEndianIndexed(artData, 2),
            // LScale
            readLittleEndianIndexed(artData, 4) | 0
        );
    }

    public toString() {
        return (
            `Source: ${this.source.toString()},\n` +
            `Control: ${this.control.toString()},\n` +
            `Scale: ${this.scale} >> 16 = ${this.shortScale},\n` +
            `Destination: ${this.destinationName}\n`
        );
    }

    public write() {
        const out = new IndexedByteArray(12);
        writeWord(out, this.source.source);
        writeWord(out, this.control.source);
        writeWord(out, this.destination);
        const transformEnum =
            this.control.transform |
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
            default:
                return;

            case DLSDestinations.pan:
                zone.setGenerator(generatorTypes.pan, value);
                break;
            case DLSDestinations.gain:
                // Turn to centibels and apply emu correction
                zone.setGenerator(
                    generatorTypes.initialAttenuation,
                    (value * -10) / 0.4
                );
                break;
            case DLSDestinations.filterCutoff:
                zone.setGenerator(generatorTypes.initialFilterFc, value);
                break;
            case DLSDestinations.filterQ:
                zone.setGenerator(generatorTypes.initialFilterQ, value);
                break;

            // Mod LFO raw values it seems
            case DLSDestinations.modLfoFreq:
                zone.setGenerator(generatorTypes.freqModLFO, value);
                break;
            case DLSDestinations.modLfoDelay:
                zone.setGenerator(generatorTypes.delayModLFO, value);
                break;
            case DLSDestinations.vibLfoFreq:
                zone.setGenerator(generatorTypes.freqVibLFO, value);
                break;
            case DLSDestinations.vibLfoDelay:
                zone.setGenerator(generatorTypes.delayVibLFO, value);
                break;

            // Vol. env: all times are timecents like sf2
            case DLSDestinations.volEnvDelay:
                zone.setGenerator(generatorTypes.delayVolEnv, value);
                break;
            case DLSDestinations.volEnvAttack:
                zone.setGenerator(generatorTypes.attackVolEnv, value);
                break;
            case DLSDestinations.volEnvHold:
                zone.setGenerator(generatorTypes.holdVolEnv, value);
                break;
            case DLSDestinations.volEnvDecay:
                zone.setGenerator(generatorTypes.decayVolEnv, value);
                break;
            case DLSDestinations.volEnvRelease:
                zone.setGenerator(generatorTypes.releaseVolEnv, value);
                break;
            case DLSDestinations.volEnvSustain:
                // Gain seems to be (1000 - value) = sustain cB
                zone.setGenerator(generatorTypes.sustainVolEnv, 1000 - value);
                break;

            // Mod env
            case DLSDestinations.modEnvDelay:
                zone.setGenerator(generatorTypes.delayModEnv, value);
                break;
            case DLSDestinations.modEnvAttack:
                zone.setGenerator(generatorTypes.attackModEnv, value);
                break;
            case DLSDestinations.modEnvHold:
                zone.setGenerator(generatorTypes.holdModEnv, value);
                break;
            case DLSDestinations.modEnvDecay:
                zone.setGenerator(generatorTypes.decayModEnv, value);
                break;
            case DLSDestinations.modEnvRelease:
                zone.setGenerator(generatorTypes.releaseModEnv, value);
                break;
            case DLSDestinations.modEnvSustain:
                // DLS uses 0.1%, SF uses 0.1%
                zone.setGenerator(generatorTypes.sustainModEnv, 1000 - value);
                break;

            case DLSDestinations.reverbSend:
                zone.setGenerator(generatorTypes.reverbEffectsSend, value);
                break;
            case DLSDestinations.chorusSend:
                zone.setGenerator(generatorTypes.chorusEffectsSend, value);
                break;
            case DLSDestinations.pitch: {
                // Split it up
                const semi = Math.floor(value / 100);
                const cents = Math.floor(value - semi * 100);
                zone.setGenerator(generatorTypes.fineTune, cents);
                zone.setGenerator(generatorTypes.coarseTune, semi);
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
                SpessaSynthWarn(`Invalid control ${this.control.toString()}`);
                return;
            }
            primarySource = controlSF;
        } else {
            // Convert destination
            const convertedDestination = this.toSFDestination();
            if (!convertedDestination) {
                // Cannot be a valid modulator
                SpessaSynthWarn(`Invalid destination: ${this.destinationName}`);
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
                SpessaSynthWarn(`Invalid source: ${this.source.toString()}`);
                return;
            }
            primarySource = convertedPrimary;

            const convertedSecondary = this.control.toSFSource();
            if (!convertedSecondary) {
                SpessaSynthWarn(`Invalid control: ${this.control.toString()}`);
                return;
            }
            secondarySource = convertedSecondary;
        }
        // Output transform is ignored as it's not a thing in soundfont format
        // Unless the curve type of source is linear, then output is copied
        if (
            this.transform !== modulatorCurveTypes.linear &&
            primarySource.curveType === modulatorCurveTypes.linear
        ) {
            primarySource.curveType = this.transform;
        }

        // A fix:
        // Sometimes gain articulators specify positive curve and scale
        // This turns into positive curve and negative attenuation in SF, which doesn't override default modulators, resulting in silence.

        if (modulatorDestination === generatorTypes.initialAttenuation) {
            if (amount < 0 && !primarySource.isNegative) {
                amount *= -1;
                primarySource.isNegative = true;
            }
            // A corrupted rendition of gm.dls was found under
            // https://sembiance.com/fileFormatSamples/audio/downloadableSoundBank/
            // Which specifies a whopping -32,768 decibels of attenuation
            amount = Math.max(960, Math.min(0, amount));
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
            case DLSDestinations.none:
                return undefined;
            case DLSDestinations.pan:
                return generatorTypes.pan;
            case DLSDestinations.gain:
                return {
                    // DLS uses gain, SF uses attenuation
                    gen: generatorTypes.initialAttenuation,
                    newAmount: -amount
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
                    newAmount: 1000 - amount
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
}

export class DownloadableSoundsArticulation extends DLSVerifier {
    public readonly connectionBlocks = new Array<ConnectionBlock>();
    public mode: "dls1" | "dls2" = "dls2";
    public get length() {
        return this.connectionBlocks.length;
    }

    public static keyNumToPitchToSFZone(
        keyNumToPitch: number,
        zone: BasicInstrumentZone
    ) {
        // Scale tuning (key number to pitch)
        // https://github.com/FluidSynth/fluidsynth/pull/1626#issuecomment-3217693461
        const rootKey = zone.getGenerator(
            generatorTypes.overridingRootKey,
            zone.sample.originalKey
        );
        zone.setGenerator(generatorTypes.scaleTuning, keyNumToPitch / 128);
        const tuning = (keyNumToPitch / 128 - 100) * rootKey;
        zone.addTuning(tuning);
    }

    /**
     * Chunk list for the region/instrument (containing lar2 or lart)
     * @param chunks
     */
    public read(chunks: RIFFChunk[]) {
        const lart = findRIFFListType(chunks, "lart");
        const lar2 = findRIFFListType(chunks, "lar2");

        if (lart) {
            this.mode = "dls1";
            while (lart.data.currentIndex < lart.data.length) {
                const art1 = readRIFFChunk(lart.data);
                DownloadableSoundsArticulation.verifyHeader(art1, "art1");
                const artData = art1.data;
                // CbSize (ignore)
                readLittleEndianIndexed(artData, 4);
                const connectionsAmount = readLittleEndianIndexed(artData, 4);
                for (let i = 0; i < connectionsAmount; i++) {
                    this.connectionBlocks.push(ConnectionBlock.read(artData));
                }
            }
        } else if (lar2) {
            this.mode = "dls2";
            while (lar2.data.currentIndex < lar2.data.length) {
                const art2 = readRIFFChunk(lar2.data);
                DownloadableSoundsArticulation.verifyHeader(art2, "art2");
                const artData = art2.data;
                // CbSize (ignore)
                readLittleEndianIndexed(artData, 4);
                const connectionsAmount = readLittleEndianIndexed(artData, 4);
                for (let i = 0; i < connectionsAmount; i++) {
                    this.connectionBlocks.push(ConnectionBlock.read(artData));
                }
            }
        }
    }

    /**
     * Note: this writes "lar2", not just "art2"
     */
    public write() {
        const art2Data = new IndexedByteArray(8);
        writeDword(art2Data, 8); // CbSize
        writeDword(art2Data, this.connectionBlocks.length); // CConnectionBlocks

        const out = this.connectionBlocks.map((a) => a.write());
        const art2 = writeRIFFChunkParts(
            this.mode === "dls2" ? "art2" : "art1",
            [art2Data, ...out]
        );
        return writeRIFFChunkRaw(
            this.mode === "dls2" ? "lar2" : "lart",
            art2,
            false,
            true
        );
    }

    /**
     * Converts DLS articulation into an SF zone.
     * @param zone The zone to write to.
     * @returns for the global zone, this returns the value of the keyNumToPitch articulator.
     * This is done as it has to be applied based on the root key, which varies between zones.
     */
    public toSFZone(zone: BasicZone): undefined | number {
        const applyKeyToCorrection = (
            value: number,
            keyToGen: KeyToEnv,
            realGen: GeneratorType,
            dlsDestination: DLSDestination
        ) => {
            // According to viena and another strange (with modulators) rendition of gm.dls in sf2,
            // It shall be divided by -128
            // And a strange correction needs to be applied to the real (generator) value:
            // Real + (60 / 128) * scale
            // Where real means the actual generator (e.g. decayVolEnv
            // And scale means the keyNumToVolEnvDecay
            const keyToGenValue = value / -128;
            zone.setGenerator(keyToGen, keyToGenValue);
            // Airfont 340 fix
            if (keyToGenValue <= 120) {
                // Apply correction
                const correction = Math.round((60 / 128) * value);

                const realValueConnection = this.connectionBlocks.find(
                    (block) =>
                        block.isStaticParameter &&
                        block.destination === dlsDestination
                );
                if (realValueConnection) {
                    // Overwrite existing
                    zone.setGenerator(
                        realGen,
                        correction + realValueConnection.shortScale
                    );
                }
            }
        };

        for (const connection of this.connectionBlocks) {
            // SF2 uses 16-bit amounts, DLS uses 32-bit scale.
            const generatorAmount = connection.shortScale;

            const source = connection.source.source;
            const control = connection.control.source;
            const destination = connection.destination;

            // If source and control are both zero, it's a generator
            if (connection.isStaticParameter) {
                connection.toSFGenerator(zone);
                continue;
            }
            // A few special cases which are generators
            if (control === DLSSources.none) {
                // THe keyNum source
                // It usually requires a special treatment
                if (source === DLSSources.keyNum) {
                    if (
                        destination === DLSDestinations.pitch ||
                        destination === DLSDestinations.modEnvHold ||
                        destination === DLSDestinations.modEnvDecay ||
                        destination === DLSDestinations.volEnvHold ||
                        destination == DLSDestinations.volEnvDecay
                    ) {
                        // Skip, will be applied later
                        continue;
                    }
                } else {
                    const specialGen = connection.toCombinedSFDestination();
                    if (specialGen) {
                        zone.setGenerator(specialGen, generatorAmount);
                        continue;
                    }
                }
            }
            // Modulator, transform!
            connection.toSFModulator(zone);
        }

        // It seems that dls 1 does not have vibrato lfo, so we shall disable it
        if (this.mode === "dls1") {
            zone.addModulators(
                // Modulation to vibrato
                DLS_1_NO_VIBRATO_MOD.copy(),
                // Pressure to vibrato
                DLS_1_NO_VIBRATO_PRESSURE.copy()
            );
        }

        let keyNumToPitch: number | undefined = undefined;

        // Perform correction for the key to something generators
        for (const connection of this.connectionBlocks) {
            if (connection.source.source !== DLSSources.keyNum) {
                continue;
            }
            const generatorAmount = connection.shortScale;
            switch (connection.destination) {
                default:
                    continue;

                case DLSDestinations.volEnvHold:
                    // Key to vol env hold
                    applyKeyToCorrection(
                        generatorAmount,
                        generatorTypes.keyNumToVolEnvHold,
                        generatorTypes.holdVolEnv,
                        DLSDestinations.volEnvHold
                    );
                    break;

                case DLSDestinations.volEnvDecay:
                    applyKeyToCorrection(
                        generatorAmount,
                        generatorTypes.keyNumToVolEnvDecay,
                        generatorTypes.decayVolEnv,
                        DLSDestinations.volEnvDecay
                    );
                    break;

                case DLSDestinations.modEnvHold:
                    applyKeyToCorrection(
                        generatorAmount,
                        generatorTypes.keyNumToModEnvHold,
                        generatorTypes.holdModEnv,
                        DLSDestinations.modEnvHold
                    );
                    break;

                case DLSDestinations.modEnvDecay:
                    applyKeyToCorrection(
                        generatorAmount,
                        generatorTypes.keyNumToModEnvDecay,
                        generatorTypes.decayModEnv,
                        DLSDestinations.modEnvDecay
                    );
                    break;

                case DLSDestinations.pitch:
                    // Scale tuning (key number to pitch)
                    // https://github.com/FluidSynth/fluidsynth/pull/1626#issuecomment-3217693461
                    if (zone instanceof BasicInstrumentZone) {
                        DownloadableSoundsArticulation.keyNumToPitchToSFZone(
                            generatorAmount,
                            zone
                        );
                    } else {
                        // This is a global zone, return the scale tuning to apply to local zones
                        keyNumToPitch = generatorAmount;
                    }
                    break;
            }
        }
        return keyNumToPitch;
    }
}

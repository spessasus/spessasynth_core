import {
    type DLSDestination,
    DLSDestinations,
    type DLSSource,
    DLSSources,
    type DLSTransform,
    type GeneratorType,
    generatorTypes
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
import { Generator } from "../../basic_soundbank/generator";
import type { Modulator } from "../../basic_soundbank/modulator";
import { SpessaSynthWarn } from "../../../utils/loggin";

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

    public toTransformFlag() {
        return (
            this.transform |
            ((this.bipolar ? 1 : 0) << 4) |
            ((this.invert ? 1 : 0) << 5)
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
    public readonly transform: number;

    public constructor(
        usSource: number,
        usControl: number,
        usDestination: number,
        usTransform: number,
        lScale: number
    ) {
        /*
         2.10 <art2-ck>, Level 2 Articulator Chunk
         Bits 0-3 specify one of 16 possible output transforms. Bits 4-7 specify one of 16 possible transforms to apply to
         the usControl input. Bits 8 and 9 specify whether the usControl input should be inverted and/or bipolar. Bits 10-13
         specify one of 16 possible transforms to apply to the usSource input. Bit 14 and 15 specify whether the usSource
         input should be inverted and/or bipolar.
        */
        // Decode usTransform
        this.transform = (usTransform & 0x0f) as DLSTransform;

        const controlTransform = ((usTransform >> 4) & 0x0f) as DLSTransform;
        const controlBipolar = !!(usTransform >> 8);
        const controlInvert = !!(usTransform >> 9);
        this.control = new ConnectionSource(
            usControl as DLSSource,
            controlTransform,
            controlBipolar,
            controlInvert
        );

        const sourceTransform = ((usTransform >> 10) & 0x0f) as DLSTransform;
        const sourceBipolar = !!(usTransform >> 14);
        const sourceInvert = !!(usTransform >> 15);

        this.source = new ConnectionSource(
            usSource as DLSSource,
            sourceTransform,
            sourceBipolar,
            sourceInvert
        );
        this.destination = usDestination as DLSDestination;
        this.scale = lScale;
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

    public appendToSFParamList(
        generators: Generator[],
        modulators: Modulator[]
    ) {
        // SF2 uses 16-bit amounts, DLS uses 32-bit scale.
        const value = this.scale >> 16;

        const source = this.source.source;
        const control = this.control.source;
        const destination = this.destination;

        // If source and control are both zero, it's a generator
        if (source === DLSSources.none && control === DLSSources.none) {
            const g = this.toSF2Generator();
            if (!g) {
                SpessaSynthWarn(
                    `Failed converting to SF2 Generator! Destination: ${this.destination}`
                );
                return;
            }
            generators.push(...g);
        }

        const applyKeyToCorrection = (
            value: number,
            keyToGen: GeneratorType,
            realGen: GeneratorType
        ) => {
            // According to viena and another strange (with modulators) rendition of gm.dls in sf2,
            // It shall be divided by -128
            // And a strange correction needs to be applied to the real (generator) value:
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
            // Mod LFO to pitch
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
                // Mod LFO to volume
                generators.push(
                    new Generator(generatorTypes.modLfoToVolume, value)
                );
            } else if (
                source === DLSSources.modLfo &&
                destination === DLSDestinations.filterCutoff
            ) {
                // Mod LFO to filter
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
                // https://github.com/FluidSynth/fluidsynth/pull/1626#issuecomment-3217693461
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
            }
        }
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

    private toSF2Generator(): Generator[] | undefined {
        const destination = this.destination;
        // SF2 uses 16-bit amounts, DLS uses 32-bit scale.
        const value = this.scale >> 16;
        let generator: Generator;
        const generators = new Array<Generator>();
        switch (destination) {
            default:
                return undefined;

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
                generator = new Generator(generatorTypes.initialFilterQ, value);
                break;

            // Mod LFO raw values it seems
            case DLSDestinations.modLfoFreq:
                generator = new Generator(generatorTypes.freqModLFO, value);
                break;
            case DLSDestinations.modLfoDelay:
                generator = new Generator(generatorTypes.delayModLFO, value);
                break;
            case DLSDestinations.vibLfoFreq:
                generator = new Generator(generatorTypes.freqVibLFO, value);
                break;
            case DLSDestinations.vibLfoDelay:
                generator = new Generator(generatorTypes.delayVibLFO, value);
                break;

            // Vol. env: all times are timecents like sf2
            case DLSDestinations.volEnvDelay:
                generator = new Generator(generatorTypes.delayVolEnv, value);
                break;
            case DLSDestinations.volEnvAttack:
                generator = new Generator(generatorTypes.attackVolEnv, value);
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
                generator = new Generator(generatorTypes.releaseVolEnv, value);
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
                generator = new Generator(generatorTypes.delayModEnv, value);
                break;
            case DLSDestinations.modEnvAttack:
                generator = new Generator(generatorTypes.attackModEnv, value);
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
                generator = new Generator(generatorTypes.releaseModEnv, value);
                break;
            case DLSDestinations.modEnvSustain: {
                // DLS uses 1%, soundfont uses 0.1%
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
                generators.push(new Generator(generatorTypes.coarseTune, semi));
                break;
            }
        }
        generators.push(generator);
        return generators;
    }
}

export class DownloadableSoundsArticulation extends DLSVerifier {
    public readonly connectionBlocks = new Array<ConnectionBlock>();
    public mode: "dls1" | "dls2" = "dls2";
    public get length() {
        return this.connectionBlocks.length;
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
}

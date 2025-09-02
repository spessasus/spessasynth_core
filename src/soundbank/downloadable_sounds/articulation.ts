import {
    type DLSDestination,
    DLSDestinations,
    DLSSources,
    type GeneratorType,
    generatorTypes
} from "../enums";
import {
    findRIFFListType,
    readRIFFChunk,
    type RIFFChunk,
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../../utils/riff_chunk";
import {
    readLittleEndianIndexed,
    writeDword
} from "../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../utils/indexed_array";
import { DLSVerifier } from "./dls_verifier";
import { BasicZone } from "../basic_soundbank/basic_zone";
import { BasicInstrumentZone, Modulator } from "../exports";
import { SpessaSynthWarn } from "../../utils/loggin";
import {
    DLS_1_NO_VIBRATO_MOD,
    DLS_1_NO_VIBRATO_PRESSURE
} from "./default_dls_modulators";
import { ConnectionBlock } from "./connection_block";

type KeyToEnv =
    | typeof generatorTypes.keyNumToModEnvDecay
    | typeof generatorTypes.keyNumToModEnvHold
    | typeof generatorTypes.keyNumToVolEnvDecay
    | typeof generatorTypes.keyNumToVolEnvHold;

export class DownloadableSoundsArticulation extends DLSVerifier {
    public readonly connectionBlocks = new Array<ConnectionBlock>();
    public mode: "dls1" | "dls2" = "dls2";
    public get length() {
        return this.connectionBlocks.length;
    }

    public copyFrom(inputArticulation: DownloadableSoundsArticulation) {
        this.mode = inputArticulation.mode;
        inputArticulation.connectionBlocks.forEach((block) => {
            this.connectionBlocks.push(ConnectionBlock.copyFrom(block));
        });
    }

    public fromSFZone(z: BasicInstrumentZone) {
        this.mode = "dls2";

        // Copy to avoid changing the input zone
        const zone = new BasicZone();
        zone.copyFrom(z);

        // Read_articulation.ts:
        // According to viena and another strange (with modulators) rendition of gm.dls in sf2,
        // It shall be divided by -128,
        // And a strange correction needs to be applied to the real value:
        // Real + (60 / 128) * scale
        // We do this here.
        for (const relativeGenerator of zone.generators) {
            let absoluteCounterpart: GeneratorType | undefined = undefined;
            switch (relativeGenerator.generatorType) {
                default:
                    continue;

                case generatorTypes.keyNumToVolEnvDecay:
                    absoluteCounterpart = generatorTypes.decayVolEnv;
                    break;
                case generatorTypes.keyNumToVolEnvHold:
                    absoluteCounterpart = generatorTypes.holdVolEnv;
                    break;
                case generatorTypes.keyNumToModEnvDecay:
                    absoluteCounterpart = generatorTypes.decayModEnv;
                    break;
                case generatorTypes.keyNumToModEnvHold:
                    absoluteCounterpart = generatorTypes.holdModEnv;
            }
            const absoluteValue = zone.getGenerator(
                absoluteCounterpart,
                undefined
            );
            const dlsRelative = relativeGenerator.generatorValue * -128;

            if (absoluteValue === undefined) {
                // There's no absolute generator here.
                continue;
            }
            const subtraction = (60 / 128) * dlsRelative;
            const newAbsolute = absoluteValue - subtraction;
            zone.setGenerator(
                relativeGenerator.generatorType,
                dlsRelative,
                false
            );
            zone.setGenerator(absoluteCounterpart, newAbsolute, false);
        }
        for (const generator of zone.generators) {
            ConnectionBlock.fromSFGenerator(generator, this);
        }
        for (const modulator of zone.modulators) {
            ConnectionBlock.fromSFModulator(modulator, this);
        }
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
                const cbSize = readLittleEndianIndexed(artData, 4);
                if (cbSize !== 8) {
                    SpessaSynthWarn(
                        `CbSize in articulation mismatch. Expected 8, got ${cbSize}`
                    );
                }
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
                const cbSize = readLittleEndianIndexed(artData, 4);
                if (cbSize !== 8) {
                    SpessaSynthWarn(
                        `CbSize in articulation mismatch. Expected 8, got ${cbSize}`
                    );
                }
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
     */
    public toSFZone(zone: BasicZone) {
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
            const amount = connection.shortScale;

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
                // The keyNum source
                // It usually requires a special treatment
                if (source === DLSSources.keyNum) {
                    // Scale tuning
                    if (destination === DLSDestinations.pitch) {
                        zone.setGenerator(
                            generatorTypes.scaleTuning,
                            amount / 128
                        );
                        continue;
                    }
                    if (
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
                        zone.setGenerator(specialGen, amount);
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
                Modulator.copyFrom(DLS_1_NO_VIBRATO_MOD),
                Modulator.copyFrom(DLS_1_NO_VIBRATO_PRESSURE)
                // Pressure to vibrato
            );
        }

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
            }
        }
    }
}

import { type GeneratorType, GeneratorTypes } from "../enums";
import { RIFFChunk } from "../../utils/riff_chunk";
import {
    readLittleEndianIndexed,
    writeDword
} from "../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../utils/indexed_array";
import { DLSVerifier } from "./dls_verifier";
import { BasicZone } from "../basic_soundbank/basic_zone";
import { BasicInstrumentZone } from "../exports";
import { ConnectionBlock } from "./connection_block";
import { type DLSDestination, DLSDestinations, DLSSources } from "./enums";
import { SpessaSynthLog } from "../../utils/loggin";

type KeyToEnv =
    | typeof GeneratorTypes.keyNumToModEnvDecay
    | typeof GeneratorTypes.keyNumToModEnvHold
    | typeof GeneratorTypes.keyNumToVolEnvDecay
    | typeof GeneratorTypes.keyNumToVolEnvHold;

export class DownloadableSoundsArticulation extends DLSVerifier {
    public readonly connectionBlocks = new Array<ConnectionBlock>();
    public mode: "dls1" | "dls2" = "dls2";
    public get length() {
        return this.connectionBlocks.length;
    }

    public copyFrom(inputArticulation: DownloadableSoundsArticulation) {
        this.mode = inputArticulation.mode;
        for (const block of inputArticulation.connectionBlocks) {
            this.connectionBlocks.push(ConnectionBlock.copyFrom(block));
        }
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
            let absoluteCounterpart: GeneratorType | undefined;
            switch (relativeGenerator.type) {
                default: {
                    continue;
                }

                case GeneratorTypes.keyNumToVolEnvDecay: {
                    absoluteCounterpart = GeneratorTypes.decayVolEnv;
                    break;
                }

                case GeneratorTypes.keyNumToVolEnvHold: {
                    absoluteCounterpart = GeneratorTypes.holdVolEnv;
                    break;
                }
                case GeneratorTypes.keyNumToModEnvDecay: {
                    absoluteCounterpart = GeneratorTypes.decayModEnv;
                    break;
                }
                case GeneratorTypes.keyNumToModEnvHold: {
                    absoluteCounterpart = GeneratorTypes.holdModEnv;
                }
            }
            const absoluteValue = zone.getGenerator(
                absoluteCounterpart,
                undefined
            );
            const dlsRelative = relativeGenerator.value * -128;

            if (absoluteValue === undefined) {
                // There's no absolute generator here.
                continue;
            }
            const subtraction = (60 / 128) * dlsRelative;
            const newAbsolute = absoluteValue - subtraction;
            zone.setGenerator(relativeGenerator.type, dlsRelative, false);
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
        const lart = RIFFChunk.findListType(chunks, "lart");
        const lar2 = RIFFChunk.findListType(chunks, "lar2");

        if (lart) {
            this.mode = "dls1";
            while (lart.data.currentIndex < lart.data.length) {
                const chunk = RIFFChunk.read(lart.data);
                // Note:
                // DLS Specification says that lar2 should only have art2, but a DirectMusic Producer example
                // "FarmGame.dls" has 'art1' in there.
                // Hence, we allow art2 in lart and art1 in lar2.
                if (chunk.header !== "art1" && chunk.header !== "art2")
                    // There may be a cdl chunk, testcase romania_main.dls
                    continue;
                const artData = chunk.data;
                const cbSize = readLittleEndianIndexed(artData, 4);
                if (cbSize !== 8) {
                    SpessaSynthLog.warn(
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
                const chunk = RIFFChunk.read(lar2.data);
                // Note:
                // DLS Specification says that lar2 should only have art2, but a DirectMusic Producer example
                // "FarmGame.dls" has 'art1' in there.
                // Hence, we allow art2 in lart and art1 in lar2.
                if (chunk.header !== "art1" && chunk.header !== "art2")
                    // There may be a cdl chunk, testcase romania_main.dls
                    continue;
                const artData = chunk.data;
                const cbSize = readLittleEndianIndexed(artData, 4);
                if (cbSize !== 8) {
                    SpessaSynthLog.warn(
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
        const art2 = RIFFChunk.getParts(
            this.mode === "dls2" ? "art2" : "art1",
            [art2Data, ...out]
        );
        return RIFFChunk.getParts(
            this.mode === "dls2" ? "lar2" : "lart",
            art2,
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
                            GeneratorTypes.scaleTuning,
                            amount / 128
                        );
                        continue;
                    }
                    if (
                        destination === DLSDestinations.modEnvHold ||
                        destination === DLSDestinations.modEnvDecay ||
                        destination === DLSDestinations.volEnvHold ||
                        destination === DLSDestinations.volEnvDecay
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

        // Perform correction for the key to something generators
        for (const connection of this.connectionBlocks) {
            if (connection.source.source !== DLSSources.keyNum) {
                continue;
            }
            const generatorAmount = connection.shortScale;
            switch (connection.destination) {
                default:

                case DLSDestinations.volEnvHold: {
                    // Key to vol env hold
                    applyKeyToCorrection(
                        generatorAmount,
                        GeneratorTypes.keyNumToVolEnvHold,
                        GeneratorTypes.holdVolEnv,
                        DLSDestinations.volEnvHold
                    );
                    break;
                }

                case DLSDestinations.volEnvDecay: {
                    applyKeyToCorrection(
                        generatorAmount,
                        GeneratorTypes.keyNumToVolEnvDecay,
                        GeneratorTypes.decayVolEnv,
                        DLSDestinations.volEnvDecay
                    );
                    break;
                }

                case DLSDestinations.modEnvHold: {
                    applyKeyToCorrection(
                        generatorAmount,
                        GeneratorTypes.keyNumToModEnvHold,
                        GeneratorTypes.holdModEnv,
                        DLSDestinations.modEnvHold
                    );
                    break;
                }

                case DLSDestinations.modEnvDecay: {
                    applyKeyToCorrection(
                        generatorAmount,
                        GeneratorTypes.keyNumToModEnvDecay,
                        GeneratorTypes.decayModEnv,
                        DLSDestinations.modEnvDecay
                    );
                    break;
                }
            }
        }

        // Perform DLS1 corrections
        if (this.mode === "dls1") {
            // DLS1 only has modulation LFO.
            // Copy the parameters to vib LFO and convert all pitch values to vibrato LFO (including mod wheel modulator)
            // This ensures that it stays in sync when using things like GS controller matrix

            // Copy over delay and rate to vibrato LFO
            zone.setGenerator(
                GeneratorTypes.delayVibLFO,
                zone.getGenerator(GeneratorTypes.delayModLFO, null)
            );
            zone.setGenerator(
                GeneratorTypes.freqVibLFO,
                zone.getGenerator(GeneratorTypes.freqModLFO, null)
            );

            // Convert pitch excursion to vibrato LFO
            zone.setGenerator(
                GeneratorTypes.vibLfoToPitch,
                zone.getGenerator(GeneratorTypes.modLfoToPitch, null)
            );
            zone.setGenerator(GeneratorTypes.modLfoToPitch, null);

            for (const mod of zone.modulators) {
                if (mod.destination === GeneratorTypes.modLfoToPitch)
                    mod.destination = GeneratorTypes.vibLfoToPitch;
            }
        }
    }
}

import { DownloadableSoundsArticulation } from "./articulation";
import { DownloadableSoundsRegion } from "./region";
import { type MIDIPatchNamed } from "../basic_soundbank/midi_patch";
import {
    findRIFFListType,
    readRIFFChunk,
    type RIFFChunk,
    writeRIFFChunkParts,
    writeRIFFChunkRaw
} from "../../utils/riff_chunk";
import { getStringBytes, readBinaryStringIndexed } from "../../utils/byte_functions/string";
import { SpessaSynthGroup, SpessaSynthGroupCollapsed, SpessaSynthGroupEnd } from "../../utils/loggin";
import { readLittleEndianIndexed, writeDword } from "../../utils/byte_functions/little_endian";
import { consoleColors } from "../../utils/other";
import { DLSVerifier } from "./dls_verifier";
import type { DLSChunkFourCC } from "../types";
import type { DownloadableSoundsSample } from "./sample";
import { IndexedByteArray } from "../../utils/indexed_array";
import { BasicPreset } from "../basic_soundbank/basic_preset";
import { BasicInstrument } from "../basic_soundbank/basic_instrument";
import { BasicSample, BasicSoundBank, generatorLimits, generatorTypes } from "../exports";
import { DEFAULT_DLS_CHORUS, DEFAULT_DLS_REVERB } from "./default_dls_modulators";

/**
 * Represents a proper DLS instrument, with regions and articulation.
 * DLS
 */
export class DownloadableSoundsInstrument
    extends DLSVerifier
    implements MIDIPatchNamed
{
    public readonly articulation = new DownloadableSoundsArticulation();
    public readonly regions = new Array<DownloadableSoundsRegion>();
    public name = "Unnamed";
    public bankLSB = 0;
    public bankMSB = 0;
    public isGMGSDrum = false;
    public program = 0;

    public static read(samples: DownloadableSoundsSample[], chunk: RIFFChunk) {
        const chunks = this.verifyAndReadList(chunk, "ins ");

        const instrumentHeader = chunks.find((c) => c.header === "insh");
        if (!instrumentHeader) {
            SpessaSynthGroupEnd();
            throw new Error("No instrument header!");
        }

        // Read the instrument name in INFO
        let instrumentName = ``;
        const infoChunk = findRIFFListType(chunks, "INFO");
        if (infoChunk) {
            let info = readRIFFChunk(infoChunk.data);
            while (info.header !== "INAM") {
                info = readRIFFChunk(infoChunk.data);
            }
            instrumentName = readBinaryStringIndexed(
                info.data,
                info.data.length
            ).trim();
        }
        if (instrumentName.length < 1) {
            instrumentName = `Unnamed Instrument`;
        }
        const instrument = new DownloadableSoundsInstrument();
        instrument.name = instrumentName;
        // Read instrument header
        const regions = readLittleEndianIndexed(instrumentHeader.data, 4);
        /**
         *
         * Specifies the MIDI bank location. Bits 0-6 are defined as MIDI CC32 and bits 8-14 are
         * defined as MIDI CC0. Bits 7 and 15-30 are reserved and should be written to zero. If the
         * F_INSTRUMENT_DRUMS flag (Bit 31) is equal to 1 then the instrument is a drum
         * instrument; if equal to 0 then the instrument is a melodic instrument.
         */
        const ulBank = readLittleEndianIndexed(instrumentHeader.data, 4);
        /**
         * Specifies the MIDI Program Change (PC) value. Bits 0-6 are defined as PC value and bits 7-
         * 31 are reserved and should be written to zero.
         */
        const ulInstrument = readLittleEndianIndexed(instrumentHeader.data, 4);

        instrument.program = ulInstrument & 127;
        instrument.bankMSB = (ulBank >>> 8) & 127;
        instrument.bankLSB = ulBank & 127;
        instrument.isGMGSDrum = ulBank >>> 31 > 0;

        SpessaSynthGroupCollapsed(
            `%cParsing %c"${instrumentName}"%c...`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info
        );

        // List of regions
        const regionListChunk = findRIFFListType(chunks, "lrgn");
        if (!regionListChunk) {
            SpessaSynthGroupEnd();
            throw new Error("No region list!");
        }

        instrument.articulation.read(chunks);

        // Read regions
        for (let i = 0; i < regions; i++) {
            const chunk = readRIFFChunk(regionListChunk.data);
            this.verifyHeader(chunk, "LIST");
            const type = readBinaryStringIndexed(
                chunk.data,
                4
            ) as DLSChunkFourCC;
            if (type !== "rgn " && type !== "rgn2") {
                SpessaSynthGroupEnd();
                this.parsingError(
                    `Invalid DLS region! Expected "rgn " or "rgn2" got "${type}"`
                );
            }

            const region = DownloadableSoundsRegion.read(samples, chunk);
            if (region) {
                instrument.regions.push(region);
            }
        }
        SpessaSynthGroupEnd();
        return instrument;
    }

    public static fromSFPreset(preset: BasicPreset, samples: BasicSample[]) {
        const instrument = new DownloadableSoundsInstrument();
        instrument.name = preset.name;
        instrument.bankLSB = preset.bankLSB;
        instrument.bankMSB = preset.bankMSB;
        instrument.program = preset.program;
        instrument.isGMGSDrum = preset.isGMGSDrum;
        SpessaSynthGroup(
            `%cConverting %c${preset.toString()}%c to DLS...`,
            consoleColors.info,
            consoleColors.value,
            consoleColors.info
        );

        // Combine preset and instrument zones into a single instrument zone (region) list
        const inst = preset.toFlattenedInstrument();

        inst.zones.forEach((z) => {
            instrument.regions.push(
                DownloadableSoundsRegion.fromSFZone(z, samples)
            );
        });
        SpessaSynthGroupEnd();
        return instrument;
    }

    public write() {
        SpessaSynthGroupCollapsed(
            `%cWriting %c${this.name}%c...`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info
        );
        const chunks = [this.writeHeader()];

        const regionChunks = this.regions.map((r) => r.write());
        chunks.push(writeRIFFChunkParts("lrgn", regionChunks, true));

        // This will mostly be false as SF2 -> DLS can't have both global and local regions,
        // So it only has global, hence this check.
        if (this.articulation.length > 0) {
            chunks.push(this.articulation.write());
        }

        // Write the name
        const inam = writeRIFFChunkRaw("INAM", getStringBytes(this.name, true));
        chunks.push(writeRIFFChunkRaw("INFO", inam, false, true));
        SpessaSynthGroupEnd();
        return writeRIFFChunkParts("ins ", chunks, true);
    }

    /**
     * Performs the full DLS to SF2 instrument conversion.
     */
    public toSFPreset(soundBank: BasicSoundBank) {
        const preset = new BasicPreset(soundBank);
        preset.name = this.name;
        preset.bankMSB = this.bankMSB;
        preset.bankLSB = this.bankLSB;
        preset.isGMGSDrum = this.isGMGSDrum;
        preset.program = this.program;

        const instrument = new BasicInstrument();
        instrument.name = this.name;
        preset.createZone(instrument);

        // Global articulation
        this.articulation.toSFZone(instrument.globalZone);

        this.regions.forEach((region) =>
            region.toSFZone(instrument, soundBank.samples)
        );

        // Globalize!
        instrument.globalize();

        // Override reverb and chorus with 1000 instead of 200
        // Reverb
        if (
            instrument.globalZone.modulators.find(
                (m) => m.destination === generatorTypes.reverbEffectsSend
            ) === undefined
        ) {
            instrument.globalZone.addModulators(DEFAULT_DLS_REVERB.copy());
        }
        // Chorus
        if (
            instrument.globalZone.modulators.find(
                (m) => m.destination === generatorTypes.chorusEffectsSend
            ) === undefined
        ) {
            instrument.globalZone.addModulators(DEFAULT_DLS_CHORUS.copy());
        }

        // Remove generators with default values
        instrument.globalZone.generators =
            instrument.globalZone.generators.filter(
                (g) => g.generatorValue !== generatorLimits[g.generatorType].def
            );

        soundBank.addPresets(preset);
        soundBank.addInstruments(instrument);
    }

    private writeHeader() {
        // Insh: instrument header
        const inshData = new IndexedByteArray(12);
        writeDword(inshData, this.regions.length); // CRegions
        // Bank MSB is in bits 8-14
        let ulBank = ((this.bankMSB & 127) << 8) | (this.bankLSB & 127);
        // Bit 32 means drums
        if (this.isGMGSDrum) {
            ulBank |= 1 << 31;
        }
        writeDword(inshData, ulBank); // UlBank
        writeDword(inshData, this.program & 127); // UlInstrument

        return writeRIFFChunkRaw("insh", inshData);
    }
}

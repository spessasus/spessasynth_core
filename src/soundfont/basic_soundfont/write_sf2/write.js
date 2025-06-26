import { IndexedByteArray } from "../../../utils/indexed_array.js";
import { writeRIFFChunkParts, writeRIFFChunkRaw } from "../riff_chunk.js";
import { getStringBytes } from "../../../utils/byte_functions/string.js";
import { consoleColors } from "../../../utils/other.js";
import { getIGEN } from "./igen.js";
import { getSDTA } from "./sdta.js";
import { getSHDR } from "./shdr.js";
import { getIMOD } from "./imod.js";
import { getIBAG } from "./ibag.js";
import { getINST } from "./inst.js";
import { getPGEN } from "./pgen.js";
import { getPMOD } from "./pmod.js";
import { getPBAG } from "./pbag.js";
import { getPHDR } from "./phdr.js";
import { writeLittleEndian, writeWord } from "../../../utils/byte_functions/little_endian.js";
import { SpessaSynthGroupCollapsed, SpessaSynthGroupEnd, SpessaSynthInfo } from "../../../utils/loggin.js";
import { MOD_BYTE_SIZE } from "../modulator.js";
import { fillWithDefaults } from "../../../utils/fill_with_defaults.js";

/**
 * @typedef {function} ProgressFunction
 * @param {string} sampleName - the written sample name.
 * @param {number} sampleIndex - the sample's index.
 * @param {number} sampleCount - the total sample count for progress displaying.
 */

/**
 * @typedef {Object} SoundFont2WriteOptions
 * @property {boolean|undefined} compress - if the soundfont should be compressed with a given function.
 * @property {SampleEncodingFunction|undefined} compressionFunction -
 * the encode vorbis function. It can be undefined if not compressed.
 * @property {ProgressFunction|undefined} progressFunction - a function to show progress for writing large banks. It can be undefined.
 * @property {boolean|undefined} writeDefaultModulators - if the DMOD chunk should be written.
 * Recommended.
 * @property {boolean|undefined} writeExtendedLimits - if the xdta chunk should be written to allow virtually infinite parameters.
 * Recommended.
 * @property {boolean|undefined} decompress - if an sf3 bank should be decompressed back to sf2. Not recommended.
 */


/**
 * @typedef {Object} ReturnedExtendedSf2Chunks
 * @property {IndexedByteArray} pdta - the pdta part of the chunk
 * @property {IndexedByteArray} xdta - the xdta (https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md) part of the chunk
 * @property {number} highestIndex - the highest index written (0 if not applicable). Used for determining whether the xdta chunk is necessary.
 */

/**
 * @type {SoundFont2WriteOptions}
 */
const DEFAULT_WRITE_OPTIONS = {
    compress: false,
    compressionQuality: 0.5,
    compressionFunction: undefined,
    progressFunction: undefined,
    writeDefaultModulators: true,
    writeExtendedLimits: true,
    decompress: false
};

/**
 * Write the soundfont as an .sf2 file
 * @this {BasicSoundBank}
 * @param {SoundFont2WriteOptions} options
 * @returns {Uint8Array}
 */
export async function write(options = DEFAULT_WRITE_OPTIONS)
{
    options = fillWithDefaults(options, DEFAULT_WRITE_OPTIONS);
    if (options?.compress)
    {
        if (typeof options?.compressionFunction !== "function")
        {
            throw new Error("No compression function supplied but compression enabled.");
        }
        if (options?.decompress)
        {
            throw new Error("Decompressed and compressed at the same time.");
        }
    }
    SpessaSynthGroupCollapsed(
        "%cSaving soundfont...",
        consoleColors.info
    );
    SpessaSynthInfo(
        `%cCompression: %c${options?.compress || "false"}%c quality: %c${options?.compressionQuality || "none"}`,
        consoleColors.info,
        consoleColors.recognized,
        consoleColors.info,
        consoleColors.recognized
    );
    SpessaSynthInfo(
        "%cWriting INFO...",
        consoleColors.info
    );
    /**
     * Write INFO
     * @type {IndexedByteArray[]}
     */
    const infoArrays = [];
    this.soundFontInfo["ISFT"] = "SpessaSynth"; // ( ͡° ͜ʖ ͡°)
    if (options?.compress || this.samples.some(s => s.isCompressed))
    {
        this.soundFontInfo["ifil"] = "3.0"; // set version to 3
    }
    if (options?.decompress)
    {
        this.soundFontInfo["ifil"] = "2.4"; // set version to 2.04
    }
    
    if (options?.writeDefaultModulators)
    {
        // trigger the DMOD write
        this.soundFontInfo["DMOD"] = `${this.defaultModulators.length} Modulators`;
        this.customDefaultModulators = true;
    }
    else
    {
        delete this.soundFontInfo["DMOD"];
    }
    
    for (const [type, data] of Object.entries(this.soundFontInfo))
    {
        if (type === "ifil" || type === "iver")
        {
            const major = parseInt(data.split(".")[0]);
            const minor = parseInt(data.split(".")[1]);
            const ckdata = new IndexedByteArray(4);
            writeWord(ckdata, major);
            writeWord(ckdata, minor);
            infoArrays.push(writeRIFFChunkRaw(type, ckdata));
        }
        else if (type === "DMOD")
        {
            const mods = this.defaultModulators;
            SpessaSynthInfo(
                `%cWriting %c${mods.length}%c default modulators...`,
                consoleColors.info,
                consoleColors.recognized,
                consoleColors.info
            );
            let dmodsize = MOD_BYTE_SIZE + mods.length * MOD_BYTE_SIZE;
            const dmoddata = new IndexedByteArray(dmodsize);
            for (const mod of mods)
            {
                writeWord(dmoddata, mod.getSourceEnum());
                writeWord(dmoddata, mod.modulatorDestination);
                writeWord(dmoddata, mod.transformAmount);
                writeWord(dmoddata, mod.getSecSrcEnum());
                writeWord(dmoddata, mod.transformType);
            }
            
            // terminal modulator, is zero
            writeLittleEndian(dmoddata, 0, MOD_BYTE_SIZE);
            
            infoArrays.push(writeRIFFChunkRaw(type, dmoddata));
        }
        else
        {
            infoArrays.push(writeRIFFChunkRaw(
                type,
                getStringBytes(data, true, true) // pad with zero and ensure even length
            ));
        }
    }
    
    SpessaSynthInfo(
        "%cWriting SDTA...",
        consoleColors.info
    );
    // write sdta
    const smplStartOffsets = [];
    const smplEndOffsets = [];
    const sdtaChunk = await getSDTA.call(
        this,
        smplStartOffsets,
        smplEndOffsets,
        options.compress,
        options.decompress,
        options?.compressionFunction,
        options?.progressFunction
    );
    
    SpessaSynthInfo(
        "%cWriting PDTA...",
        consoleColors.info
    );
    // write pdta
    // go in reverse so the indexes are correct
    // instruments
    SpessaSynthInfo(
        "%cWriting SHDR...",
        consoleColors.info
    );
    const shdrChunk = getSHDR.call(this, smplStartOffsets, smplEndOffsets);
    SpessaSynthInfo(
        "%cWriting IGEN...",
        consoleColors.info
    );
    const igenChunk = getIGEN.call(this);
    SpessaSynthInfo(
        "%cWriting IMOD...",
        consoleColors.info
    );
    const imodChunk = getIMOD.call(this);
    SpessaSynthInfo(
        "%cWriting IBAG...",
        consoleColors.info
    );
    const ibagChunk = getIBAG.call(this);
    SpessaSynthInfo(
        "%cWriting INST...",
        consoleColors.info
    );
    const instChunk = getINST.call(this);
    SpessaSynthInfo(
        "%cWriting PGEN...",
        consoleColors.info
    );
    // presets
    const pgenChunk = getPGEN.call(this);
    SpessaSynthInfo(
        "%cWriting PMOD...",
        consoleColors.info
    );
    const pmodChunk = getPMOD.call(this);
    SpessaSynthInfo(
        "%cWriting PBAG...",
        consoleColors.info
    );
    const pbagChunk = getPBAG.call(this);
    SpessaSynthInfo(
        "%cWriting PHDR...",
        consoleColors.info
    );
    const phdrChunk = getPHDR.call(this);
    /**
     * @type {ReturnedExtendedSf2Chunks[]}
     */
    const chunks = [phdrChunk, pbagChunk, pmodChunk, pgenChunk, instChunk, ibagChunk, imodChunk, igenChunk, shdrChunk];
    // combine in the sfspec order
    const pdtaChunk = writeRIFFChunkParts(
        "pdta",
        chunks.map(c => c.pdta),
        true
    );
    const maxIndex = Math.max(
        ...chunks.map(c => c.highestIndex)
    );
    
    const writeXdta = options.writeExtendedLimits && (
        maxIndex > 0xFFFF
        || this.presets.some(p => p.presetName.length > 20)
        || this.instruments.some(i => i.instrumentName.length > 20)
        || this.samples.some(s => s.sampleName.length > 20)
    );
    
    if (writeXdta)
    {
        SpessaSynthInfo(
            `%cWriting the xdta chunk! Max index: %c${maxIndex}`,
            consoleColors.info,
            consoleColors.value
        );
        // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
        const xpdtaChunk = writeRIFFChunkParts("xdta", chunks.map(c => c.xdta), true);
        infoArrays.push(xpdtaChunk);
    }
    
    const infoChunk = writeRIFFChunkParts("INFO", infoArrays, true);
    SpessaSynthInfo(
        "%cWriting the output file...",
        consoleColors.info
    );
    // finally, combine everything
    const main = writeRIFFChunkParts(
        "RIFF",
        [getStringBytes("sfbk"), infoChunk, sdtaChunk, pdtaChunk]
    );
    SpessaSynthInfo(
        `%cSaved succesfully! Final file size: %c${main.length}`,
        consoleColors.info,
        consoleColors.recognized
    );
    SpessaSynthGroupEnd();
    return main;
}
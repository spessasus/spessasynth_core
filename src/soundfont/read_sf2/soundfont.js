import { IndexedByteArray } from "../../utils/indexed_array.js";
import { readSamples } from "./samples.js";
import { readLittleEndian } from "../../utils/byte_functions/little_endian.js";
import { readGenerators } from "./generators.js";
import { applyPresetZones } from "./preset_zones.js";
import { readPresets } from "./presets.js";
import { readInstruments } from "./instruments.js";
import { readModulators } from "./modulators.js";
import { readRIFFChunk, RiffChunk } from "../basic_soundfont/riff_chunk.js";
import { consoleColors } from "../../utils/other.js";
import { SpessaSynthGroup, SpessaSynthGroupEnd, SpessaSynthInfo } from "../../utils/loggin.js";
import { readBytesAsString } from "../../utils/byte_functions/string.js";
import { stbvorbis } from "../../externals/stbvorbis_sync/stbvorbis_sync.min.js";
import { BasicSoundBank } from "../basic_soundfont/basic_soundbank.js";
import { Generator } from "../basic_soundfont/generator.js";
import { Modulator } from "../basic_soundfont/modulator.js";
import { applyInstrumentZones, InstrumentZone } from "./instrument_zones.js";
import { readZoneIndexes } from "./zones.js";

/**
 * soundfont.js
 * purpose: parses a soundfont2 file
 */

export class SoundFont2 extends BasicSoundBank
{
    /**
     * @type {Instrument[]}
     */
    instruments = [];
    
    /**
     * @type {Preset[]}
     */
    presets = [];
    
    /**
     * Initializes a new SoundFont2 Parser and parses the given data array
     * @param arrayBuffer {ArrayBuffer}
     * @param warnDeprecated {boolean}
     */
    constructor(arrayBuffer, warnDeprecated = true)
    {
        super();
        if (warnDeprecated)
        {
            console.warn("Using the constructor directly is deprecated. Use loadSoundFont instead.");
        }
        const mainFileArray = new IndexedByteArray(arrayBuffer);
        SpessaSynthGroup("%cParsing SoundFont...", consoleColors.info);
        if (!mainFileArray)
        {
            SpessaSynthGroupEnd();
            this.parsingError("No data provided!");
        }
        
        // read the main chunk
        let firstChunk = readRIFFChunk(mainFileArray, false);
        this.verifyHeader(firstChunk, "riff");
        
        const type = readBytesAsString(mainFileArray, 4).toLowerCase();
        if (type !== "sfbk" && type !== "sfpk")
        {
            SpessaSynthGroupEnd();
            throw new SyntaxError(`Invalid soundFont! Expected "sfbk" or "sfpk" got "${type}"`);
        }
        /*
        Some SF2Pack description:
        this is essentially sf2, but the entire smpl chunk is compressed (we only support Ogg Vorbis here)
        and the only other difference is that the main chunk isn't "sfbk" but rather "sfpk"
         */
        const isSF2Pack = type === "sfpk";
        
        // INFO
        let infoChunk = readRIFFChunk(mainFileArray);
        this.verifyHeader(infoChunk, "list");
        const infoString = readBytesAsString(infoChunk.chunkData, 4);
        if (infoString !== "INFO")
        {
            SpessaSynthGroupEnd();
            throw new SyntaxError(`Invalid soundFont! Expected "INFO" or "${infoString}"`);
        }
        
        /**
         * @type {RiffChunk|undefined}
         */
        let xdtaChunk = undefined;
        
        
        while (infoChunk.chunkData.length > infoChunk.chunkData.currentIndex)
        {
            let chunk = readRIFFChunk(infoChunk.chunkData);
            let text;
            // special cases
            switch (chunk.header.toLowerCase())
            {
                case  "ifil":
                case "iver":
                    text = `${readLittleEndian(chunk.chunkData, 2)}.${readLittleEndian(chunk.chunkData, 2)}`;
                    this.soundFontInfo[chunk.header] = text;
                    break;
                
                case "icmt":
                    text = readBytesAsString(chunk.chunkData, chunk.chunkData.length, undefined, false);
                    this.soundFontInfo[chunk.header] = text;
                    break;
                
                // dmod: default modulators
                case "dmod":
                    const newModulators = readModulators(chunk);
                    text = `Modulators: ${newModulators.length}`;
                    
                    // override default modulators
                    this.defaultModulators = newModulators;
                    this.customDefaultModulators = true;
                    this.soundFontInfo[chunk.header] = text;
                    break;
                
                case "list":
                    // possible xdta
                    const listType = readBytesAsString(chunk.chunkData, 4);
                    if (listType === "xdta")
                    {
                        SpessaSynthInfo("%cExtended SF2 found!", consoleColors.recognized);
                        xdtaChunk = chunk;
                    }
                    break;
                
                default:
                    text = readBytesAsString(chunk.chunkData, chunk.chunkData.length);
                    this.soundFontInfo[chunk.header] = text;
            }
            
            SpessaSynthInfo(
                `%c"${chunk.header}": %c"${text}"`,
                consoleColors.info,
                consoleColors.recognized
            );
        }
        // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
        const isExtended = xdtaChunk !== undefined;
        /**
         * @type {{
         *     phdr: RiffChunk,
         *     pbag: RiffChunk,
         *     pmod: RiffChunk,
         *     pgen: RiffChunk,
         *     inst: RiffChunk,
         *     ibag: RiffChunk,
         *     imod: RiffChunk,
         *     igen: RiffChunk,
         *     shdr: RiffChunk,
         * }}
         */
        let xChunks = {};
        if (isExtended)
        {
            // read the hydra chunks
            xChunks.phdr = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.pbag = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.pmod = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.pgen = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.inst = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.ibag = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.imod = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.igen = readRIFFChunk(xdtaChunk.chunkData);
            xChunks.shdr = readRIFFChunk(xdtaChunk.chunkData);
        }
        
        // SDTA
        const sdtaChunk = readRIFFChunk(mainFileArray, false);
        this.verifyHeader(sdtaChunk, "list");
        this.verifyText(readBytesAsString(mainFileArray, 4), "sdta");
        
        // smpl
        SpessaSynthInfo("%cVerifying smpl chunk...", consoleColors.warn);
        let sampleDataChunk = readRIFFChunk(mainFileArray, false);
        this.verifyHeader(sampleDataChunk, "smpl");
        /**
         * @type {IndexedByteArray|Float32Array}
         */
        let sampleData;
        // SF2Pack: the entire data is compressed
        if (isSF2Pack)
        {
            SpessaSynthInfo(
                "%cSF2Pack detected, attempting to decode the smpl chunk...",
                consoleColors.info
            );
            try
            {
                /**
                 * @type {Float32Array}
                 */
                sampleData = stbvorbis.decode(mainFileArray.buffer.slice(
                    mainFileArray.currentIndex,
                    mainFileArray.currentIndex + sdtaChunk.size - 12
                )).data[0];
            }
            catch (e)
            {
                SpessaSynthGroupEnd();
                throw new Error(`SF2Pack Ogg Vorbis decode error: ${e}`);
            }
            SpessaSynthInfo(
                `%cDecoded the smpl chunk! Length: %c${sampleData.length}`,
                consoleColors.info,
                consoleColors.value
            );
        }
        else
        {
            /**
             * @type {IndexedByteArray}
             */
            sampleData = mainFileArray;
            this.sampleDataStartIndex = mainFileArray.currentIndex;
        }
        
        SpessaSynthInfo(
            `%cSkipping sample chunk, length: %c${sdtaChunk.size - 12}`,
            consoleColors.info,
            consoleColors.value
        );
        mainFileArray.currentIndex += sdtaChunk.size - 12;
        
        // PDTA
        SpessaSynthInfo("%cLoading preset data chunk...", consoleColors.warn);
        let presetChunk = readRIFFChunk(mainFileArray);
        this.verifyHeader(presetChunk, "list");
        readBytesAsString(presetChunk.chunkData, 4);
        
        // read the hydra chunks
        const phdrChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(phdrChunk, "phdr");
        
        const pbagChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(pbagChunk, "pbag");
        
        const pmodChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(pmodChunk, "pmod");
        
        const pgenChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(pgenChunk, "pgen");
        
        const instChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(instChunk, "inst");
        
        const ibagChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(ibagChunk, "ibag");
        
        const imodChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(imodChunk, "imod");
        
        const igenChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(igenChunk, "igen");
        
        const shdrChunk = readRIFFChunk(presetChunk.chunkData);
        this.verifyHeader(shdrChunk, "shdr");
        
        /**
         * read all the samples
         * (the current index points to start of the smpl read)
         */
        mainFileArray.currentIndex = this.sampleDataStartIndex;
        const samples = readSamples(shdrChunk, sampleData, !isExtended);
        
        if (isExtended)
        {
            // apply extensions to samples
            const xSamples = readSamples(xChunks.shdr, new Float32Array(1), false);
            if (xSamples.length === samples.length)
            {
                samples.forEach((s, i) =>
                {
                    s.sampleName += xSamples[i].sampleName;
                    s.linkedSampleIndex |= xSamples[i].linkedSampleIndex << 16;
                });
            }
            
        }
        // trim names
        samples.forEach(s => s.sampleName = s.sampleName.trim());
        this.samples.push(...samples);
        
        /**
         * read all the instrument generators
         * @type {Generator[]}
         */
        let instrumentGenerators = readGenerators(igenChunk);
        
        /**
         * read all the instrument modulators
         * @type {Modulator[]}
         */
        let instrumentModulators = readModulators(imodChunk);
        
        const instruments = readInstruments(instChunk);
        
        if (isExtended)
        {
            // apply extensions to instruments
            const xInst = readInstruments(xChunks.inst);
            if (xInst.length === instruments.length)
            {
                instruments.forEach((inst, i) =>
                {
                    inst.instrumentName += xInst[i].instrumentName;
                    inst.zoneStartIndex |= xInst[i].zoneStartIndex;
                });
                // adjust zone counts
                instruments.forEach((inst, i) =>
                {
                    if (i < instruments.length - 1)
                    {
                        inst.zonesCount = instruments[i + 1].zoneStartIndex - inst.zoneStartIndex;
                    }
                });
            }
            
        }
        // trim names
        instruments.forEach(i => i.instrumentName = i.instrumentName.trim());
        this.instruments.push(...instruments);
        
        const ibagIndexes = readZoneIndexes(ibagChunk);
        
        if (isExtended)
        {
            const extraIndexes = readZoneIndexes(xChunks.ibag);
            for (let i = 0; i < ibagIndexes.mod.length; i++)
            {
                ibagIndexes.mod[i] |= extraIndexes.mod[i] << 16;
            }
            for (let i = 0; i < ibagIndexes.gen.length; i++)
            {
                ibagIndexes.gen[i] |= extraIndexes.gen[i] << 16;
            }
        }
        
        /**
         * read all the instrument zones (and apply them)
         * @type {InstrumentZone[]}
         */
        applyInstrumentZones(
            ibagIndexes,
            instrumentGenerators,
            instrumentModulators,
            this.samples,
            this.instruments
        );
        
        /**
         * read all the preset generators
         * @type {Generator[]}
         */
        let presetGenerators = readGenerators(pgenChunk);
        
        /**
         * Read all the preset modulatorrs
         * @type {Modulator[]}
         */
        let presetModulators = readModulators(pmodChunk);
        
        const presets = readPresets(phdrChunk, this);
        
        if (isExtended)
        {
            // apply extensions to presets
            const xPreset = readPresets(xChunks.phdr, this);
            if (xPreset.length === presets.length)
            {
                presets.forEach((pres, i) =>
                {
                    pres.presetName += xPreset[i].presetName;
                    pres.zoneStartIndex |= xPreset[i].zoneStartIndex;
                });
                // adjust zone counts
                presets.forEach((preset, i) =>
                {
                    if (i < instruments.length - 1)
                    {
                        preset.zonesCount = presets[i + 1].zoneStartIndex - preset.zoneStartIndex;
                    }
                });
            }
            
        }
        
        // trim names
        presets.forEach(p => p.presetName === p.presetName.trim());
        this.addPresets(...presets);
        
        const pbagIndexes = readZoneIndexes(pbagChunk);
        
        if (isExtended)
        {
            const extraIndexes = readZoneIndexes(xChunks.pbag);
            for (let i = 0; i < pbagIndexes.mod.length; i++)
            {
                pbagIndexes.mod[i] |= extraIndexes.mod[i] << 16;
            }
            for (let i = 0; i < pbagIndexes.gen.length; i++)
            {
                pbagIndexes.gen[i] |= extraIndexes.gen[i] << 16;
            }
        }
        
        applyPresetZones(pbagIndexes, presetGenerators, presetModulators, this.instruments, this.presets);
        this.flush();
        SpessaSynthInfo(
            `%cParsing finished! %c"${this.soundFontInfo["INAM"]}"%c has %c${this.presets.length} %cpresets,
        %c${this.instruments.length}%c instruments and %c${this.samples.length}%c samples.`,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info,
            consoleColors.recognized,
            consoleColors.info
        );
        SpessaSynthGroupEnd();
    }
    
    /**
     * @param chunk {RiffChunk}
     * @param expected {string}
     */
    verifyHeader(chunk, expected)
    {
        if (chunk.header.toLowerCase() !== expected.toLowerCase())
        {
            SpessaSynthGroupEnd();
            this.parsingError(`Invalid chunk header! Expected "${expected.toLowerCase()}" got "${chunk.header.toLowerCase()}"`);
        }
    }
    
    /**
     * @param text {string}
     * @param expected {string}
     */
    verifyText(text, expected)
    {
        if (text.toLowerCase() !== expected.toLowerCase())
        {
            SpessaSynthGroupEnd();
            this.parsingError(`Invalid FourCC: Expected "${expected.toLowerCase()}" got "${text.toLowerCase()}"\``);
        }
    }
}
import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeStringAsBytes } from "../../../utils/byte_functions/string";
import {
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { writeRIFFChunkRaw } from "../riff_chunk";
import { SF3_BIT_FLIT } from "../../read_sf2/samples";
import type { BasicSoundBank } from "../basic_soundbank";
import type { ReturnedExtendedSf2Chunks } from "../../types";

export function getSHDR(
    bank: BasicSoundBank,
    smplStartOffsets: number[],
    smplEndOffsets: number[]
): ReturnedExtendedSf2Chunks {
    const sampleLength = 46;
    const shdrSize = sampleLength * (bank.samples.length + 1); // +1 because EOP
    const shdrData = new IndexedByteArray(shdrSize);
    // https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md
    const xshdrData = new IndexedByteArray(shdrSize);
    let maxSampleLink = 0;
    bank.samples.forEach((sample, index) => {
        // sample name
        writeStringAsBytes(shdrData, sample.name.substring(0, 20), 20);
        writeStringAsBytes(xshdrData, sample.name.substring(20), 20);
        // start offset
        const dwStart = smplStartOffsets[index];
        writeDword(shdrData, dwStart);
        xshdrData.currentIndex += 4;
        // end offset
        const dwEnd = smplEndOffsets[index];
        writeDword(shdrData, dwEnd);
        xshdrData.currentIndex += 4;
        // loop is stored as relative in sample points, change it to absolute sample points here
        let loopStart = sample.loopStart + dwStart;
        let loopEnd = sample.loopEnd + dwStart;
        if (sample.isCompressed) {
            // https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format
            loopStart -= dwStart;
            loopEnd -= dwStart;
        }
        writeDword(shdrData, loopStart);
        writeDword(shdrData, loopEnd);
        // sample rate
        writeDword(shdrData, sample.sampleRate);
        // pitch and correction
        shdrData[shdrData.currentIndex++] = sample.originalKey;
        shdrData[shdrData.currentIndex++] = sample.pitchCorrection;
        // skip all those for xshdr
        xshdrData.currentIndex += 14;
        // sample link
        const sampleLinkIndex = sample.linkedSample
            ? bank.samples.indexOf(sample.linkedSample)
            : 0;
        writeWord(shdrData, Math.max(0, sampleLinkIndex) & 0xffff);
        writeWord(xshdrData, Math.max(0, sampleLinkIndex) >> 16);
        maxSampleLink = Math.max(maxSampleLink, sampleLinkIndex);
        // sample type: add byte if compressed
        let type = sample.sampleType;
        if (sample.isCompressed) {
            type |= SF3_BIT_FLIT;
        }
        writeWord(shdrData, type);
        xshdrData.currentIndex += 2;
    });

    // write EOS and zero everything else
    writeStringAsBytes(shdrData, "EOS", sampleLength);
    writeStringAsBytes(xshdrData, "EOS", sampleLength);
    const shdr = writeRIFFChunkRaw("shdr", shdrData);
    const xshdr = writeRIFFChunkRaw("shdr", xshdrData);
    return {
        pdta: shdr,
        xdta: xshdr,
        highestIndex: maxSampleLink
    };
}

import type { DLSLoop } from "../../types";
import { type RIFFChunk, writeRIFFChunkRaw } from "../../../utils/riff_chunk";
import {
    readLittleEndianIndexed,
    signedInt16,
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import type { DLSLoopType } from "../../enums";
import { DLSVerifier } from "./dls_verifier";
import { IndexedByteArray } from "../../../utils/indexed_array";

const WSMP_SIZE = 20;
const WSMP_LOOP_SIZE = 16;

export class WaveSample extends DLSVerifier {
    /**
     * Specifies the gain to be applied to this sample in 32 bit relative gain units.
     * Each unit of gain represents 1/655360 dB
     */
    public gain = 0;
    /**
     * Specifies the MIDI note which will replay the sample at original pitch. This value ranges
     * from 0 to 127 (a value of 60 represents Middle C, as defined by the MIDI specification).
     */
    public unityNote = 60;
    /**
     * Specifies the tuning offset from the usUnityNote in 16 bit relative pitch. (cents)
     */
    public fineTune = 0;
    /**
     * Specifies the number (count) of <wavesample-loop> records that are contained in the
     * <wsmp-ck> chunk. The <wavesample-loop> records are stored immediately following the
     * cSampleLoops data field. One shot sounds will have the cSampleLoops field set to 0.
     * Looped sounds will have the cSampleLoops field set to 1. Values greater than 1 are not yet
     * defined at this time.
     */
    public loops = new Array<DLSLoop>();

    public static read(chunk: RIFFChunk) {
        this.verifyHeader(chunk, "wsmp");
        const waveSample = new WaveSample();
        // CbSize
        readLittleEndianIndexed(chunk.data, 4);
        waveSample.unityNote = readLittleEndianIndexed(chunk.data, 2);
        // SFineTune
        waveSample.fineTune = signedInt16(
            chunk.data[chunk.data.currentIndex++],
            chunk.data[chunk.data.currentIndex++]
        );
        // LGain: Each unit of gain represents 1/655360 dB
        waveSample.gain = readLittleEndianIndexed(chunk.data, 4) | 0;
        // Skip options
        readLittleEndianIndexed(chunk.data, 4);

        // Read loop count (always one or zero)
        const loopsAmount = readLittleEndianIndexed(chunk.data, 4);
        if (loopsAmount === 0) {
            // No loop
        } else {
            // Ignore cbSize
            readLittleEndianIndexed(chunk.data, 4);
            // Loop type: loop normally or loop until release (like soundfont)
            const loopType = readLittleEndianIndexed(
                chunk.data,
                4
            ) as DLSLoopType; // Why is it long?
            const loopStart = readLittleEndianIndexed(chunk.data, 4);
            const loopLength = readLittleEndianIndexed(chunk.data, 4);
            waveSample.loops.push({
                loopStart,
                loopLength,
                loopType
            });
        }
        return waveSample;
    }

    public write() {
        const wsmpData = new IndexedByteArray(
            WSMP_SIZE + this.loops.length * WSMP_LOOP_SIZE
        );
        // CbSize
        writeDword(wsmpData, WSMP_SIZE);
        writeWord(wsmpData, this.unityNote);
        writeWord(wsmpData, this.fineTune);
        writeDword(wsmpData, this.gain);
        // FulOptions: has to be 2, according to all DLS files I have
        writeDword(wsmpData, 2);
        // CSampleLoops
        writeDword(wsmpData, this.loops.length);
        this.loops.forEach((loop) => {
            writeDword(wsmpData, WSMP_LOOP_SIZE);
            writeDword(wsmpData, loop.loopType);
            writeDword(wsmpData, loop.loopStart);
            writeDword(wsmpData, loop.loopLength);
        });
        return writeRIFFChunkRaw("wsmp", wsmpData);
    }
}

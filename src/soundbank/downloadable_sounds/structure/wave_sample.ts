import type { DLSLoop } from "../../types";
import { type RIFFChunk, writeRIFFChunkRaw } from "../../../utils/riff_chunk";
import {
    readLittleEndianIndexed,
    signedInt16,
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { type DLSLoopType, DLSLoopTypes, generatorTypes } from "../../enums";
import { DLSVerifier } from "./dls_verifier";
import { IndexedByteArray } from "../../../utils/indexed_array";
import type { BasicZone } from "../../basic_soundbank/basic_zone";
import { type BasicSample } from "../../basic_soundbank/basic_sample";
import type { SampleLoopingMode } from "../../../synthesizer/types";
import { SpessaSynthWarn } from "../../../utils/loggin";

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

    /**
     * Specifies flag options for the digital audio sample.
     * Default to F_WSMP_NO_COMPRESSION,
     * according to all DLS files I have.
     */
    public fulOptions = 2;

    public static read(chunk: RIFFChunk) {
        this.verifyHeader(chunk, "wsmp");
        const waveSample = new WaveSample();
        // CbSize
        const cbSize = readLittleEndianIndexed(chunk.data, 4);
        if (cbSize !== WSMP_SIZE) {
            SpessaSynthWarn(
                `Wsmp cbSize mismatch: got ${cbSize}, expected ${WSMP_SIZE}.`
            );
        }
        waveSample.unityNote = readLittleEndianIndexed(chunk.data, 2);
        // SFineTune
        waveSample.fineTune = signedInt16(
            chunk.data[chunk.data.currentIndex++],
            chunk.data[chunk.data.currentIndex++]
        );

        // LGain: Each unit of gain represents 1/655360 dB
        waveSample.gain = readLittleEndianIndexed(chunk.data, 4) | 0;
        waveSample.fulOptions = readLittleEndianIndexed(chunk.data, 4);

        // Read loop count (always one or zero)
        const loopsAmount = readLittleEndianIndexed(chunk.data, 4);
        if (loopsAmount === 0) {
            // No loop
        } else {
            const cbSize = readLittleEndianIndexed(chunk.data, 4);
            if (cbSize !== WSMP_LOOP_SIZE) {
                SpessaSynthWarn(
                    `CbSize for loop in wsmp mismatch. Expected ${WSMP_SIZE}, got ${cbSize}.`
                );
            }
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

    /**
     * Converts the wsmp data into an SF zone
     * @param zone
     * @param sample
     * @private
     */
    public toSFZone(zone: BasicZone, sample: BasicSample) {
        let loopingMode: SampleLoopingMode = 0;
        const loop = this.loops[0];
        if (loop) {
            loopingMode = loop.loopType === DLSLoopTypes.loopAndRelease ? 3 : 1;
        }
        if (loopingMode !== 0) {
            zone.setGenerator(generatorTypes.sampleModes, loopingMode);
        }

        // Convert to signed and turn into attenuation (invert)
        const wsmpGain16 = this.gain >> 16;
        const wsmpAttenuation = -wsmpGain16;
        // Apply the E-MU attenuation correction here
        const wsmpAttenuationCorrected = wsmpAttenuation / 0.4;

        if (wsmpAttenuationCorrected !== 0) {
            zone.setGenerator(
                generatorTypes.initialAttenuation,
                wsmpAttenuationCorrected
            );
        }

        // Correct tuning
        zone.setTuning(this.fineTune - sample.pitchCorrection);

        // Correct the key if needed
        if (this.unityNote !== sample.originalKey) {
            zone.setGenerator(generatorTypes.overridingRootKey, this.unityNote);
        }
        // Correct loop if needed
        if (loop) {
            const diffStart = loop.loopStart - sample.loopStart;
            const loopEnd = loop.loopStart + loop.loopLength;
            const diffEnd = loopEnd - sample.loopEnd;
            if (diffStart !== 0) {
                const fine = diffStart % 32768;
                zone.setGenerator(generatorTypes.startloopAddrsOffset, fine);
                // Coarse generator uses 32768 samples per step
                const coarse = Math.trunc(diffStart / 32768);
                if (coarse !== 0) {
                    zone.setGenerator(
                        generatorTypes.startloopAddrsCoarseOffset,
                        coarse
                    );
                }
            }
            if (diffEnd !== 0) {
                const fine = diffEnd % 32768;
                zone.setGenerator(generatorTypes.endloopAddrsOffset, fine);
                // Coarse generator uses 32768 samples per step
                const coarse = Math.trunc(diffEnd / 32768);
                if (coarse !== 0) {
                    zone.setGenerator(
                        generatorTypes.endloopAddrsCoarseOffset,
                        coarse
                    );
                }
            }
        }
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
        writeDword(wsmpData, this.fulOptions);
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

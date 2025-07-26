import {
    writeDword,
    writeWord
} from "../../../utils/byte_functions/little_endian";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeRIFFChunkRaw } from "../riff_chunk";

const WSMP_SIZE = 20;

/**
 * Writes a WSMP chunk
 * @param rootKey the root key of the sample.
 * @param tuning the sample pitch correction.
 * @param attenuationCentibels {number} CENTIBELS, NO E-MU CORRECTION!
 * @param loopStart the loop start.
 * @param loopEnd the loop end.
 * @param loopingMode the looping mode.
 * @returns the chunk.
 */
export function writeWavesample(
    rootKey: number,
    tuning: number,
    attenuationCentibels: number,
    loopStart: number,
    loopEnd: number,
    loopingMode: number
): IndexedByteArray {
    let loopCount = loopingMode === 0 ? 0 : 1;
    const wsmpData = new IndexedByteArray(WSMP_SIZE + loopCount * 16);
    writeDword(wsmpData, WSMP_SIZE); // cbSize
    // usUnityNote (apply root pitch here)
    writeWord(wsmpData, rootKey);
    // sFineTune
    writeWord(wsmpData, tuning);

    // gain correction, use InitialAttenuation, apply attenuation correction
    const attenuationCb = attenuationCentibels * 0.4;

    // gain correction: Each unit of gain represents 1/655360 dB
    const lGain = Math.floor(attenuationCb * -65536);
    writeDword(wsmpData, lGain);
    // fulOptions: has to be 2, according to all DLS files I have
    writeDword(wsmpData, 2);

    const loopSize = loopEnd - loopStart;
    let ulLoopType = 0;
    switch (loopingMode) {
        default:
        case 0:
            // no loop
            loopCount = 0;
            break;

        case 1:
            // loop
            ulLoopType = 0;
            loopCount = 1;
            break;

        case 3:
            // loop and release
            ulLoopType = 1;
            loopCount = 1;
    }

    // cSampleLoops
    writeDword(wsmpData, loopCount);
    if (loopCount === 1) {
        writeDword(wsmpData, 16); // cbSize
        writeDword(wsmpData, ulLoopType);
        writeDword(wsmpData, loopStart);
        writeDword(wsmpData, loopSize);
    }
    return writeRIFFChunkRaw("wsmp", wsmpData);
}

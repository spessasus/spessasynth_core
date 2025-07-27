import { IndexedByteArray } from "../../../utils/indexed_array";
import { writeDword, writeWord } from "../../../utils/byte_functions/little_endian";
import { writeRIFFChunkParts, writeRIFFChunkRaw } from "../riff_chunk";
import { writeWavesample } from "./wsmp";
import { writeArticulator } from "./art2";
import type { BasicSoundBank } from "../basic_soundbank";
import type { BasicInstrumentZone } from "../basic_instrument_zone";
import type { BasicGlobalZone } from "../basic_global_zone";
import { generatorTypes } from "../generator_types";

/**
 * @param bank {BasicSoundBank}
 * @param zone {BasicInstrumentZone}
 * @param globalZone {BasicGlobalZone}
 * @returns {IndexedByteArray}
 */
export function writeDLSRegion(
    bank: BasicSoundBank,
    zone: BasicInstrumentZone,
    globalZone: BasicGlobalZone
): IndexedByteArray {
    if (!zone.sample) {
        throw new Error(
            "Attempting to write an instrument zone without a sample."
        );
    }
    // region header
    const rgnhData = new IndexedByteArray(12);
    // keyRange
    writeWord(rgnhData, Math.max(zone.keyRange.min, 0));
    writeWord(rgnhData, zone.keyRange.max);
    // velRange
    writeWord(rgnhData, Math.max(zone.velRange.min, 0));
    writeWord(rgnhData, zone.velRange.max);
    // fusOptions: 0 it seems
    writeWord(rgnhData, 0);
    // keyGroup (exclusive class)
    const exclusive = zone.getGeneratorValue(generatorTypes.exclusiveClass, 0);
    writeWord(rgnhData, exclusive);
    // usLayer
    writeWord(rgnhData, 0);
    const rgnh = writeRIFFChunkRaw("rgnh", rgnhData);

    let rootKey = zone.getGeneratorValue(
        generatorTypes.overridingRootKey,
        zone.sample.originalKey || 60
    );

    // a lot of soundfonts like to set scale tuning to 0 in drums and keep the key at 60
    // since we implement scale tuning via a dls articulator and fluid doesn't support these,
    // change the root key here
    const scaleTuning = zone.getGeneratorValue(
        generatorTypes.scaleTuning,
        globalZone.getGeneratorValue(generatorTypes.scaleTuning, 100)
    );
    if (scaleTuning === 0 && zone.keyRange.max - zone.keyRange.min === 0) {
        rootKey = zone.keyRange.min;
    }

    // wave sample (Wsmp)
    const wsmp = writeWavesample(
        rootKey,
        zone.getGeneratorValue(generatorTypes.fineTune, 0) +
            zone.getGeneratorValue(generatorTypes.coarseTune, 0) * 100 +
            zone.sample.pitchCorrection,
        zone.getGeneratorValue(generatorTypes.initialAttenuation, 0),
        // calculate loop with offsets
        zone.sample.loopStart +
            zone.getGeneratorValue(generatorTypes.startloopAddrsOffset, 0) +
            zone.getGeneratorValue(
                generatorTypes.startloopAddrsCoarseOffset,
                0
            ) *
                32768,
        zone.sample.loopEnd +
            zone.getGeneratorValue(generatorTypes.endloopAddrsOffset, 0) +
            zone.getGeneratorValue(generatorTypes.endloopAddrsCoarseOffset, 0) *
                32768,
        zone.getGeneratorValue(generatorTypes.sampleModes, 0)
    );

    // wave link (wlnk)
    const wlnkData = new IndexedByteArray(12);
    writeWord(wlnkData, 0); // fusOptions
    writeWord(wlnkData, 0); // usPhaseGroup
    // 1 means that the first bit is on so mono/left
    writeDword(wlnkData, 1); // ulChannel
    writeDword(wlnkData, bank.samples.indexOf(zone.sample)); // ulTableIndex
    const wlnk = writeRIFFChunkRaw("wlnk", wlnkData);

    // art
    let lar2 = new IndexedByteArray(0);
    if (zone.modulators.length + zone.generators.length > 0) {
        const art2 = writeArticulator(zone);

        lar2 = writeRIFFChunkRaw("lar2", art2, false, true);
    }

    return writeRIFFChunkParts("rgn2", [rgnh, wsmp, wlnk, lar2], true);
}

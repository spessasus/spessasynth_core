import type { IndexedByteArray } from "../../../utils/indexed_array";

/**
 * Returned structure containing extended SF2 chunks.
 */
export interface ExtendedSF2Chunks {
    /**
     * The PDTA part of the chunk.
     */
    pdta: IndexedByteArray;

    /**
     * The XDTA (https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md) part of the chunk.
     */
    xdta: IndexedByteArray;
}

/**
 * Write indexes for tracking writing a SoundFont file.
 */
export interface SoundFontWriteIndexes {
    /**
     * Generator start index.
     */
    gen: number;
    /**
     * Modulator start index.
     */
    mod: number;
    /**
     * Zone start index.
     */
    bag: number;
    /**
     * Preset/instrument start index.
     */
    hdr: number;
}

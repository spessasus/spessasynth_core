import { PEAKING_TABLE, peakingEntry } from "../peaking_table";
import { Biquad } from "./biquad";

/**
 * The gain index (0-24, -12 to +12 dB) of an EQ gain parameter (0x34-0x4c, clamped).
 * @param value The parameter.
 * @internal
 */
export function peakingGain(value: number) {
    return Math.max(0, Math.min(24, value - 0x34));
}

/**
 * A constant Q peaking band of the hardware's EQs.
 * The width is given as the lower edge of the band in Hz, so the center and the lower skirt stay put at any rate.
 * @internal
 */
export class PeakingBand extends Biquad {
    /**
     * @param frequency The center in Hz.
     * @param lowerEdge The lower edge of the band in Hz (below the center).
     * @param gainDb The gain at the center in dB.
     */
    public set(frequency: number, lowerEdge: number, gainDb: number) {
        const t = this.prewarp(frequency);
        // The edges sit geometrically around the center on the prewarped axis, and their distance is center / Q
        const edge = this.prewarp(lowerEdge);
        this.setPeaking(frequency, t / ((t * t) / edge - edge), gainDb);
    }

    /**
     * Sets one of the hardware's peaking entries (`PEAKING_TABLE`).
     * @param table The frequency table (0-16).
     * @param q The Q index (0-4).
     * @param gain The gain index (0-24, -12 to +12 dB).
     */
    public setEntry(table: number, q: number, gain: number) {
        const e = peakingEntry(table, q, gain);
        this.set(PEAKING_TABLE[e], PEAKING_TABLE[e + 1], PEAKING_TABLE[e + 2]);
    }

    /**
     * Sets the band from its parameters.
     * @param frequency The EQ column value (one table every 8 values).
     * @param q The Q index (0-4).
     * @param gain The gain parameter (0x34-0x4c is -12 to +12 dB).
     */
    public setParameters(frequency: number, q: number, gain: number) {
        this.setEntry(frequency >> 3, q, peakingGain(gain));
    }
}

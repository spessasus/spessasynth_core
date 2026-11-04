import { Compressor, detectorGain, recoveryRate } from "../blocks/dynamics";
import { GSDynamicsEffect } from "./dynamics_effect";

/**
 * Compressor (`01 30`).
 * Parameters: 1 sustain (how fast the gain comes back), 2 attack (the makeup gain: the output ceiling stays, the
 * knee moves), 3 post gain, then the EQ, pan and level.
 *
 * The SC-VA and SC-8850 manuals list parameter 1 as Attack and 2 as Sustain, the other way round from the names
 * here. Only the names differ: parameter 1 still sets how fast the gain recovers (0.09 to 2.25 per second) and
 * parameter 2 the makeup gain, like in Sound Canvas VA. The multis' compressors and Lo-Fi 1 use the same names.
 * @internal
 */
export class GSCompressor extends GSDynamicsEffect {
    public readonly type = 0x01_30;
    protected readonly defaults = new Uint8Array([
        0x48, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x68
    ]);
    protected readonly limits = { 2: 3 };
    protected readonly dynamics: Compressor;
    protected readonly preGain = 1;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.dynamics = new Compressor(sampleRate);
        this.reset();
    }

    protected updateDynamics() {
        const p = this.parameters;
        // 0.09 to 2.25 per second, 0 to the full gain in 11 s to 0.44 s
        this.dynamics.setRecoveryRate(recoveryRate(p[0]));
        this.dynamics.setMakeup(detectorGain(p[1]));
        return p[2];
    }
}

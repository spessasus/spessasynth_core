import { Compressor, detectorGain, recoveryRate } from "../blocks/dynamics";
import { GSDynamicsEffect } from "./dynamics_effect";

/**
 * Compressor (`01 30`).
 * Parameters: 1 sustain (how fast the gain comes back), 2 attack (the makeup gain: the output ceiling stays, the
 * knee moves), 3 post gain, then the EQ, pan and level.
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

import type { DelayMemory } from "../blocks/delay_memory";
import { GSStereoChorusFlanger } from "./stereo_chorus_flanger";

/**
 * St. Chorus (`01 42`).
 * @internal
 */
export class GSStereoChorus extends GSStereoChorusFlanger {
    public readonly type = 0x01_42;
    protected readonly defaults = new Uint8Array([
        0x00, 0x00, 0x0a, 0x08, 0x6f, 0x00, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x00, 0x68
    ]);
    protected readonly flanger = false;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.reset();
    }
}

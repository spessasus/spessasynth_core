import type { DelayMemory } from "../blocks/delay_memory";
import { GSStereoChorusFlanger } from "./stereo_chorus_flanger";

/**
 * St. Flanger (`01 23`).
 * @internal
 */
export class GSStereoFlanger extends GSStereoChorusFlanger {
    public readonly type = 0x01_23;
    protected readonly defaults = new Uint8Array([
        0x00, 0x00, 0x10, 0x0b, 0x18, 0x68, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x00, 0x68
    ]);
    protected readonly flanger = true;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory);
        this.reset();
    }
}

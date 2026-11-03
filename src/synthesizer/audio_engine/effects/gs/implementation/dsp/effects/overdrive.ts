import { GSDriveEffect } from "./drive_effect";
import { GUITAR_OVERDRIVE } from "../blocks/drive";

/**
 * Overdrive (`01 10`).
 * @internal
 */
export class GSOverdrive extends GSDriveEffect {
    public readonly type = 0x01_10;
    protected readonly defaults = new Uint8Array([
        0x30, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x60
    ]);

    public constructor(sampleRate: number) {
        super(sampleRate, GUITAR_OVERDRIVE);
        this.reset();
    }
}

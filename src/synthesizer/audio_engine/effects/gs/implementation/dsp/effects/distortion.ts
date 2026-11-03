import { GSDriveEffect } from "./drive_effect";
import { GUITAR_DISTORTION } from "../blocks/drive";

/**
 * Distortion (`01 11`).
 * @internal
 */
export class GSDistortion extends GSDriveEffect {
    public readonly type = 0x01_11;
    protected readonly defaults = new Uint8Array([
        0x4c, 0x03, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x38, 0x40, 0x54
    ]);

    public constructor(sampleRate: number) {
        super(sampleRate, GUITAR_DISTORTION);
        this.reset();
    }
}

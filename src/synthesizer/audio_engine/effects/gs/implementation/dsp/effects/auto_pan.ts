import { GSTremoloEffect } from "./tremolo_effect";

/**
 * Auto Pan (`01 26`).
 * @internal
 */
export class GSAutoPan extends GSTremoloEffect {
    public readonly type = 0x01_26;
    protected readonly defaults = new Uint8Array([
        0x01, 0x3c, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x7f
    ]);

    public constructor(sampleRate: number) {
        super(sampleRate, true);
        this.reset();
    }
}

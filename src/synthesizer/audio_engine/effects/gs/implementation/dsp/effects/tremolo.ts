import { GSTremoloEffect } from "./tremolo_effect";

/**
 * Tremolo (`01 25`).
 * @internal
 */
export class GSTremolo extends GSTremoloEffect {
    public readonly type = 0x01_25;
    protected readonly defaults = new Uint8Array([
        0x01, 0x3c, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x00, 0x7f
    ]);

    public constructor(sampleRate: number) {
        super(sampleRate, false);
        this.reset();
    }
}

import { GSThreeD } from "./three_d";
import { azimuth } from "../conversion";

/**
 * 3D Manual (`01 71`): a source at a fixed azimuth.
 * Parameters: 1 azimuth (Azim column), 15 output (speaker, phones), 20 level. EFX control source 1 moves the azimuth,
 * source 2 the level.
 * @internal
 */
export class GSThreeDManual extends GSThreeD {
    public readonly type = 0x01_71;
    protected readonly defaults = new Uint8Array([
        0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f
    ]);
    public constructor(sampleRate: number) {
        super(sampleRate);
        this.reset();
    }

    protected level() {
        return this.controlled(1, 19);
    }

    protected updatePosition() {
        this.positioner.setAzimuth(
            azimuth(this.controlled(0, 0)),
            this.resetting
        );
    }
}

import { GSThreeD } from "./three_d";
import { azimuth, rate1 } from "../conversion";

/**
 * 3D Auto (`01 70`): a source turning around the listener.
 * Parameters: 1 azimuth (where it stops), 2 speed (Rate1 column, turns per second), 3 clockwise, 4 turn, 15 output
 * (speaker, phones), 20 level. EFX control source 1 modulates the speed, source 2 switches the turning (in steps of
 * 64). Turned off, it runs on until it reaches the azimuth. The SC-88Pro honors the direction (SC-VA does not).
 * @internal
 */
export class GSThreeDAuto extends GSThreeD {
    public readonly type = 0x01_70;
    protected readonly defaults = new Uint8Array([
        0x40, 0x19, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f
    ]);
    protected readonly limits = { 2: 1, 3: 1, 14: 1 };
    public constructor(sampleRate: number) {
        super(sampleRate);
        this.reset();
    }

    protected level() {
        return this.parameters[19];
    }

    protected updatePosition() {
        const p = this.parameters;
        this.positioner.setAzimuth(azimuth(p[0]), this.resetting);
        this.positioner.setSpeed(rate1(this.controlled(0, 1)), p[2] === 1);
        const turning = Math.max(
            0,
            Math.min(1, p[3] + Math.trunc(this.controlOffset(1) / 64))
        );
        this.positioner.setTurning(turning === 1);
    }
}

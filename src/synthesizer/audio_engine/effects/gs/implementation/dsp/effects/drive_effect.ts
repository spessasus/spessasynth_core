import { GSEffect } from "../gs_effect";
import { levelGain, MONO_INPUT, shelfGain, STAGE_OUTPUT } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Drive, type DrivePreset } from "../blocks/drive";
import { AmpSimulator } from "../blocks/amp_simulator";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { MonoPan } from "../blocks/mono_pan";

/**
 * Overdrive and Distortion: `L+R -> drive -> amp simulator -> EQ -> pan`.
 * Parameters: 1 drive, 2 amp type, 3 amp switch, 17 low gain, 18 high gain, 19 pan, 20 level.
 * EFX control source 1 modulates the drive, source 2 the pan.
 * @internal
 */
export abstract class GSDriveEffect extends GSEffect {
    protected readonly limits = { 1: 3, 2: 1 };
    private readonly mix: MonoMix;
    private readonly drive: Drive;
    private readonly amp: AmpSimulator;
    private readonly shelves: ShelfEQ;
    private readonly pan: MonoPan;
    private ampOn = false;

    /**
     * @param sampleRate The sample rate.
     * @param preset The type's drive preset.
     */
    protected constructor(sampleRate: number, preset: DrivePreset) {
        super(sampleRate);
        this.mix = new MonoMix(sampleRate);
        this.drive = new Drive(sampleRate);
        this.drive.setPreset(preset);
        this.amp = new AmpSimulator(sampleRate);
        this.shelves = new ShelfEQ(sampleRate);
        this.pan = new MonoPan(sampleRate);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        for (let i = 0; i < sampleCount; i++) {
            let y = this.drive.process(
                this.mix.process(inputLeft[i], inputRight[i]) * MONO_INPUT
            );
            // The amp runs when it is switched off too, like on the hardware, so switching it on does not click
            const amp = this.amp.process(y);
            if (this.ampOn) y = amp;
            this.pan.process(this.shelves.process(y));
            outputLeft[i] = this.pan.left;
            outputRight[i] = this.pan.right;
        }
    }

    protected clear() {
        this.mix.clear();
        this.drive.clear();
        this.amp.clear();
        this.shelves.clear();
        this.pan.clear();
    }

    protected update() {
        const p = this.parameters;
        this.drive.setDrive(this.controlled(0, 0));
        this.amp.setType(p[1]);
        this.ampOn = p[2] === 1;
        this.shelves.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelves.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        this.pan.set(this.controlled(1, 18), levelGain(p[19]) * STAGE_OUTPUT);
    }
}

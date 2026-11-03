import { GSEffect } from "../gs_effect";
import { levelGain, MONO_INPUT, shelfGain, STAGE_OUTPUT } from "../glue";
import { MonoMix } from "../blocks/mono_mix";
import { Drive, HUMANIZER_DRIVE } from "../blocks/drive";
import { DC_BLOCKER_HZ, FirstOrderFilter } from "../blocks/first_order_filter";
import { FormantFilter } from "../blocks/formant_filter";
import { ShelfCorners, ShelfEQ } from "../blocks/shelf_eq";
import { MonoPan } from "../blocks/mono_pan";
import { slewTime } from "../conversion";

/**
 * Humanizer (`01 03`): `L+R -> drive (switchable) -> formant filter -> EQ -> pan`.
 * Parameters: 1 drive, 2 drive switch, 3 vowel (a, i, u, e, o), 4 accel, 17 low gain, 18 high gain, 19 pan,
 * 20 level. EFX control source 1 moves the vowel (up to 4 vowels either way), source 2 the level.
 * @internal
 */
export class GSHumanizer extends GSEffect {
    public readonly type = 0x01_03;
    protected readonly defaults = new Uint8Array([
        0x30, 0x01, 0x00, 0x7f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x40, 0x40, 0x40, 0x7f
    ]);
    protected readonly limits = { 1: 1, 2: 4 };
    private readonly mix: MonoMix;
    private readonly drive: Drive;
    /**
     * The drive's own DC blocker, for the path around it when the drive is off.
     */
    private readonly dcBlocker: FirstOrderFilter;
    private readonly formants: FormantFilter;
    private readonly shelves: ShelfEQ;
    private readonly pan: MonoPan;
    private driveOn = false;

    public constructor(sampleRate: number) {
        super(sampleRate);
        this.mix = new MonoMix(sampleRate);
        this.drive = new Drive(sampleRate);
        this.drive.setPreset(HUMANIZER_DRIVE);
        this.dcBlocker = new FirstOrderFilter(sampleRate);
        this.dcBlocker.setHighPass(DC_BLOCKER_HZ);
        this.formants = new FormantFilter(sampleRate);
        this.shelves = new ShelfEQ(sampleRate);
        this.pan = new MonoPan(sampleRate);
        this.reset();
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        sampleCount: number
    ) {
        for (let i = 0; i < sampleCount; i++) {
            const x =
                this.mix.process(inputLeft[i], inputRight[i]) * MONO_INPUT;
            // Both paths run, so the switch does not click
            const driven = this.drive.process(x);
            const dry = this.dcBlocker.process(x);
            this.pan.process(
                this.shelves.process(
                    this.formants.process(this.driveOn ? driven : dry)
                )
            );
            outputLeft[i] = this.pan.left;
            outputRight[i] = this.pan.right;
        }
    }

    protected clear() {
        this.mix.clear();
        this.drive.clear();
        this.dcBlocker.clear();
        this.formants.clear();
        this.shelves.clear();
        this.pan.clear();
    }

    protected update() {
        const p = this.parameters;
        this.drive.setDrive(p[0]);
        this.driveOn = p[1] === 1;
        this.formants.setAccel(slewTime(p[3]));
        this.formants.setVowel(
            Math.max(
                0,
                Math.min(
                    4,
                    p[2] + Math.trunc((this.controlOffset(0) * 5) / 128)
                )
            )
        );
        this.shelves.setLow(ShelfCorners.low200, shelfGain(p[16]));
        this.shelves.setHigh(ShelfCorners.high4k, shelfGain(p[17]));
        // The drive switch has one more 127/128
        this.pan.set(
            p[18],
            (levelGain(this.controlled(1, 19)) * STAGE_OUTPUT * 127) / 128
        );
    }
}

import { XGNoEffect } from "./dsp/no_effect";
import type { DefaultXGEffectProcessorConstructor } from "./dsp/effect_processor";
import { XGThru } from "./dsp/thru";
import { XGTremolo } from "./dsp/tremolo/tremolo";
import { XGAutoPan } from "./dsp/tremolo/auto_pan";
import { XGPhaser1 } from "./dsp/phaser/phaser1";
import { XGPhaser2 } from "./dsp/phaser/phaser2";
import { XGTwoBandEQ } from "./dsp/equalizer/two_band_eq";
import { XGAutoWah } from "./dsp/auto_wah/auto_wah";
import { XGThreeBandEQ } from "./dsp/equalizer/three_band_eq";
import { XGDistortion } from "./dsp/distortion/distortion";
import { XGOverdrive } from "./dsp/distortion/overdrive";
import { XGAmpSimulator } from "./dsp/distortion/amp_simulator";
import { XGSymphonic } from "./dsp/symphonic/symphonic";
import { XGRotarySpeaker } from "./dsp/rotary/rotary_speaker";
import { XGEarlyReflection1 } from "./dsp/early_reflections/early_reflection1";
import { XGEarlyReflection2 } from "./dsp/early_reflections/early_reflection2";
import { XGGateReverb } from "./dsp/early_reflections/gate_reverb";
import { XGReverseGate } from "./dsp/early_reflections/reverse_gate";
import { XGDelayLCR } from "./dsp/delay/delay_lcr";
import { XGDelayLR } from "./dsp/delay/delay_lr";
import { XGEcho } from "./dsp/delay/echo";
import { XGCrossDelay } from "./dsp/delay/cross_delay";
import { XGKaraoke1 } from "./dsp/karaoke/karaoke1";
import { XGKaraoke2 } from "./dsp/karaoke/karaoke2";
import { XGKaraoke3 } from "./dsp/karaoke/karaoke3";
import { XGHall1 } from "./dsp/reverb/hall1";
import { XGHall2 } from "./dsp/reverb/hall2";
import { XGPlate } from "./dsp/reverb/plate";
import { XGRoom1 } from "./dsp/reverb/room1";
import { XGRoom2 } from "./dsp/reverb/room2";
import { XGRoom3 } from "./dsp/reverb/room3";
import { XGStage1 } from "./dsp/reverb/stage1";
import { XGStage2 } from "./dsp/reverb/stage2";
import { XGCeleste1 } from "./dsp/chorus/celeste1";
import { XGCeleste2 } from "./dsp/chorus/celeste2";
import { XGCeleste3 } from "./dsp/chorus/celeste3";
import { XGCeleste4 } from "./dsp/chorus/celeste4";
import { XGChorus1 } from "./dsp/chorus/chorus1";
import { XGChorus2 } from "./dsp/chorus/chorus2";
import { XGChorus3 } from "./dsp/chorus/chorus3";
import { XGChorus4 } from "./dsp/chorus/chorus4";
import { XGFlanger1 } from "./dsp/chorus/flanger1";
import { XGFlanger2 } from "./dsp/chorus/flanger2";
import { XGFlanger3 } from "./dsp/chorus/flanger3";
import { DefaultXGSystemEffect } from "./system_effect";
import type {
    XGVariationBlock,
    XGVariationBlockSnapshot
} from "../interface/xg_variation_block";

const VARIATION_MAP = new Map<number, DefaultXGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect],
    [0x01_00, XGHall1],
    [0x01_01, XGHall2],
    [0x02_00, XGRoom1],
    [0x02_01, XGRoom2],
    [0x02_02, XGRoom3],
    [0x03_00, XGStage1],
    [0x03_01, XGStage2],
    [0x04_00, XGPlate],
    [0x05_00, XGDelayLCR],
    [0x06_00, XGDelayLR],
    [0x07_00, XGEcho],
    [0x08_00, XGCrossDelay],
    [0x09_00, XGEarlyReflection1],
    [0x09_01, XGEarlyReflection2],
    [0x0a_00, XGGateReverb],
    [0x0b_00, XGReverseGate],
    [0x14_00, XGKaraoke1],
    [0x14_01, XGKaraoke2],
    [0x14_02, XGKaraoke3],
    [0x40_00, XGThru],
    [0x41_00, XGChorus1],
    [0x41_01, XGChorus2],
    [0x41_02, XGChorus3],
    [0x41_08, XGChorus4],
    [0x42_00, XGCeleste1],
    [0x42_01, XGCeleste2],
    [0x42_02, XGCeleste3],
    [0x42_08, XGCeleste4],
    [0x43_00, XGFlanger1],
    [0x43_01, XGFlanger2],
    [0x43_08, XGFlanger3],
    [0x44_00, XGSymphonic],
    [0x45_00, XGRotarySpeaker],
    [0x46_00, XGTremolo],
    [0x47_00, XGAutoPan],
    [0x48_00, XGPhaser1],
    [0x48_08, XGPhaser2],
    [0x49_00, XGDistortion],
    [0x4a_00, XGOverdrive],
    [0x4b_00, XGAmpSimulator],
    [0x4c_00, XGThreeBandEQ],
    [0x4d_00, XGTwoBandEQ],
    [0x4e_00, XGAutoWah]
]);

/**
 * The default implementation for {@link XGVariationBlock}.
 *
 * @group Synthesizer.XG Effects
 * @sealed
 */
export class DefaultXGVariation
    extends DefaultXGSystemEffect
    implements XGVariationBlock
{
    public insertionMode = true;

    public partNumber = 127;

    public sendToReverb = 0;

    public sendToChorus = 0;

    /**
     * Constructs a new default XG variation processor.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Attempting to `.process()` more samples than this will result in an error.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        super(VARIATION_MAP, XGThru, 0x05_00, sampleRate, maxBufferSize, true);
    }

    public reset() {
        super.reset();
        this.insertionMode = true;
        this.partNumber = 127;
        this.sendToReverb = 0;
        this.sendToChorus = 0;
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        chorusLeft: Float32Array,
        chorusRight: Float32Array,
        reverbLeft: Float32Array,
        reverbRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        this.processor.process(
            inputLeft,
            inputRight,
            this.outputLeft,
            this.outputRight,
            sampleCount,
            false
        );
        this.mixSystemEffect(outputLeft, outputRight, startIndex, sampleCount);

        // Variation gets sent to chorus/reverb regardless of return,
        // For example, even at 0 and part having only variation applied,
        // The reverb still sounds with variation to reverb being 127.

        // Common scenario
        if (this.sendToReverb > 0) {
            const gain = this.sendToReverb / 64;

            for (let i = 0; i < sampleCount; i++) {
                reverbLeft[i] += this.outputLeft[i] * gain;
                reverbRight[i] += this.outputRight[i] * gain;
            }
        }
        if (this.sendToChorus > 0) {
            const gain = this.sendToChorus / 64;

            for (let i = 0; i < sampleCount; i++) {
                chorusLeft[i] += this.outputLeft[i] * gain;
                chorusRight[i] += this.outputRight[i] * gain;
            }
        }
    }

    public processInsertion(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        sampleCount: number
    ) {
        this.processor.process(
            inputLeft,
            inputRight,
            this.outputLeft,
            this.outputRight,
            sampleCount,
            true
        );
        // Variation in system mode ignores sends
        // See MU128 manual page 154
        inputLeft.set(this.outputLeft.subarray(0, sampleCount));
        inputRight.set(this.outputRight.subarray(0, sampleCount));
    }

    public getSnapshot() {
        return {
            ...super.getSnapshot(),
            insertionMode: this.insertionMode,
            partNumber: this.partNumber,
            sendToReverb: this.sendToReverb,
            sendToChorus: this.sendToChorus
        };
    }

    public applySnapshot(snapshot: XGVariationBlockSnapshot) {
        super.applySnapshot(snapshot);
        this.insertionMode = snapshot.insertionMode;
        this.partNumber = snapshot.partNumber;
        this.sendToReverb = snapshot.sendToReverb;
        this.sendToChorus = snapshot.sendToChorus;
    }
}

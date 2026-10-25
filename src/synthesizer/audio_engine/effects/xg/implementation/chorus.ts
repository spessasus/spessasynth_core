import { XGNoEffect } from "./dsp/no_effect";
import type { DefaultXGEffectProcessorConstructor } from "./dsp/effect_processor";
import { DefaultXGSystemEffect } from "./system_effect";
import { XGCeleste1 } from "./dsp/chorus/celeste1";
import { XGCeleste2 } from "./dsp/chorus/celeste2";
import { XGCeleste3 } from "./dsp/chorus/celeste3";
import { XGCeleste4 } from "./dsp/chorus/celeste4";
import { XGChorus1 } from "./dsp/chorus/chorus1";
import { XGChorus2 } from "./dsp/chorus/chorus2";
import { XGChorus3 } from "./dsp/chorus/chorus3";
import { XGChorus4 } from "./dsp/chorus/chorus4";
import { XGFBChorus } from "./dsp/chorus/fb_chorus";
import { XGFlanger1 } from "./dsp/chorus/flanger1";
import { XGFlanger2 } from "./dsp/chorus/flanger2";
import { XGFlanger3 } from "./dsp/chorus/flanger3";
import { XGGMChorus1 } from "./dsp/chorus/gm_chorus1";
import { XGGMChorus2 } from "./dsp/chorus/gm_chorus2";
import { XGGMChorus3 } from "./dsp/chorus/gm_chorus3";
import { XGGMChorus4 } from "./dsp/chorus/gm_chorus4";
import { XGGMFlanger } from "./dsp/chorus/gm_flanger";
import type {
    XGChorusBlock,
    XGChorusBlockSnapshot
} from "../interface/xg_chorus_block";

const CHORUS_MAP = new Map<number, DefaultXGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect],
    [0x41_00, XGChorus1],
    [0x41_01, XGChorus2],
    [0x41_02, XGChorus3],
    [0x41_03, XGGMChorus1],
    [0x41_04, XGGMChorus2],
    [0x41_05, XGGMChorus3],
    [0x41_06, XGGMChorus4],
    [0x41_07, XGFBChorus],
    [0x41_08, XGChorus4],
    [0x42_00, XGCeleste1],
    [0x42_01, XGCeleste2],
    [0x42_02, XGCeleste3],
    [0x42_08, XGCeleste4],
    [0x43_00, XGFlanger1],
    [0x43_01, XGFlanger2],
    [0x43_07, XGGMFlanger],
    [0x43_08, XGFlanger3]
]);

/**
 * The default implementation for {@link XGChorusBlock}.
 *
 * @group Synthesizer.XG Effects
 * @sealed
 */
export class DefaultXGChorus
    extends DefaultXGSystemEffect
    implements XGChorusBlock
{
    public sendToReverb = 0;

    /**
     * Constructs a new default XG chorus processor.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Attempting to `.process()` more samples than this will result in an error.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        super(
            CHORUS_MAP,
            XGNoEffect,
            0x41_00,
            sampleRate,
            maxBufferSize,
            false
        );
    }

    public reset() {
        super.reset();
        this.sendToReverb = 0;
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
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
        // Chorus gets sent to reverb regardless of return,
        // Even at 0 and part having only chorus applied,
        // The reverb still sounds with chorus to reverb being 127.
        // Tested on MU2K

        // Common scenario
        if (this.sendToReverb === 0) return;
        const gain = this.sendToReverb / 64;

        for (let i = 0; i < sampleCount; i++) {
            reverbLeft[i] += this.outputLeft[i] * gain;
            reverbRight[i] += this.outputRight[i] * gain;
        }
    }

    public getSnapshot() {
        return {
            ...super.getSnapshot(),
            sendToReverb: this.sendToReverb
        };
    }

    public applySnapshot(snapshot: XGChorusBlockSnapshot) {
        super.applySnapshot(snapshot);
        this.sendToReverb = snapshot.sendToReverb;
    }
}

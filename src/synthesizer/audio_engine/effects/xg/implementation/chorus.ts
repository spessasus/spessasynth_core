import { XGNoEffect } from "./dsp/no_effect";
import type { XGEffectProcessorConstructor } from "./dsp/effect_processor";
import { DefaultXGSystemEffect } from "./system_effect";
import type {
    XGChorusBlock,
    XGChorusBlockSnapshot
} from "../interface/xg_chorus_block";

const CHORUS_MAP = new Map<number, XGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect]
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
        super(CHORUS_MAP, XGNoEffect, 0x41_00, sampleRate, maxBufferSize);
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

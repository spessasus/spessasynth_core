import type {
    GSInsertionBlock,
    GSInsertionBlockSnapshot
} from "../interface/gs_insertion_block";
import type { DefaultGSInsertionProcessor } from "./dsp/insertion_processor";
import { GSThru } from "./dsp/effects/thru";
import { GS_EFFECT_LIST } from "./dsp/effect_list";
import { DelayMemory } from "./dsp/blocks/delay_memory";
import { EFX_SENDS_GAIN_CORRECTION } from "../../../synth_constants";
import { SpessaLog } from "../../../../../utils/loggin";
import { GSInsertionControlSources } from "../../../../enums";

/**
 * The amount of EFX parameters.
 */
const PARAMETER_COUNT = 20;

/**
 * Default send level to reverb, for every EFX type.
 */
const DEFAULT_SEND_LEVEL_TO_REVERB = 40;

/**
 * The default EFX control depth (0%).
 */
const DEFAULT_CONTROL_DEPTH = 64;

/**
 * The offset an EFX control source adds to its parameter, like Sound Canvas VA computes it:
 * `(depth - 64) * value / 63`, truncated and stored in a signed byte. Depth 0 counts as 1 (both are -100%).
 * The byte wraps without a clamp, like in SCCore.dll: pitch bend fully down (-128) at depth 0 or 1 gives +128,
 * which is stored as -128, so the offset flips sign there.
 * @param depth The control depth (0-127).
 * @param value The signed controller value.
 * @returns The signed offset (-128 to 127).
 */
function controlOffset(depth: number, value: number) {
    const amount = (depth === 0 ? 1 : depth) - 64;
    return (Math.trunc((amount * value) / 63) << 24) >> 24;
}

/**
 * The default implementation for {@link GSInsertionBlock}.
 *
 * @group Synthesizer.GS Effects
 * @sealed
 */
export class DefaultGSInsertion implements GSInsertionBlock {
    public sendLevelToReverb = DEFAULT_SEND_LEVEL_TO_REVERB;
    public sendLevelToChorus = 0;
    public sendLevelToDelay = 0;
    public controlSource1: number = GSInsertionControlSources.off;
    public controlDepth1 = DEFAULT_CONTROL_DEPTH;
    public controlSource2: number = GSInsertionControlSources.off;
    public controlDepth2 = DEFAULT_CONTROL_DEPTH;
    /**
     * The last controller values of both control sources (signed, pitch bend is centered).
     */
    private readonly controlValues = new Int8Array(2);
    /**
     * The list of effects available in this block.
     * Effect type: processor.
     */
    private readonly effectMap = new Map<number, DefaultGSInsertionProcessor>();
    /**
     * The processor used when the requested type is not available.
     */
    private readonly fallbackProcessor: DefaultGSInsertionProcessor;
    /**
     * The currently used processor.
     */
    private processor: DefaultGSInsertionProcessor;
    /**
     * The requested EFX type.
     */
    private type = 0;
    /**
     * The parameters set since the last type change.
     * 255 means the parameter uses the type default.
     */
    private readonly params = new Uint8Array(PARAMETER_COUNT).fill(255);
    /**
     * The left output of the processor.
     */
    private readonly outputLeft;
    /**
     * The right output of the processor.
     */
    private readonly outputRight;

    /**
     * Constructs a new default GS insertion block.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Processing more samples than this is not supported and produces undefined output.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        // The types run at the host rate and share one delay memory (only one runs at a time)
        const memory = new DelayMemory();
        this.fallbackProcessor = new GSThru(sampleRate);
        for (const Constructor of GS_EFFECT_LIST) {
            // The fallback is already a Thru
            if (Constructor === GSThru) continue;
            const processor = new Constructor(sampleRate, memory);
            this.effectMap.set(processor.type, processor);
        }
        // The fallback handles type 0 and any unsupported type
        this.effectMap.set(this.fallbackProcessor.type, this.fallbackProcessor);
        this.processor = this.fallbackProcessor;
        this.outputLeft = new Float32Array(maxBufferSize);
        this.outputRight = new Float32Array(maxBufferSize);
        this.reset();
    }

    public setType(type: number) {
        this.type = type;
        const processor = this.effectMap.get(type);
        if (processor === undefined) {
            SpessaLog.gsFail("EFX Processor", [type], "Using Thru.");
        }
        this.processor = processor ?? this.fallbackProcessor;
        // The control offsets carry over to the new type
        // They go in before the reset, which settles the rotary rotors at the speed they select
        this.updateControl();
        this.processor.reset();
        this.params.fill(255);
        this.sendLevelToReverb = DEFAULT_SEND_LEVEL_TO_REVERB;
        this.sendLevelToChorus = 0;
        this.sendLevelToDelay = 0;
    }

    public getType() {
        return this.type;
    }

    public reset() {
        this.controlSource1 = GSInsertionControlSources.off;
        this.controlDepth1 = DEFAULT_CONTROL_DEPTH;
        this.controlSource2 = GSInsertionControlSources.off;
        this.controlDepth2 = DEFAULT_CONTROL_DEPTH;
        this.controlValues.fill(0);
        this.setType(0);
    }

    public setControllerValue(source: number, value: number) {
        // Only control changes 1-95, channel pressure and pitch bend can be sources
        if (
            (source < 1 || source > 95) &&
            source !== GSInsertionControlSources.channelPressure &&
            source !== GSInsertionControlSources.pitchBend
        ) {
            return;
        }
        const signed =
            source === GSInsertionControlSources.pitchBend
                ? (value - 8192) >> 6
                : value;
        let matched = false;
        if (source === this.controlSource1) {
            this.controlValues[0] = signed;
            matched = true;
        }
        if (source === this.controlSource2) {
            this.controlValues[1] = signed;
            matched = true;
        }
        // The current depths apply from the next matching controller on, like in Sound Canvas VA
        if (matched) this.updateControl();
    }

    public setParameter(param: number, value: number) {
        this.params[param] = value;
        this.processor.setParameter(param, value);
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        outputReverb: Float32Array,
        outputChorus: Float32Array,
        outputDelay: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        const processedLeft = this.outputLeft;
        const processedRight = this.outputRight;
        this.processor.process(
            inputLeft,
            inputRight,
            processedLeft,
            processedRight,
            sampleCount
        );

        const toReverb =
            (this.sendLevelToReverb / 127) * EFX_SENDS_GAIN_CORRECTION;
        const toChorus =
            (this.sendLevelToChorus / 127) * EFX_SENDS_GAIN_CORRECTION;
        const toDelay =
            (this.sendLevelToDelay / 127) * EFX_SENDS_GAIN_CORRECTION;
        for (let i = 0; i < sampleCount; i++) {
            const l = processedLeft[i];
            const r = processedRight[i];
            const idx = startIndex + i;
            outputLeft[idx] += l;
            outputRight[idx] += r;
            // The sends are mono
            const mono = (l + r) * 0.5;
            outputReverb[i] += mono * toReverb;
            outputChorus[i] += mono * toChorus;
            outputDelay[i] += mono * toDelay;
        }
    }

    public getSnapshot(): GSInsertionBlockSnapshot {
        return {
            type: this.type,
            params: this.params.slice(),
            sendLevelToReverb: this.sendLevelToReverb,
            sendLevelToChorus: this.sendLevelToChorus,
            sendLevelToDelay: this.sendLevelToDelay,
            controlSource1: this.controlSource1,
            controlDepth1: this.controlDepth1,
            controlSource2: this.controlSource2,
            controlDepth2: this.controlDepth2,
            controlValues: [this.controlValues[0], this.controlValues[1]]
        };
    }

    public applySnapshot(snapshot: GSInsertionBlockSnapshot) {
        // Snapshots from versions without EFX control keep the defaults
        this.controlSource1 =
            snapshot.controlSource1 ?? GSInsertionControlSources.off;
        this.controlDepth1 = snapshot.controlDepth1 ?? DEFAULT_CONTROL_DEPTH;
        this.controlSource2 =
            snapshot.controlSource2 ?? GSInsertionControlSources.off;
        this.controlDepth2 = snapshot.controlDepth2 ?? DEFAULT_CONTROL_DEPTH;
        this.controlValues[0] = snapshot.controlValues?.[0] ?? 0;
        this.controlValues[1] = snapshot.controlValues?.[1] ?? 0;
        this.setType(snapshot.type);
        const params = snapshot.params;
        for (let i = 0; i < PARAMETER_COUNT && i < params.length; i++) {
            if (params[i] !== 255) this.setParameter(i, params[i]);
        }
        this.sendLevelToReverb = snapshot.sendLevelToReverb;
        this.sendLevelToChorus = snapshot.sendLevelToChorus;
        this.sendLevelToDelay = snapshot.sendLevelToDelay;
    }

    /**
     * Sends the offsets of both control sources to the processor.
     */
    private updateControl() {
        this.processor.setControl(
            controlOffset(this.controlDepth1, this.controlValues[0]),
            controlOffset(this.controlDepth2, this.controlValues[1])
        );
    }
}

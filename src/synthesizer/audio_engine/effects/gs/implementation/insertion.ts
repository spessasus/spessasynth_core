import type {
    GSInsertionBlock,
    GSInsertionBlockSnapshot
} from "../interface/gs_insertion_block";
import type {
    DefaultGSInsertionProcessor,
    DefaultGSInsertionProcessorConstructor
} from "./insertion/insertion_processor";
import { ThruFX } from "./insertion/thru";
import { StereoEQFX } from "./insertion/stereo_eq";
import { PhaserFX } from "./insertion/phaser";
import { AutoPanFX } from "./insertion/auto_pan";
import { AutoWahFX } from "./insertion/auto_wah";
import { PhAutoWahFX } from "./insertion/ph_auto_wah";
import { TremoloFX } from "./insertion/tremolo";
import { EFX_SENDS_GAIN_CORRECTION } from "../../../synth_constants";
import { SpessaLog } from "../../../../../utils/loggin";

const INSERTION_LIST: DefaultGSInsertionProcessorConstructor[] = [
    ThruFX,
    StereoEQFX,
    PhaserFX,
    AutoPanFX,
    AutoWahFX,
    PhAutoWahFX,
    TremoloFX
];

/**
 * The amount of EFX parameters.
 */
const PARAMETER_COUNT = 20;

/**
 * Default send level to reverb, for every EFX type.
 */
const DEFAULT_SEND_LEVEL_TO_REVERB = 40;

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
    /**
     * The list of effects available in this block.
     * Effect type: processor.
     */
    private readonly effectMap = new Map<number, DefaultGSInsertionProcessor>();
    /**
     * The processor used when the requested type is not available.
     */
    private readonly fallbackProcessor = new ThruFX();
    /**
     * The currently used processor.
     */
    private processor: DefaultGSInsertionProcessor = this.fallbackProcessor;
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
     * Attempting to `.process()` more samples than this will result in an error.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        for (const constructor of INSERTION_LIST) {
            const processor = new constructor(sampleRate, maxBufferSize);
            this.effectMap.set(processor.type, processor);
        }
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
        this.setType(0);
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
            sendLevelToDelay: this.sendLevelToDelay
        };
    }

    public applySnapshot(snapshot: GSInsertionBlockSnapshot) {
        this.setType(snapshot.type);
        const params = snapshot.params;
        for (let i = 0; i < PARAMETER_COUNT && i < params.length; i++) {
            if (params[i] !== 255) this.setParameter(i, params[i]);
        }
        this.sendLevelToReverb = snapshot.sendLevelToReverb;
        this.sendLevelToChorus = snapshot.sendLevelToChorus;
        this.sendLevelToDelay = snapshot.sendLevelToDelay;
    }
}

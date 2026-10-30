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
 * Converts a 7-bit send level into the gain used by the processors.
 * @param value The 7-bit send level.
 */
function sendGain(value: number) {
    return (value / 127) * EFX_SENDS_GAIN_CORRECTION;
}

/**
 * The default implementation for {@link GSInsertionBlock}.
 *
 * @group Synthesizer.GS Effects
 * @sealed
 */
export class DefaultGSInsertion implements GSInsertionBlock {
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
        this.reset();
    }

    private _sendLevelToReverb = DEFAULT_SEND_LEVEL_TO_REVERB;

    public get sendLevelToReverb() {
        return this._sendLevelToReverb;
    }

    public set sendLevelToReverb(value: number) {
        this._sendLevelToReverb = value;
        this.processor.sendLevelToReverb = sendGain(value);
    }

    private _sendLevelToChorus = 0;

    public get sendLevelToChorus() {
        return this._sendLevelToChorus;
    }

    public set sendLevelToChorus(value: number) {
        this._sendLevelToChorus = value;
        this.processor.sendLevelToChorus = sendGain(value);
    }

    private _sendLevelToDelay = 0;

    public get sendLevelToDelay() {
        return this._sendLevelToDelay;
    }

    public set sendLevelToDelay(value: number) {
        this._sendLevelToDelay = value;
        this.processor.sendLevelToDelay = sendGain(value);
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
        // The setters also apply the send levels to the new processor
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
        // The processors use the GS addresses, EFX parameter 1 is 0x03
        this.processor.setParameter(param + 0x03, value);
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
        this.processor.process(
            inputLeft,
            inputRight,
            outputLeft,
            outputRight,
            outputReverb,
            outputChorus,
            outputDelay,
            startIndex,
            sampleCount
        );
    }

    public getSnapshot(): GSInsertionBlockSnapshot {
        return {
            type: this.type,
            params: this.params.slice(),
            sendLevelToReverb: this._sendLevelToReverb,
            sendLevelToChorus: this._sendLevelToChorus,
            sendLevelToDelay: this._sendLevelToDelay
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

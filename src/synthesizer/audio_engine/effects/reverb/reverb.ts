import type { ReverbProcessor } from "../types";
import { DattorroReverb } from "./dattorro";

export class SpessaSynthReverb implements ReverbProcessor {
    public character = 0;
    public time = 0;
    public delayFeedback = 0;
    private readonly dattorro;
    private readonly sampleRate;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.dattorro = new DattorroReverb(sampleRate);
    }

    private _preDelayTime = 0;

    public get preDelayTime(): number {
        return this._preDelayTime;
    }

    public set preDelayTime(value: number) {
        this._preDelayTime = value;
        // Predelay is literally the value in ms
        this.dattorro.preDelay = value * (this.sampleRate / 1000);
    }

    private _level = 0;

    public get level(): number {
        return this._level;
    }

    public set level(value: number) {
        this._level = value;
        this.dattorro.gain = value / 64;
    }

    private _preLowpass = 0;

    public get preLowpass(): number {
        return this._preLowpass;
    }

    public set preLowpass(value: number) {
        this._preLowpass = value;
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ) {
        if (this.character < 6) {
            this.dattorro.process(
                input,
                outputLeft,
                outputRight,
                startIndex,
                endIndex
            );
        }
    }
}

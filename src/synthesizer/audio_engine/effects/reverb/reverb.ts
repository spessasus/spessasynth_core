import type { ReverbProcessor } from "../types";
import { DattorroReverb } from "./dattorro";

export class SpessaSynthReverb implements ReverbProcessor {
    public delayFeedback = 0;
    private readonly dattorro;
    private readonly sampleRate;

    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.dattorro = new DattorroReverb(sampleRate);
    }

    private _character = 0;

    public get character(): number {
        return this._character;
    }

    public set character(value: number) {
        this._character = value;
        this.dattorro.damping = 0.005;
        switch (value) {
            default: {
                // Room1, dampened
                this.dattorro.damping = 0.5;
                break;
            }

            case 1: {
                // Room2
                this.dattorro.damping = 0.001;
                break;
            }
        }
    }

    private _time = 0;

    public get time(): number {
        return this._time;
    }

    public set time(value: number) {
        const t = value / 127;
        this.dattorro.decay = 0.25 + 0.55 * t ** 1.8;
        this._time = value;
    }

    private _preDelayTime = 0;

    public get preDelayTime(): number {
        return this._preDelayTime;
    }

    public set preDelayTime(value: number) {
        this._preDelayTime = value;
        // Predelay is 0-100 ms despite docs saying otherwise
        this.dattorro.preDelay = (value / 1.27) * (this.sampleRate / 1000);
    }

    private _level = 0;

    public get level(): number {
        return this._level;
    }

    public set level(value: number) {
        this._level = value;
        this.dattorro.gain = (value / 127) ** 2;
    }

    private _preLowpass = 0;

    public get preLowpass(): number {
        return this._preLowpass;
    }

    public set preLowpass(value: number) {
        this.dattorro.preLPF = 0.05 + (7 - value) / 22;
        this._preLowpass = value;
    }

    public process(
        input: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        endIndex: number
    ) {
        if (this._character < 6) {
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

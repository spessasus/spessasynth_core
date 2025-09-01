import {
    type DLSSource,
    DLSSources,
    type DLSTransform,
    modulatorCurveTypes,
    type ModulatorSourceEnum,
    modulatorSources
} from "../enums";
import { ModulatorSource } from "../basic_soundbank/modulator_source";
import { type MIDIController, midiControllers } from "../../midi/enums";
import type { ModulatorSourceIndex } from "../types";

export class ConnectionSource {
    public source: DLSSource;
    public transform: DLSTransform;
    public bipolar: boolean;
    public invert: boolean;

    public constructor(
        source: DLSSource = DLSSources.none,
        transform: DLSTransform = modulatorCurveTypes.linear,
        bipolar = false,
        invert = false
    ) {
        this.source = source;
        this.transform = transform;
        this.bipolar = bipolar;
        this.invert = invert;
    }

    private get sourceName() {
        return (
            Object.keys(DLSSources).find(
                (k) => DLSSources[k as keyof typeof DLSSources] === this.source
            ) ?? this.source.toString()
        );
    }

    private get transformName() {
        return (
            Object.keys(modulatorCurveTypes).find(
                (k) =>
                    modulatorCurveTypes[
                        k as keyof typeof modulatorCurveTypes
                    ] === this.transform
            ) ?? this.transform.toString()
        );
    }

    public static fromSFSource(
        source: ModulatorSource
    ): ConnectionSource | undefined {
        let sourceEnum: DLSSource | undefined = undefined;
        if (source.isCC) {
            // DLS only supports a specific set of controllers
            switch (source.index as MIDIController) {
                case midiControllers.modulationWheel:
                    sourceEnum = DLSSources.modulationWheel;
                    break;

                case midiControllers.mainVolume:
                    sourceEnum = DLSSources.volume;
                    break;

                case midiControllers.pan:
                    sourceEnum = DLSSources.pan;
                    break;

                case midiControllers.expressionController:
                    sourceEnum = DLSSources.expression;
                    break;

                case midiControllers.chorusDepth:
                    sourceEnum = DLSSources.chorus;
                    break;

                case midiControllers.reverbDepth:
                    sourceEnum = DLSSources.reverb;
                    break;
            }
        } else {
            switch (source.index as ModulatorSourceEnum) {
                case modulatorSources.noController:
                    sourceEnum = DLSSources.none;
                    break;

                case modulatorSources.noteOnKeyNum:
                    sourceEnum = DLSSources.keyNum;
                    break;

                case modulatorSources.noteOnVelocity:
                    sourceEnum = DLSSources.velocity;
                    break;

                case modulatorSources.pitchWheel:
                    sourceEnum = DLSSources.pitchWheel;
                    break;

                case modulatorSources.pitchWheelRange:
                    sourceEnum = DLSSources.pitchWheelRange;
                    break;

                case modulatorSources.polyPressure:
                    sourceEnum = DLSSources.polyPressure;
                    break;

                case modulatorSources.channelPressure:
                    sourceEnum = DLSSources.channelPressure;
            }
        }
        // Unable to convert into DLS
        if (sourceEnum === undefined) {
            return undefined;
        }

        return new ConnectionSource(
            sourceEnum,
            source.curveType,
            source.isBipolar,
            source.isNegative
        );
    }

    public toString() {
        return `${this.sourceName} ${this.transformName} ${this.bipolar ? "bipolar" : "unipolar"} ${this.invert ? "inverted" : "positive"}`;
    }

    public toTransformFlag() {
        return (
            this.transform |
            ((this.bipolar ? 1 : 0) << 4) |
            ((this.invert ? 1 : 0) << 5)
        );
    }

    public toSFSource(): ModulatorSource | undefined {
        let sourceEnum: ModulatorSourceIndex | undefined = undefined;
        let isCC = false;
        switch (this.source) {
            default:
            case DLSSources.modLfo:
            case DLSSources.vibratoLfo:
            case DLSSources.coarseTune:
            case DLSSources.fineTune:
            case DLSSources.modEnv:
                return undefined; // Cannot be this in sf2

            case DLSSources.keyNum:
                sourceEnum = modulatorSources.noteOnKeyNum;
                break;
            case DLSSources.none:
                sourceEnum = modulatorSources.noController;
                break;
            case DLSSources.modulationWheel:
                sourceEnum = midiControllers.modulationWheel;
                isCC = true;
                break;
            case DLSSources.pan:
                sourceEnum = midiControllers.pan;
                isCC = true;
                break;
            case DLSSources.reverb:
                sourceEnum = midiControllers.reverbDepth;
                isCC = true;
                break;
            case DLSSources.chorus:
                sourceEnum = midiControllers.chorusDepth;
                isCC = true;
                break;
            case DLSSources.expression:
                sourceEnum = midiControllers.expressionController;
                isCC = true;
                break;
            case DLSSources.volume:
                sourceEnum = midiControllers.mainVolume;
                isCC = true;
                break;
            case DLSSources.velocity:
                sourceEnum = modulatorSources.noteOnVelocity;
                break;
            case DLSSources.polyPressure:
                sourceEnum = modulatorSources.polyPressure;
                break;
            case DLSSources.channelPressure:
                sourceEnum = modulatorSources.channelPressure;
                break;
            case DLSSources.pitchWheel:
                sourceEnum = modulatorSources.pitchWheel;
                break;
            case DLSSources.pitchWheelRange:
                sourceEnum = modulatorSources.pitchWheelRange;
                break;
        }
        if (sourceEnum === undefined) {
            return undefined;
        }

        return new ModulatorSource(
            sourceEnum,
            this.transform,
            isCC,
            this.bipolar,
            this.invert
        );
    }
}

import {
    type ModulatorControllerSource,
    ModulatorControllerSources,
    ModulatorCurveTypes
} from "../enums";
import { ModulatorSource } from "../basic_soundbank/modulator_source";
import { MIDIControllers } from "../../midi/enums";
import type { ModulatorSourceIndex } from "../types";
import { type DLSSource, DLSSources, type DLSTransform } from "./enums";

export class ConnectionSource {
    public source: DLSSource;
    public transform: DLSTransform;
    public bipolar: boolean;
    public invert: boolean;

    public constructor(
        source: DLSSource = DLSSources.none,
        transform: DLSTransform = ModulatorCurveTypes.linear,
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
            Object.keys(ModulatorCurveTypes).find(
                (k) =>
                    ModulatorCurveTypes[
                        k as keyof typeof ModulatorCurveTypes
                    ] === this.transform
            ) ?? this.transform.toString()
        );
    }

    public static copyFrom(inputSource: ConnectionSource) {
        return new ConnectionSource(
            inputSource.source,
            inputSource.transform,
            inputSource.bipolar,
            inputSource.invert
        );
    }

    public static fromSFSource(
        source: ModulatorSource
    ): ConnectionSource | undefined {
        let sourceEnum: DLSSource | undefined = undefined;
        if (source.isCC) {
            // DLS only supports a specific set of controllers
            switch (source.index) {
                case MIDIControllers.modulationWheel: {
                    sourceEnum = DLSSources.modulationWheel;
                    break;
                }

                case MIDIControllers.mainVolume: {
                    sourceEnum = DLSSources.volume;
                    break;
                }

                case MIDIControllers.pan: {
                    sourceEnum = DLSSources.pan;
                    break;
                }

                case MIDIControllers.expressionController: {
                    sourceEnum = DLSSources.expression;
                    break;
                }

                case MIDIControllers.chorusDepth: {
                    sourceEnum = DLSSources.chorus;
                    break;
                }

                case MIDIControllers.reverbDepth: {
                    sourceEnum = DLSSources.reverb;
                    break;
                }
            }
        } else {
            switch (source.index as ModulatorControllerSource) {
                case ModulatorControllerSources.noController: {
                    sourceEnum = DLSSources.none;
                    break;
                }

                case ModulatorControllerSources.noteOnKeyNum: {
                    sourceEnum = DLSSources.keyNum;
                    break;
                }

                case ModulatorControllerSources.noteOnVelocity: {
                    sourceEnum = DLSSources.velocity;
                    break;
                }

                case ModulatorControllerSources.pitchWheel: {
                    sourceEnum = DLSSources.pitchWheel;
                    break;
                }

                case ModulatorControllerSources.pitchWheelRange: {
                    sourceEnum = DLSSources.pitchWheelRange;
                    break;
                }

                case ModulatorControllerSources.polyPressure: {
                    sourceEnum = DLSSources.polyPressure;
                    break;
                }

                case ModulatorControllerSources.channelPressure: {
                    sourceEnum = DLSSources.channelPressure;
                }
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
        let sourceEnum: ModulatorSourceIndex | undefined;
        let isCC = false;
        switch (this.source) {
            default:
            case DLSSources.modLfo:
            case DLSSources.vibratoLfo:
            case DLSSources.coarseTune:
            case DLSSources.fineTune:
            case DLSSources.modEnv: {
                return undefined;
            } // Cannot be this in sf2

            case DLSSources.keyNum: {
                sourceEnum = ModulatorControllerSources.noteOnKeyNum;
                break;
            }
            case DLSSources.none: {
                sourceEnum = ModulatorControllerSources.noController;
                break;
            }
            case DLSSources.modulationWheel: {
                sourceEnum = MIDIControllers.modulationWheel;
                isCC = true;
                break;
            }
            case DLSSources.pan: {
                sourceEnum = MIDIControllers.pan;
                isCC = true;
                break;
            }
            case DLSSources.reverb: {
                sourceEnum = MIDIControllers.reverbDepth;
                isCC = true;
                break;
            }
            case DLSSources.chorus: {
                sourceEnum = MIDIControllers.chorusDepth;
                isCC = true;
                break;
            }
            case DLSSources.expression: {
                sourceEnum = MIDIControllers.expressionController;
                isCC = true;
                break;
            }
            case DLSSources.volume: {
                sourceEnum = MIDIControllers.mainVolume;
                isCC = true;
                break;
            }
            case DLSSources.velocity: {
                sourceEnum = ModulatorControllerSources.noteOnVelocity;
                break;
            }
            case DLSSources.polyPressure: {
                sourceEnum = ModulatorControllerSources.polyPressure;
                break;
            }
            case DLSSources.channelPressure: {
                sourceEnum = ModulatorControllerSources.channelPressure;
                break;
            }
            case DLSSources.pitchWheel: {
                sourceEnum = ModulatorControllerSources.pitchWheel;
                break;
            }
            case DLSSources.pitchWheelRange: {
                sourceEnum = ModulatorControllerSources.pitchWheelRange;
                break;
            }
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

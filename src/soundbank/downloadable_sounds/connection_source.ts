import {
    type DLSSource,
    dlsSources,
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
        source: DLSSource = dlsSources.none,
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
            Object.keys(dlsSources).find(
                (k) => dlsSources[k as keyof typeof dlsSources] === this.source
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
            switch (source.index as MIDIController) {
                case midiControllers.modulationWheel: {
                    sourceEnum = dlsSources.modulationWheel;
                    break;
                }

                case midiControllers.mainVolume: {
                    sourceEnum = dlsSources.volume;
                    break;
                }

                case midiControllers.pan: {
                    sourceEnum = dlsSources.pan;
                    break;
                }

                case midiControllers.expressionController: {
                    sourceEnum = dlsSources.expression;
                    break;
                }

                case midiControllers.chorusDepth: {
                    sourceEnum = dlsSources.chorus;
                    break;
                }

                case midiControllers.reverbDepth: {
                    sourceEnum = dlsSources.reverb;
                    break;
                }
            }
        } else {
            switch (source.index as ModulatorSourceEnum) {
                case modulatorSources.noController: {
                    sourceEnum = dlsSources.none;
                    break;
                }

                case modulatorSources.noteOnKeyNum: {
                    sourceEnum = dlsSources.keyNum;
                    break;
                }

                case modulatorSources.noteOnVelocity: {
                    sourceEnum = dlsSources.velocity;
                    break;
                }

                case modulatorSources.pitchWheel: {
                    sourceEnum = dlsSources.pitchWheel;
                    break;
                }

                case modulatorSources.pitchWheelRange: {
                    sourceEnum = dlsSources.pitchWheelRange;
                    break;
                }

                case modulatorSources.polyPressure: {
                    sourceEnum = dlsSources.polyPressure;
                    break;
                }

                case modulatorSources.channelPressure: {
                    sourceEnum = dlsSources.channelPressure;
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
        let sourceEnum: ModulatorSourceIndex | undefined = undefined;
        let isCC = false;
        switch (this.source) {
            default:
            case dlsSources.modLfo:
            case dlsSources.vibratoLfo:
            case dlsSources.coarseTune:
            case dlsSources.fineTune:
            case dlsSources.modEnv: {
                return undefined;
            } // Cannot be this in sf2

            case dlsSources.keyNum: {
                sourceEnum = modulatorSources.noteOnKeyNum;
                break;
            }
            case dlsSources.none: {
                sourceEnum = modulatorSources.noController;
                break;
            }
            case dlsSources.modulationWheel: {
                sourceEnum = midiControllers.modulationWheel;
                isCC = true;
                break;
            }
            case dlsSources.pan: {
                sourceEnum = midiControllers.pan;
                isCC = true;
                break;
            }
            case dlsSources.reverb: {
                sourceEnum = midiControllers.reverbDepth;
                isCC = true;
                break;
            }
            case dlsSources.chorus: {
                sourceEnum = midiControllers.chorusDepth;
                isCC = true;
                break;
            }
            case dlsSources.expression: {
                sourceEnum = midiControllers.expressionController;
                isCC = true;
                break;
            }
            case dlsSources.volume: {
                sourceEnum = midiControllers.mainVolume;
                isCC = true;
                break;
            }
            case dlsSources.velocity: {
                sourceEnum = modulatorSources.noteOnVelocity;
                break;
            }
            case dlsSources.polyPressure: {
                sourceEnum = modulatorSources.polyPressure;
                break;
            }
            case dlsSources.channelPressure: {
                sourceEnum = modulatorSources.channelPressure;
                break;
            }
            case dlsSources.pitchWheel: {
                sourceEnum = modulatorSources.pitchWheel;
                break;
            }
            case dlsSources.pitchWheelRange: {
                sourceEnum = modulatorSources.pitchWheelRange;
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

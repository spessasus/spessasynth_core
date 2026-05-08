import {
    DecodedModulator,
    getModSourceEnum
} from "../../../soundbank/basic_soundbank/modulator";
import {
    GeneratorTypes,
    type ModulatorControllerSource,
    ModulatorCurveTypes
} from "../../../soundbank/enums";
import type { GeneratorType } from "../../../soundbank/basic_soundbank/generator_types";
import { ModulatorSource } from "../../../soundbank/basic_soundbank/modulator_source";
import { sysExLogging } from "../system_exclusive/helpers";
import { MIDIControllers } from "../../../midi/enums";
import { VoiceModulator } from "../voice/voice_modulator";

const INITIAL_MODULATORS: VoiceModulator[] = [
    // Vibrato rate to that one GS rate (in bare Hz) map for special cases such as J-Cycle.mid
    VoiceModulator.fromModulator(
        new DecodedModulator(
            getModSourceEnum(
                ModulatorCurveTypes.linear,
                true,
                false,
                true,
                MIDIControllers.vibratoRate
            ), // Linear forward bipolar
            0x0, // No controller
            GeneratorTypes.vibLfoRate,
            1000,
            0
        )
    )
];

/**
 * A class for dynamic modulators
 * that are assigned for more complex system exclusive messages
 */
export class DynamicModulatorSystem {
    /**
     * The current dynamic modulator list.
     */
    public modulatorList: { mod: VoiceModulator; id: string }[] = [];
    public active = false;
    private readonly channelNumber;

    public constructor(channelNumber: number) {
        this.channelNumber = channelNumber;
    }

    public resetModulators() {
        this.modulatorList = INITIAL_MODULATORS.map((m) => {
            return {
                mod: m,
                id: this.getModulatorID(
                    m.primarySource.toSourceEnum(),
                    m.destination,
                    m.primarySource.isBipolar,
                    m.primarySource.isNegative
                )
            };
        });
        this.active = false;
    }

    public setupReceiver(
        addr3: number,
        data: number,
        source: number,
        isCC: boolean,
        sourceName: string,
        bipolar = false
    ) {
        this.active = true;
        const centeredValue = data - 64;
        const centeredNormalized = centeredValue / 64;
        const normalizedNotCentered = data / 127;
        switch (addr3 & 0x0f) {
            case 0x00: {
                // Pitch Control
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.fineTune,
                    centeredValue * 100,
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    centeredValue,
                    `${sourceName} pitch control`,
                    "semitones"
                );
                break;
            }

            case 0x01: {
                // Cutoff
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.initialFilterFc,
                    centeredNormalized * 9600,
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    centeredNormalized * 9600,
                    `${sourceName} filter control`,
                    "cents"
                );
                break;
            }

            case 0x02: {
                // Amplitude
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.amplitude,
                    centeredNormalized * 1000, // Generator is 1/10%
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    centeredNormalized * 100,
                    `${sourceName} amplitude`,
                    "%"
                );
                break;
            }

            case 0x03: {
                // LFO1 Rate
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.vibLfoRate,
                    centeredNormalized * 1000, // Generator is 1/100Hz
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    centeredNormalized * 10,
                    `${sourceName} LFO1 rate`,
                    "Hz"
                );
                break;
            }

            case 0x04: {
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.vibLfoToPitch,
                    normalizedNotCentered * 600,
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    normalizedNotCentered * 600,
                    `${sourceName} LFO1 pitch depth`,
                    "cents"
                );

                break;
            }

            case 0x05: {
                // LFO1 filter depth
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.vibLfoToFilterFc,
                    normalizedNotCentered * 2400,
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    normalizedNotCentered * 2400,
                    `${sourceName} LFO1 filter depth`,
                    "cents"
                );
                break;
            }

            case 0x06: {
                // LFO1 amplitude depth
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.vibLfoAmplitudeDepth,
                    normalizedNotCentered * 1000, // Generator is 1/10%
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    normalizedNotCentered * 100,
                    `${sourceName} LFO1 amplitude depth`,
                    "%"
                );
                break;
            }

            case 0x07: {
                // LFO1 Rate
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.modLfoRate,
                    centeredNormalized * 1000, // Generator is 1/100Hz
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    centeredNormalized * 10,
                    `${sourceName} LFO2 rate`,
                    "Hz"
                );
                break;
            }

            case 0x08: {
                // LFO2 pitch depth
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.modLfoToPitch,
                    normalizedNotCentered * 600,
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    normalizedNotCentered * 600,
                    `${sourceName} LFO2 pitch depth`,
                    "cents"
                );
                break;
            }

            case 0x09: {
                // LFO2 filter depth
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.modLfoToFilterFc,
                    normalizedNotCentered * 2400,
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    normalizedNotCentered * 2400,
                    `${sourceName} LFO2 filter depth`,
                    "cents"
                );
                break;
            }

            case 0x0a: {
                // LFO2 amplitude depth
                this.setModulator(
                    source as ModulatorControllerSource,
                    isCC,
                    GeneratorTypes.modLfoAmplitudeDepth,
                    normalizedNotCentered * 1000, // Generator is 1/10%
                    bipolar
                );
                sysExLogging(
                    this.channelNumber,
                    normalizedNotCentered * 100,
                    `${sourceName} LFO2 amplitude depth`,
                    "%"
                );
                break;
            }
        }
    }

    /**
     * @param source The source index.
     * @param isCC If the source is an SF2 source or a MIDI CC source.
     * @param destination The generator type to modulate.
     * @param amount The amount of modulation to apply.
     * @param isBipolar If true, the modulation is bipolar (ranges from -1 to 1 instead of from 0 to 1).
     * @param isNegative If true, the modulation is negative (goes from 1 to 0 instead of from 0 to 1).
     */
    private setModulator(
        source: ModulatorControllerSource,
        isCC: boolean,
        destination: GeneratorType,
        amount: number,
        isBipolar = false,
        isNegative = false
    ) {
        const id = this.getModulatorID(
            source,
            destination,
            isBipolar,
            isNegative
        );
        if (amount === 0) this.deleteModulator(id);

        const mod = this.modulatorList.find((m) => m.id === id);
        if (mod) {
            mod.mod.transformAmount = amount;
        } else {
            const modulator = VoiceModulator.fromData(
                new ModulatorSource(
                    source,
                    ModulatorCurveTypes.linear,
                    isCC,
                    isBipolar
                ),
                new ModulatorSource(),
                destination,
                amount,
                0
            );
            this.modulatorList.push({
                mod: modulator,
                id: id
            });
        }
    }

    private getModulatorID(
        source: number,
        destination: GeneratorType,
        isBipolar: boolean,
        isNegative: boolean
    ) {
        return `${source}-${destination}-${isBipolar}-${isNegative}`;
    }

    private deleteModulator(id: string) {
        this.modulatorList = this.modulatorList.filter((m) => m.id !== id);
    }
}

import {
    customResetArray,
    defaultMIDIControllerValues,
    NON_CC_INDEX_OFFSET
} from "../../engine_components/controller_tables";
import { DEFAULT_PERCUSSION, DEFAULT_SYNTH_MODE } from "../../engine_components/synth_constants";
import { BankSelectHacks } from "../../../../utils/midi_hacks";
import { type MIDIController, midiControllers } from "../../../../midi/enums";
import type { MIDIChannel } from "../../engine_components/midi_channel";
import type { SpessaSynthProcessor } from "../../../processor";
import { customControllers, dataEntryStates } from "../../../enums";
import { modulatorSources } from "../../../../soundbank/enums";
import type { SynthSystem } from "../../../types";

/**
 * Executes a full system reset of all controllers.
 * This will reset all controllers to their default values,
 * except for the locked controllers.
 */
export function resetAllControllersInternal(
    this: SpessaSynthProcessor,
    system: SynthSystem = DEFAULT_SYNTH_MODE
) {
    // Call here because there are returns in this function.
    this.privateProps.callEvent("allControllerReset", undefined);
    this.setMasterParameter("midiSystem", system);
    // Reset private props
    this.privateProps.tunings.fill(-1); // Set all to no change
    this.setMIDIVolume(1);
    this.privateProps.reverbSend = 1;
    this.privateProps.chorusSend = 1;

    if (!this.privateProps.drumPreset || !this.privateProps.defaultPreset) {
        return;
    }
    // Reset channels
    for (
        let channelNumber = 0;
        channelNumber < this.midiChannels.length;
        channelNumber++
    ) {
        const ch: MIDIChannel = this.midiChannels[channelNumber];

        // Do not send CC changes as we call allControllerReset
        ch.resetControllers(false);
        ch.resetPreset();

        for (let ccNum = 0; ccNum < 128; ccNum++) {
            if (this.midiChannels[channelNumber].lockedControllers[ccNum]) {
                // Was not reset so restore the value
                this.privateProps.callEvent("controllerChange", {
                    channel: channelNumber,
                    controllerNumber: ccNum,
                    controllerValue:
                        this.midiChannels[channelNumber].midiControllers[
                            ccNum
                        ] >> 7
                });
            }
        }

        // Restore pitch wheel
        if (
            !this.midiChannels[channelNumber].lockedControllers[
                NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
            ]
        ) {
            const val =
                this.midiChannels[channelNumber].midiControllers[
                    NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
                ];
            this.privateProps.callEvent("pitchWheel", {
                channel: channelNumber,
                pitch: val
            });
        }

        // Restore channel pressure
        if (
            !this.midiChannels[channelNumber].lockedControllers[
                NON_CC_INDEX_OFFSET + modulatorSources.channelPressure
            ]
        ) {
            const val =
                this.midiChannels[channelNumber].midiControllers[
                    NON_CC_INDEX_OFFSET + modulatorSources.channelPressure
                ] >> 7;
            this.privateProps.callEvent("channelPressure", {
                channel: channelNumber,
                pressure: val
            });
        }
    }
}

export function resetPortamento(this: MIDIChannel, sendCC: boolean) {
    if (this.lockedControllers[midiControllers.portamentoControl]) return;
    // Portamento has a quirk:
    // For XG, control is set to 60
    // For others, it's set to nothing (no portamento on first note-on)
    if (this.channelSystem === "xg") {
        this.controllerChange(midiControllers.portamentoControl, 60, sendCC);
    } else {
        this.controllerChange(midiControllers.portamentoControl, 0, sendCC);
    }
}

/**
 * Reset all controllers for channel.
 * This will reset all controllers to their default values,
 * except for the locked controllers.
 */
export function resetControllers(this: MIDIChannel, sendCCEvents = true) {
    this.channelOctaveTuning.fill(0);

    // Reset the array
    for (const [cc, resetValue] of defaultMIDIControllerValues.entries()) {
        if (this.lockedControllers[cc]) {
            continue;
        }
        if (this.midiControllers[cc] !== resetValue && cc < 127) {
            if (
                cc !== midiControllers.portamentoControl &&
                cc !== midiControllers.dataEntryMSB &&
                cc !== midiControllers.registeredParameterMSB &&
                cc !== midiControllers.registeredParameterLSB &&
                cc !== midiControllers.nonRegisteredParameterMSB &&
                cc !== midiControllers.nonRegisteredParameterLSB
            ) {
                this.controllerChange(
                    cc as MIDIController,
                    resetValue >> 7,
                    sendCCEvents
                );
            }
        } else {
            // Out of range, do a regular reset
            this.midiControllers[cc] = resetValue;
        }
    }
    resetPortamento.call(this, sendCCEvents);
    this.channelVibrato = { rate: 0, depth: 0, delay: 0 };
    this.randomPan = false;

    // Reset to poly
    if (
        !this.lockedControllers[midiControllers.monoModeOn] &&
        !this.lockedControllers[midiControllers.polyModeOn]
    ) {
        this.polyMode = true;
    }

    // Reset pitch wheel
    this.pitchWheel(8192);

    this.sysExModulators.resetModulators();

    // Reset custom controllers
    // Special case: transpose does not get affected
    const transpose =
        this.customControllers[customControllers.channelTransposeFine];
    this.customControllers.set(customResetArray);
    this.setCustomController(customControllers.channelTransposeFine, transpose);
    this.resetParameters();
}

export function resetPreset(this: MIDIChannel) {
    this.setBankMSB(BankSelectHacks.getDefaultBank(this.channelSystem));
    this.setBankLSB(0);
    this.setGSDrums(false);

    this.setDrums(this.channelNumber % 16 === DEFAULT_PERCUSSION);
    this.programChange(0);
}

export const nonResettableCCs = new Set<MIDIController>([
    midiControllers.bankSelect,
    midiControllers.bankSelectLSB,
    midiControllers.mainVolume,
    midiControllers.mainVolumeLSB,
    midiControllers.pan,
    midiControllers.panLSB,
    midiControllers.reverbDepth,
    midiControllers.tremoloDepth,
    midiControllers.chorusDepth,
    midiControllers.detuneDepth,
    midiControllers.phaserDepth,
    midiControllers.soundVariation,
    midiControllers.filterResonance,
    midiControllers.releaseTime,
    midiControllers.attackTime,
    midiControllers.brightness,
    midiControllers.decayTime,
    midiControllers.vibratoRate,
    midiControllers.vibratoDepth,
    midiControllers.vibratoDelay,
    midiControllers.soundController10,
    midiControllers.polyModeOn,
    midiControllers.monoModeOn
] as const);

/**
 * https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf
 * Reset controllers according to RP-15 Recommended Practice.
 */
export function resetControllersRP15Compliant(this: MIDIChannel) {
    // Reset tunings
    this.channelOctaveTuning.fill(0);

    // Reset pitch wheel
    this.pitchWheel(8192);

    this.channelVibrato = { rate: 0, depth: 0, delay: 0 };

    for (let i = 0; i < 128; i++) {
        const resetValue = defaultMIDIControllerValues[i];
        if (
            !nonResettableCCs.has(i as MIDIController) &&
            resetValue !== this.midiControllers[i] &&
            i !== midiControllers.portamentoControl
        ) {
            this.controllerChange(i as MIDIController, resetValue >> 7);
        }
    }
    resetPortamento.call(this, true);
    this.resetGeneratorOverrides();
    this.resetGeneratorOffsets();
}

/**
 * Reset all parameters to their default values.
 * This includes NRPN and RPN controllers, data entry state,
 * and generator overrides and offsets.
 */
export function resetParameters(this: MIDIChannel) {
    /**
     * Reset the state machine to idle
     */
    this.dataEntryState = dataEntryStates.Idle;
    this.midiControllers[midiControllers.nonRegisteredParameterLSB] = 127 << 7;
    this.midiControllers[midiControllers.nonRegisteredParameterMSB] = 127 << 7;
    this.midiControllers[midiControllers.registeredParameterLSB] = 127 << 7;
    this.midiControllers[midiControllers.registeredParameterMSB] = 127 << 7;
    this.resetGeneratorOverrides();
    this.resetGeneratorOffsets();
}

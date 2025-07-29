import { consoleColors } from "../../../../utils/other";
import { SpessaSynthInfo } from "../../../../utils/loggin";
import {
    customResetArray,
    NON_CC_INDEX_OFFSET,
    PORTAMENTO_CONTROL_UNSET,
    resetArray
} from "../../engine_components/controller_tables";
import { DEFAULT_PERCUSSION, DEFAULT_SYNTH_MODE } from "../../engine_components/synth_constants";
import { getDefaultBank } from "../../../../utils/xg_hacks";
import { type MIDIController, midiControllers } from "../../../../midi/enums";
import type { MIDIChannel } from "../../engine_components/midi_channel";
import type { SpessaSynthProcessor } from "../../processor";
import { customControllers, dataEntryStates } from "../../../enums";
import { modulatorSources } from "../../../../soundbank/enums";

/**
 * Executes a full system reset of all controllers.
 * This will reset all controllers to their default values,
 * except for the locked controllers.
 */
export function resetAllControllersInternal(
    this: SpessaSynthProcessor,
    log = true
) {
    if (log) {
        SpessaSynthInfo("%cResetting all controllers!", consoleColors.info);
    }
    this.privateProps.callEvent("allControllerReset", undefined);
    this.setMasterParameter("midiSystem", DEFAULT_SYNTH_MODE);
    for (
        let channelNumber = 0;
        channelNumber < this.midiChannels.length;
        channelNumber++
    ) {
        const ch: MIDIChannel = this.midiChannels[channelNumber];

        ch.resetControllers();
        // if preset is unlocked, switch to non-drums and call event
        if (
            !ch.lockPreset &&
            this.privateProps.drumPreset &&
            this.privateProps.defaultPreset
        ) {
            ch.setBankSelect(
                getDefaultBank(this.privateProps.masterParameters.midiSystem)
            );
            if (channelNumber % 16 === DEFAULT_PERCUSSION) {
                ch.setPreset(this.privateProps.drumPreset);
                ch.drumChannel = true;
                this.privateProps.callEvent("drumChange", {
                    channel: channelNumber,
                    isDrumChannel: true
                });
            } else {
                ch.drumChannel = false;
                ch.setPreset(this.privateProps.defaultPreset);
                this.privateProps.callEvent("drumChange", {
                    channel: channelNumber,
                    isDrumChannel: false
                });
            }
        } else {
            this.privateProps.callEvent("drumChange", {
                channel: channelNumber,
                isDrumChannel: ch.drumChannel
            });
        }
        // safety net
        if (!ch.preset) {
            continue;
        }
        const presetBank = ch.preset?.bank;
        // call program change
        this.privateProps.callEvent("programChange", {
            channel: channelNumber,
            program: ch.preset?.program,
            bank: presetBank
        });

        for (let ccNum = 0; ccNum < 128; ccNum++) {
            if (this.midiChannels[channelNumber].lockedControllers[ccNum]) {
                // was not reset so restore the value
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

        // restore pitch wheel
        if (
            !this.midiChannels[channelNumber].lockedControllers[
                NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
            ]
        ) {
            const val =
                this.midiChannels[channelNumber].midiControllers[
                    NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel
                ];
            const msb = val >> 7;
            const lsb = val & 0x7f;
            this.privateProps.callEvent("pitchWheel", {
                channel: channelNumber,
                MSB: msb,
                LSB: lsb
            });
        }

        // restore channel pressure
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
    this.privateProps.tunings.length = 0;
    this.privateProps.tunings.length = 0;
    for (let i = 0; i < 128; i++) {
        this.privateProps.tunings.push([]);
    }

    this.setMIDIVolume(1);
}

/**
 * Reset all controllers for channel.
 * This will reset all controllers to their default values,
 * except for the locked controllers.
 */
export function resetControllers(this: MIDIChannel) {
    this.channelOctaveTuning.fill(0);

    // reset the array
    for (let i = 0; i < resetArray.length; i++) {
        if (this.lockedControllers[i]) {
            continue;
        }
        const resetValue = resetArray[i];
        if (this.midiControllers[i] !== resetValue && i < 127) {
            if (i === midiControllers.portamentoControl) {
                this.midiControllers[i] = PORTAMENTO_CONTROL_UNSET;
            } else if (
                i !== midiControllers.portamentoControl &&
                i !== midiControllers.dataEntryMsb &&
                i !== midiControllers.RPNMsb &&
                i !== midiControllers.RPNLsb &&
                i !== midiControllers.NRPNMsb &&
                i !== midiControllers.NRPNLsb
            ) {
                this.controllerChange(i, resetValue >> 7);
            }
        } else {
            // out of range, do a regular reset
            this.midiControllers[i] = resetValue;
        }
    }
    this.channelVibrato = { rate: 0, depth: 0, delay: 0 };
    this.holdPedal = false;
    this.randomPan = false;

    this.sysExModulators.resetModulators();

    // reset custom controllers
    // special case: transpose does not get affected
    const transpose =
        this.customControllers[customControllers.channelTransposeFine];
    this.customControllers.set(customResetArray);
    this.setCustomController(customControllers.channelTransposeFine, transpose);
    this.resetParameters();
}

export const nonResettableCCs = new Set<MIDIController>([
    midiControllers.bankSelect,
    midiControllers.lsbForControl0BankSelect,
    midiControllers.mainVolume,
    midiControllers.lsbForControl7MainVolume,
    midiControllers.pan,
    midiControllers.lsbForControl10Pan,
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
    midiControllers.soundController10
] as const);

/**
 * https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf
 * Reset controllers according to RP-15 Recommended Practice.
 */
export function resetControllersRP15Compliant(this: MIDIChannel) {
    // reset tunings
    this.channelOctaveTuning.fill(0);

    // reset pitch bend
    this.pitchWheel(64, 0);

    this.channelVibrato = { rate: 0, depth: 0, delay: 0 };

    for (let i = 0; i < 128; i++) {
        const resetValue = resetArray[i];
        if (
            !nonResettableCCs.has(i as MIDIController) &&
            resetValue !== this.midiControllers[i]
        ) {
            if (i === midiControllers.portamentoControl) {
                this.midiControllers[i] = PORTAMENTO_CONTROL_UNSET;
            } else {
                this.controllerChange(i, resetValue >> 7);
            }
        }
    }
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
     * reset the state machine to idle
     */
    this.dataEntryState = dataEntryStates.Idle;
    this.midiControllers[midiControllers.NRPNLsb] = 127 << 7;
    this.midiControllers[midiControllers.NRPNMsb] = 127 << 7;
    this.midiControllers[midiControllers.RPNLsb] = 127 << 7;
    this.midiControllers[midiControllers.RPNMsb] = 127 << 7;
    this.resetGeneratorOverrides();
    this.resetGeneratorOffsets();
}

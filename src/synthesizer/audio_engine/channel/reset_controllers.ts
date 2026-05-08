import {
    CONTROLLER_TABLE_SIZE,
    DEFAULT_MIDI_CONTROLLERS
} from "./controller_tables";
import { DEFAULT_PERCUSSION } from "../synth_constants";
import { BankSelectHacks } from "../../../utils/midi_hacks";
import { type MIDIController, MIDIControllers } from "../../../midi/enums";
import type { MIDIChannel } from "./midi_channel";

export function resetPortamento(this: MIDIChannel, sendCC: boolean) {
    if (this.lockedControllers[MIDIControllers.portamentoControl]) return;
    // Portamento has a quirk:
    // For XG, control is set to 60
    // For others, it's set to nothing (no portamento on first note-on)
    if (this.channelSystem === "xg") {
        this.controllerChange(MIDIControllers.portamentoControl, 60, sendCC);
    } else {
        this.controllerChange(MIDIControllers.portamentoControl, 0, sendCC);
    }
}

/**
 * Reset all controllers for channel.
 * This will reset all controllers to their default values,
 * except for the locked controllers.
 */
export function resetControllers(this: MIDIChannel, sendCCEvents = true) {
    // Reset MIDI controllers
    for (let cc = 0; cc < CONTROLLER_TABLE_SIZE; cc++) {
        if (this.lockedControllers[cc]) {
            // Was not reset so restore the value
            this.synthCore.callEvent("controllerChange", {
                channel: this.channel,
                controller: cc as MIDIController,
                value: this.midiControllers[cc] >> 7
            });
            continue;
        }
        const resetValue = DEFAULT_MIDI_CONTROLLERS[cc];
        if (
            this.midiControllers[cc] !== resetValue &&
            cc !== MIDIControllers.portamentoControl &&
            cc !== MIDIControllers.dataEntryMSB &&
            cc !== MIDIControllers.registeredParameterMSB &&
            cc !== MIDIControllers.registeredParameterLSB &&
            cc !== MIDIControllers.nonRegisteredParameterMSB &&
            cc !== MIDIControllers.nonRegisteredParameterLSB
        ) {
            this.controllerChange(
                cc as MIDIController,
                resetValue >> 7,
                sendCCEvents
            );
        }
    }
    // Reset insertion
    if (!this.synthCore.masterParameters.insertionEffectLock)
        this.setMIDIParameter("efxAssign", false);

    // Reset property parameters
    this.setMIDIParameter("rxChannel", this.channel);
    this.setMIDIParameter("assignMode", 2);
    this.setMIDIParameter("randomPan", false);
    this.setMIDIParameter("cc1", 0x10);
    this.setMIDIParameter("cc2", 0x11);
    this.setMIDIParameter(
        "drumMap",
        this.channel % 16 === DEFAULT_PERCUSSION ? 1 : 0
    );
    this.pitchWheel(8192);
    this.pitchWheelRange(2);
    this.keyShift(0, false);
    this.fineTune(0, false);
    this.setMIDIParameter("pressure", 0);
    this.modulationDepth(50);
    // Do not reset user transpose!

    // Reset poly/mono mode
    if (
        !this.lockedControllers[MIDIControllers.monoModeOn] &&
        !this.lockedControllers[MIDIControllers.polyModeOn]
    )
        this.setMIDIParameter("polyMode", true);

    // Reset various other things
    this.octaveTuning.fill(0);
    resetPortamento.call(this, sendCCEvents);
    this.resetDrumParams();
    this.resetVibratoParams();
    this.resetParameters();
    this.resetGeneratorOverrides();
    this.resetGeneratorOffsets();
    this.sysExModulators.resetModulators();
    this.sf2NRPNGeneratorLSB = 0;

    // Reset program
    this.setBankMSB(BankSelectHacks.getDefaultBank(this.channelSystem));
    this.setBankLSB(0);
    this.setGSDrums(false);

    this.setDrums(this.channel % 16 === DEFAULT_PERCUSSION);
    this.programChange(0);
}

export const RP_15_RESET_CC_NUMS: MIDIController[] = [
    MIDIControllers.modulationWheel,
    MIDIControllers.expressionController,
    MIDIControllers.sustainPedal,
    MIDIControllers.portamentoOnOff,
    MIDIControllers.sostenutoPedal,
    MIDIControllers.softPedal,
    MIDIControllers.registeredParameterMSB,
    MIDIControllers.registeredParameterLSB
];

/**
 * https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf
 * Reset controllers according to RP-15 Recommended Practice.
 */
export function resetRP15(this: MIDIChannel) {
    this.pitchWheel(8192);
    this.setMIDIParameter("pressure", 0);

    for (const resetCC of RP_15_RESET_CC_NUMS) {
        const resetValue = DEFAULT_MIDI_CONTROLLERS[resetCC];
        if (resetValue !== this.midiControllers[resetCC])
            this.controllerChange(resetCC, resetValue >> 7);
    }
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
    this.lastParameterIsRegistered = true;
    this.midiControllers[MIDIControllers.nonRegisteredParameterLSB] = 127 << 7;
    this.midiControllers[MIDIControllers.nonRegisteredParameterMSB] = 127 << 7;
    this.midiControllers[MIDIControllers.registeredParameterLSB] = 127 << 7;
    this.midiControllers[MIDIControllers.registeredParameterMSB] = 127 << 7;
}

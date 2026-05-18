import {
    CONTROLLER_TABLE_SIZE,
    DEFAULT_NRPN,
    DEFAULT_PERCUSSION,
    DEFAULT_RPN
} from "../synth_constants";
import { BankSelectHacks } from "../../../utils/midi_hacks";
import { type MIDIController, MIDIControllers } from "../../../midi/enums";
import type { MIDIChannel } from "./midi_channel";

export function resetPortamento(this: MIDIChannel) {
    // Portamento has a quirk:
    // For XG, control is set to 60
    // For others, it's set to nothing (no portamento on first note-on)
    this.lastNote = this.channelSystem === "xg" ? 60 : -1;
}

/**
 * An array with the default MIDI controller values.
 * Note that these are 14-bit, requiring a 7-bit shift to the right for 7-bit values!
 */
export const DEFAULT_MIDI_CONTROLLERS: Readonly<Int16Array> = new Int16Array(
    CONTROLLER_TABLE_SIZE
).fill(0);

const setResetValue = (i: MIDIController, v: number) =>
    // @ts-expect-error Only set here!
    (DEFAULT_MIDI_CONTROLLERS[i] = v << 7);

// Values come from Falcosoft MIDI Player
setResetValue(MIDIControllers.mainVolume, 100);
setResetValue(MIDIControllers.balance, 64);
setResetValue(MIDIControllers.expression, 127);
setResetValue(MIDIControllers.pan, 64);

setResetValue(MIDIControllers.filterResonance, 64);
setResetValue(MIDIControllers.releaseTime, 64);
setResetValue(MIDIControllers.attackTime, 64);
setResetValue(MIDIControllers.brightness, 64);

setResetValue(MIDIControllers.decayTime, 64);
setResetValue(MIDIControllers.vibratoRate, 64);
setResetValue(MIDIControllers.vibratoDepth, 64);
setResetValue(MIDIControllers.vibratoDelay, 64);
setResetValue(MIDIControllers.generalPurposeController6, 64);
setResetValue(MIDIControllers.generalPurposeController8, 64);

setResetValue(MIDIControllers.registeredParameterLSB, DEFAULT_RPN);
setResetValue(MIDIControllers.registeredParameterMSB, DEFAULT_RPN);
setResetValue(MIDIControllers.nonRegisteredParameterLSB, DEFAULT_NRPN);
setResetValue(MIDIControllers.nonRegisteredParameterMSB, DEFAULT_NRPN);

export const DEFAULT_DRUM_REVERB = new Int8Array(128).fill(127);
// Kicks have no reverb
DEFAULT_DRUM_REVERB[35] = 0;
DEFAULT_DRUM_REVERB[36] = 0;

/**
 * Reset all controllers for channel.
 * This will reset all controllers to their default values,
 * except for the locked controllers.
 */
export function resetChannelInternal(this: MIDIChannel, sendCCEvents = true) {
    // Reset MIDI controllers
    for (let cc = 0; cc < CONTROLLER_TABLE_SIZE; cc++) {
        if (this.lockedControllers[cc]) {
            // Was not reset so restore the value
            this.synthCore.callEvent("controllerChange", {
                channel: this.channel,
                controller: cc as MIDIController,
                value: this._midiControllers[cc] >> 7
            });
            continue;
        }
        const resetValue = DEFAULT_MIDI_CONTROLLERS[cc];
        if (
            this._midiControllers[cc] !== resetValue &&
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
    if (!this.synthCore.systemParameters.insertionEffectLock)
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
    this.pitchWheelRange(2, false);
    this.keyShift(0, false);
    this.fineTune(0, false);
    this.setMIDIParameter("pressure", 0);
    this.modulationDepth(50, false);
    // Do not reset user transpose!

    // Reset poly/mono mode
    if (
        !this.lockedControllers[MIDIControllers.monoModeOn] &&
        !this.lockedControllers[MIDIControllers.polyModeOn]
    )
        this.setMIDIParameter("polyMode", true);

    // Reset various other things
    this.octaveTuning.fill(0);
    resetPortamento.call(this);
    this.resetDrumParams();
    this.resetGeneratorOverrides();
    this.resetGeneratorOffsets();
    this.dynamicModulators.resetModulators();
    this.sf2NRPNGeneratorLSB = 0;

    // Reset Parameters (do not emit controller change)
    // We reset them here since in the loop, the data entries would come before params
    this.lastParameterIsRegistered = true;
    this._midiControllers[MIDIControllers.nonRegisteredParameterLSB] =
        DEFAULT_NRPN << 7;
    this._midiControllers[MIDIControllers.nonRegisteredParameterMSB] =
        DEFAULT_NRPN << 7;
    this._midiControllers[MIDIControllers.registeredParameterLSB] =
        DEFAULT_RPN << 7;
    this._midiControllers[MIDIControllers.registeredParameterMSB] =
        DEFAULT_RPN << 7;
    this._midiControllers[MIDIControllers.dataEntryMSB] = 0;
    this._midiControllers[MIDIControllers.dataEntryLSB] = 0;

    // Reset program
    this.setBankMSB(BankSelectHacks.getDefaultBank(this.channelSystem));
    this.setBankLSB(0);
    this.setGSDrums(false);

    this.setDrums(this.channel % 16 === DEFAULT_PERCUSSION);
    this.programChange(0);
}

export const RP_15_RESET_CC_NUMS: MIDIController[] = [
    MIDIControllers.modulationWheel,
    MIDIControllers.expression,
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
        if (resetValue !== this._midiControllers[resetCC])
            this.controllerChange(resetCC, resetValue >> 7);
    }
}

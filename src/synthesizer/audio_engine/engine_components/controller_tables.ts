import { type MIDIController, midiControllers } from "../../../midi/enums";
import { customControllers } from "../../enums";
import { modulatorSources } from "../../../soundbank/enums";

/*
 * A bit of explanation:
 * The controller table is stored as an int16 array, it stores 14-bit values.
 * This controller table is then extended with the modulatorSources section,
 * for example, pitch range and pitch range depth.
 * This allows us for precise control range and supports full pitch-wheel resolution.
 */
export const NON_CC_INDEX_OFFSET = 128;
export const CONTROLLER_TABLE_SIZE = 147;

/**
 * An array with the default MIDI controller values. Note that these are 14-bit, not 7-bit.
 */
export const defaultMIDIControllerValues = new Int16Array(
    CONTROLLER_TABLE_SIZE
).fill(0);
export const setResetValue = (i: MIDIController, v: number) =>
    (defaultMIDIControllerValues[i] = v << 7);

// Values come from Falcosoft MidiPlayer 6
setResetValue(midiControllers.mainVolume, 100);
setResetValue(midiControllers.balance, 64);
setResetValue(midiControllers.expressionController, 127);
setResetValue(midiControllers.pan, 64);

setResetValue(midiControllers.portamentoOnOff, 127);

setResetValue(midiControllers.filterResonance, 64);
setResetValue(midiControllers.releaseTime, 64);
setResetValue(midiControllers.attackTime, 64);
setResetValue(midiControllers.brightness, 64);

setResetValue(midiControllers.decayTime, 64);
setResetValue(midiControllers.vibratoRate, 64);
setResetValue(midiControllers.vibratoDepth, 64);
setResetValue(midiControllers.vibratoDelay, 64);
setResetValue(midiControllers.generalPurposeController6, 64);
setResetValue(midiControllers.generalPurposeController8, 64);

setResetValue(midiControllers.RPNLsb, 127);
setResetValue(midiControllers.RPNMsb, 127);
setResetValue(midiControllers.NRPNLsb, 127);
setResetValue(midiControllers.NRPNMsb, 127);

export const PORTAMENTO_CONTROL_UNSET = 1;
// Special case: portamento control
// Since it is only 7-bit, only the values at multiple of 128 are allowed.
// A value of just 1 indicates no key set, hence no portamento.
// This is the "initial unset portamento key" flag.
defaultMIDIControllerValues[midiControllers.portamentoControl] =
    PORTAMENTO_CONTROL_UNSET;

// Pitch wheel
setResetValue(
    (NON_CC_INDEX_OFFSET + modulatorSources.pitchWheel) as MIDIController,
    64
);
setResetValue(
    (NON_CC_INDEX_OFFSET + modulatorSources.pitchWheelRange) as MIDIController,
    2
);

export const CUSTOM_CONTROLLER_TABLE_SIZE =
    Object.keys(customControllers).length;
export const customResetArray = new Float32Array(CUSTOM_CONTROLLER_TABLE_SIZE);
customResetArray[customControllers.modulationMultiplier] = 1;

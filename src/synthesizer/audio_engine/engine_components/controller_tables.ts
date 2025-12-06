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

// Portamento is on by default, but time is set to 0 so it's effectively off
setResetValue(midiControllers.portamentoOnOff, 127);
// For control, see reset_controllers.ts

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

setResetValue(midiControllers.registeredParameterLSB, 127);
setResetValue(midiControllers.registeredParameterMSB, 127);
setResetValue(midiControllers.nonRegisteredParameterLSB, 127);
setResetValue(midiControllers.nonRegisteredParameterMSB, 127);

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

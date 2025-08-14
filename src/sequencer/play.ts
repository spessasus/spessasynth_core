import { getEvent } from "../midi/midi_message";
import { defaultMIDIControllerValues } from "../synthesizer/audio_engine/engine_components/controller_tables";
import { nonResettableCCs } from "../synthesizer/audio_engine/engine_methods/controller_control/reset_controllers";
import {
    type MIDIController,
    midiControllers,
    midiMessageTypes
} from "../midi/enums";
import type { SpessaSynthSequencer } from "./sequencer";
import type { MIDITrack } from "../midi/midi_track";

// An array with preset default values
const defaultControllerArray = defaultMIDIControllerValues.slice(0, 128);

/**
 * Plays the MIDI file to a specific time or ticks.
 * @param time in seconds.
 * @param ticks optional MIDI ticks, when given is used instead of time.
 * @returns true if the MIDI file is not finished.
 */
export function setTimeToInternal(
    this: SpessaSynthSequencer,
    time: number,
    ticks: number | undefined = undefined
): boolean {
    if (!this._midiData) {
        return false;
    }
    this.oneTickToSeconds = 60 / (120 * this._midiData.timeDivision);
    // Reset everything
    if (this.externalMIDIPlayback) {
        this.sendMIDIReset();
    } else {
        this.synth.resetAllControllers();
        this.synth.stopAllChannels(false);
    }
    this.playedTime = 0;
    this.eventIndexes = Array<number>(this._midiData.tracks.length).fill(0);

    // We save the pitch bends, programs and controllers here
    // To only send them once after going through the events

    const channelsToSave = this.synth.midiChannels.length;
    /**
     * Save pitch bends here and send them only after
     */
    const pitchWheels = Array<number>(channelsToSave).fill(8192);

    /**
     * Save programs here and send them only after
     */
    const programs: { program: number; bank: number; actualBank: number }[] =
        [];
    for (let i = 0; i < channelsToSave; i++) {
        programs.push({
            program: -1,
            bank: 0,
            actualBank: 0
        });
    }

    const isCCNonSkippable = (cc: MIDIController) =>
        cc === midiControllers.dataDecrement ||
        cc === midiControllers.dataIncrement ||
        cc === midiControllers.dataEntryMsb ||
        cc === midiControllers.lsbForControl6DataEntry ||
        cc === midiControllers.RPNLsb ||
        cc === midiControllers.RPNMsb ||
        cc === midiControllers.NRPNLsb ||
        cc === midiControllers.NRPNMsb ||
        cc === midiControllers.bankSelect ||
        cc === midiControllers.lsbForControl0BankSelect ||
        cc === midiControllers.resetAllControllers;

    /**
     * Save controllers here and send them only after
     */
    const savedControllers: number[][] = [];
    for (let i = 0; i < channelsToSave; i++) {
        savedControllers.push(
            Array.from(defaultControllerArray) as MIDIController[]
        );
    }

    /**
     * RP-15 compliant reset
     * https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf
     */
    function resetAllControllers(chan: number) {
        // Reset pitch bend
        pitchWheels[chan] = 8192;
        if (savedControllers?.[chan] === undefined) {
            return;
        }
        for (let i = 0; i < defaultControllerArray.length; i++) {
            if (!nonResettableCCs.has(i as MIDIController)) {
                savedControllers[chan][i] = defaultControllerArray[
                    i
                ] as MIDIController;
            }
        }
    }

    while (true) {
        // Find the next event
        let trackIndex = this.findFirstEventIndex();
        // Type assertion is required here because tsc is drunk...
        const track: MIDITrack = this._midiData.tracks[trackIndex];
        const event = track.events[this.eventIndexes[trackIndex]];
        if (ticks !== undefined) {
            if (event.ticks >= ticks) {
                break;
            }
        } else {
            if (this.playedTime >= time) {
                break;
            }
        }

        // Skip note ons
        const info = getEvent(event.statusByte);
        // Keep in mind midi ports to determine the channel!
        const channel =
            info.channel + (this.midiPortChannelOffsets[track.port] || 0);
        switch (info.status) {
            // Skip note messages
            case midiMessageTypes.noteOn:
                // Track portamento control as last note
                savedControllers[channel] ??= Array.from(
                    defaultControllerArray
                ) as MIDIController[];
                savedControllers[channel][midiControllers.portamentoControl] =
                    event.data[0] as MIDIController;
                break;

            case midiMessageTypes.noteOff:
                break;

            // Skip pitch bend
            case midiMessageTypes.pitchWheel:
                pitchWheels[channel] = (event.data[1] << 7) | event.data[0];
                break;

            case midiMessageTypes.programChange: {
                // Empty tracks cannot program change
                if (this._midiData.isMultiPort && track.channels.size === 0) {
                    break;
                }
                const p = programs[channel];
                p.program = event.data[0];
                p.actualBank = p.bank;
                break;
            }

            case midiMessageTypes.controllerChange: {
                // Empty tracks cannot controller change
                if (this._midiData.isMultiPort && track.channels.size === 0) {
                    break;
                }
                // Do not skip data entries
                const controllerNumber = event.data[0] as MIDIController;
                if (isCCNonSkippable(controllerNumber)) {
                    const ccV = event.data[1];
                    if (controllerNumber === midiControllers.bankSelect) {
                        // Add the bank to be saved
                        programs[channel].bank = ccV;
                        break;
                    } else if (
                        controllerNumber === midiControllers.resetAllControllers
                    ) {
                        resetAllControllers(channel);
                    }
                    if (this.externalMIDIPlayback) {
                        this.sendMIDICC(channel, controllerNumber, ccV);
                    } else {
                        this.synth.controllerChange(
                            channel,
                            controllerNumber,
                            ccV
                        );
                    }
                } else {
                    savedControllers[channel] ??= Array.from(
                        defaultControllerArray
                    ) as MIDIController[];
                    savedControllers[channel][controllerNumber] = event
                        .data[1] as MIDIController;
                }
                break;
            }

            default:
                this.processEvent(event, trackIndex);
                break;
        }

        this.eventIndexes[trackIndex]++;
        // Find the next event
        trackIndex = this.findFirstEventIndex();

        const nextEvent =
            this._midiData.tracks[trackIndex].events[
                this.eventIndexes[trackIndex]
            ];
        if (nextEvent === undefined) {
            this.stop();
            return false;
        }
        this.playedTime +=
            this.oneTickToSeconds * (nextEvent.ticks - event.ticks);
    }

    // Restoring saved controllers
    if (this.externalMIDIPlayback) {
        for (
            let channelNumber = 0;
            channelNumber < channelsToSave;
            channelNumber++
        ) {
            // Restore pitch bends
            if (pitchWheels[channelNumber] !== undefined) {
                this.sendMIDIPitchWheel(
                    channelNumber,
                    pitchWheels[channelNumber] >> 7,
                    pitchWheels[channelNumber] & 0x7f
                );
            }
            if (savedControllers[channelNumber] !== undefined) {
                // Every controller that has changed
                savedControllers[channelNumber].forEach((value, index) => {
                    if (
                        value !== defaultControllerArray[index] &&
                        !isCCNonSkippable(index as MIDIController)
                    ) {
                        this.sendMIDICC(channelNumber, index, value);
                    }
                });
            }
            // Restore programs
            if (
                programs[channelNumber].program >= 0 &&
                programs[channelNumber].actualBank >= 0
            ) {
                const bank = programs[channelNumber].actualBank;
                this.sendMIDICC(
                    channelNumber,
                    midiControllers.bankSelect,
                    bank
                );
                this.sendMIDIProgramChange(
                    channelNumber,
                    programs[channelNumber].program
                );
            }
        }
    } else {
        // For all synth channels
        for (
            let channelNumber = 0;
            channelNumber < channelsToSave;
            channelNumber++
        ) {
            // Restore pitch bends
            if (pitchWheels[channelNumber] !== undefined) {
                this.synth.pitchWheel(
                    channelNumber,
                    pitchWheels[channelNumber]
                );
            }
            if (savedControllers[channelNumber] !== undefined) {
                // Every controller that has changed
                savedControllers[channelNumber].forEach((value, index) => {
                    if (
                        value !== defaultControllerArray[index] &&
                        !isCCNonSkippable(index as MIDIController)
                    ) {
                        this.synth.controllerChange(
                            channelNumber,
                            index as MIDIController,
                            value
                        );
                    }
                });
            }
            // Restore programs
            if (programs[channelNumber].actualBank >= 0) {
                const p = programs[channelNumber];
                if (p.program !== -1) {
                    // A program change has occurred, apply the actual bank when program change was executed
                    this.synth.controllerChange(
                        channelNumber,
                        midiControllers.bankSelect,
                        p.actualBank
                    );
                    this.synth.programChange(channelNumber, p.program);
                } else {
                    // No program change, apply the current bank select
                    this.synth.controllerChange(
                        channelNumber,
                        midiControllers.bankSelect,
                        p.bank
                    );
                }
            }
        }
    }

    // Restoring paused time

    if (this.paused) {
        this.pausedTime = this.playedTime;
    }
    return true;
}

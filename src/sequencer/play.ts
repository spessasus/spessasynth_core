import { getEvent, MIDIMessage } from "../midi/midi_message";
import { defaultMIDIControllerValues } from "../synthesizer/audio_engine/engine_components/controller_tables";
import { nonResettableCCs } from "../synthesizer/audio_engine/engine_methods/controller_control/reset_controllers";
import {
    type MIDIController,
    midiControllers,
    midiMessageTypes
} from "../midi/enums";
import type { SpessaSynthSequencer } from "./sequencer";
import type { MIDITrack } from "../midi/midi_track";
import { readBigEndian } from "../utils/byte_functions/big_endian";

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

    this.sendMIDIReset();
    this.playedTime = 0;
    this.eventIndexes = Array<number>(this._midiData.tracks.length).fill(0);

    // We save the pitch wheels, programs and controllers here
    // To only send them once after going through the events

    const channelsToSave = this.synth.midiChannels.length;
    /**
     * Save pitch wheels here and send them only after
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
        cc === midiControllers.dataEntryMSB ||
        cc === midiControllers.dataEntryLSB ||
        cc === midiControllers.registeredParameterLSB ||
        cc === midiControllers.registeredParameterMSB ||
        cc === midiControllers.nonRegisteredParameterLSB ||
        cc === midiControllers.nonRegisteredParameterMSB ||
        cc === midiControllers.bankSelect ||
        cc === midiControllers.bankSelectLSB ||
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

    // Save tempo changes
    // Testcase:
    // Piano Concerto No. 2 in G minor, Op 16 - I. Cadenza (Ky6000).mid
    // With 46k changes!
    let savedTempo: MIDIMessage | undefined = undefined;
    let savedTempoTrack = 0;

    /**
     * RP-15 compliant reset
     * https://amei.or.jp/midistandardcommittee/Recommended_Practice/e/rp15.pdf
     */
    function resetAllControllers(chan: number) {
        // Reset pitch wheel
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

            // Skip pitch wheel
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
                    this.sendMIDICC(channel, controllerNumber, ccV);
                } else {
                    savedControllers[channel] ??= Array.from(
                        defaultControllerArray
                    ) as MIDIController[];
                    savedControllers[channel][controllerNumber] = event
                        .data[1] as MIDIController;
                }
                break;
            }

            case midiMessageTypes.setTempo:
                const tempoBPM = 60000000 / readBigEndian(event.data, 3);
                this.oneTickToSeconds =
                    60 / (tempoBPM * this._midiData.timeDivision);
                savedTempo = event;
                savedTempoTrack = trackIndex;
                break;

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
    // For all synth channels
    for (let channel = 0; channel < channelsToSave; channel++) {
        // Restore pitch wheels
        if (pitchWheels[channel] !== undefined) {
            this.sendMIDIPitchWheel(channel, pitchWheels[channel]);
        }
        if (savedControllers[channel] !== undefined) {
            // Every controller that has changed
            savedControllers[channel].forEach((value, index) => {
                if (
                    value !== defaultControllerArray[index] &&
                    !isCCNonSkippable(index as MIDIController)
                ) {
                    this.sendMIDICC(channel, index as MIDIController, value);
                }
            });
        }
        // Restore programs
        if (programs[channel].actualBank >= 0) {
            const p = programs[channel];
            if (p.program !== -1) {
                // A program change has occurred, apply the actual bank when program change was executed
                this.sendMIDICC(
                    channel,
                    midiControllers.bankSelect,
                    p.actualBank
                );
                this.sendMIDIProgramChange(channel, p.program);
            } else {
                // No program change, apply the current bank select
                this.sendMIDICC(channel, midiControllers.bankSelect, p.bank);
            }
        }
    }

    // Restoring tempo
    if (savedTempo) {
        this.callEvent("metaEvent", {
            event: savedTempo,
            trackIndex: savedTempoTrack
        });
    }

    // Restoring paused time
    if (this.paused) {
        this.pausedTime = this.playedTime;
    }

    return true;
}

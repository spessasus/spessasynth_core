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

const nonSkippableCCs = new Set<MIDIController>([
    midiControllers.dataDecrement,
    midiControllers.dataIncrement,
    midiControllers.dataEntryMSB,
    midiControllers.dataEntryLSB,
    midiControllers.registeredParameterLSB,
    midiControllers.registeredParameterMSB,
    midiControllers.nonRegisteredParameterLSB,
    midiControllers.nonRegisteredParameterMSB,
    midiControllers.bankSelect,
    midiControllers.bankSelectLSB,
    midiControllers.resetAllControllers,
    midiControllers.monoModeOn,
    midiControllers.polyModeOn
] as const);

const isCCNonSkippable = (cc: MIDIController) => nonSkippableCCs.has(cc);

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
    this.eventIndexes = new Array<number>(this._midiData.tracks.length).fill(0);

    // We save the pitch wheels, programs and controllers here
    // To only send them once after going through the events

    const channelsToSave = this.synth.midiChannels.length;
    /**
     * Save pitch wheels here and send them only after
     */
    const pitchWheels = new Array<number>(channelsToSave).fill(8192);

    /**
     * Save controllers here and send them only after
     */
    const savedControllers: number[][] = [];
    for (let i = 0; i < channelsToSave; i++) {
        savedControllers.push([...defaultControllerArray] as MIDIController[]);
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
        for (const [i, element] of defaultControllerArray.entries()) {
            if (!nonResettableCCs.has(i as MIDIController)) {
                savedControllers[chan][i] = element as MIDIController;
            }
        }
    }

    while (true) {
        // Find the next event
        let trackIndex = this.findFirstEventIndex();
        // Type assertion is required here because tsc is drunk...
        const track: MIDITrack = this._midiData.tracks[trackIndex];
        const event = track.events[this.eventIndexes[trackIndex]];
        if (ticks === undefined) {
            if (this.playedTime >= time) {
                break;
            }
        } else {
            if (event.ticks >= ticks) {
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
            case midiMessageTypes.noteOn: {
                // Track portamento control as last note
                savedControllers[channel] ??= [
                    ...defaultControllerArray
                ] as MIDIController[];
                savedControllers[channel][midiControllers.portamentoControl] =
                    event.data[0] as MIDIController;
                break;
            }

            case midiMessageTypes.noteOff: {
                break;
            }

            // Skip pitch wheel
            case midiMessageTypes.pitchWheel: {
                pitchWheels[channel] = (event.data[1] << 7) | event.data[0];
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
                    if (
                        controllerNumber === midiControllers.resetAllControllers
                    ) {
                        resetAllControllers(channel);
                    }
                    this.sendMIDICC(channel, controllerNumber, ccV);
                } else {
                    savedControllers[channel] ??= [
                        ...defaultControllerArray
                    ] as MIDIController[];
                    savedControllers[channel][controllerNumber] = event
                        .data[1] as MIDIController;
                }
                break;
            }

            case midiMessageTypes.setTempo: {
                const tempoBPM = 60_000_000 / readBigEndian(event.data, 3);
                this.oneTickToSeconds =
                    60 / (tempoBPM * this._midiData.timeDivision);
                savedTempo = event;
                savedTempoTrack = trackIndex;
                break;
            }

            /*
            Program change cannot be skipped.
            Some MIDIs edit drums via sysEx and skipping program changes causes them to be sent after, resetting the params.
            Testcase: (GS88Pro)Th19_1S(KR.Palto47)
             */

            default: {
                this.processEvent(event, trackIndex);
                break;
            }
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
            for (const [index, value] of savedControllers[channel].entries()) {
                if (
                    value !== defaultControllerArray[index] &&
                    !isCCNonSkippable(index as MIDIController)
                ) {
                    this.sendMIDICC(channel, index as MIDIController, value);
                }
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

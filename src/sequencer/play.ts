import { getEvent, MIDIMessage } from "../midi/midi_message";
import { resetArray } from "../synthetizer/audio_engine/engine_components/controller_tables";
import { nonResettableCCs } from "../synthetizer/audio_engine/engine_methods/controller_control/reset_controllers";
import {
    type MIDIController,
    midiControllers,
    midiMessageTypes
} from "../midi/enums";
import type { SpessaSynthSequencer } from "./sequencer";

// an array with preset default values
const defaultControllerArray = resetArray.slice(0, 128);

/**
 * Plays the MIDI file to a specific time or ticks.
 * @param time in seconds.
 * @param ticks optional MIDI ticks, when given is used instead of time.
 * @returns true if the MIDI file is not finished.
 */
export function playToInternal(
    this: SpessaSynthSequencer,
    time: number,
    ticks: number | undefined = undefined
): boolean {
    if (!this.hasSongs) {
        return false;
    }
    this.oneTickToSeconds = 60 / (120 * this.midiData.timeDivision);
    // reset
    this.synth.resetAllControllers();
    this.sendMIDIReset();
    this.resetTimers();

    // we save the pitch bends, programs and controllers here
    // to only send them once after going through the events

    const channelsToSave = this.synth.midiChannels.length;
    /**
     * save pitch bends here and send them only after
     */
    const pitchBends: number[] = Array(channelsToSave).fill(8192);

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
    function resetAllControlllers(chan: number) {
        // reset pitch bend
        pitchBends[chan] = 8192;
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
        // find the next event
        let trackIndex = this.findFirstEventIndex();
        const event: MIDIMessage =
            this.midiData.tracks[trackIndex][this.eventIndex[trackIndex]];
        if (ticks !== undefined) {
            if (event.ticks >= ticks) {
                break;
            }
        } else {
            if (this.playedTime >= time) {
                break;
            }
        }

        // skip note ons
        const info = getEvent(event.messageStatusByte);
        // Keep in mind midi ports to determine the channel!
        const channel =
            info.channel +
            (this.midiPortChannelOffsets[this.midiPorts[trackIndex]] || 0);
        switch (info.status) {
            // skip note messages
            case midiMessageTypes.noteOn:
                // track portamento control as last note
                if (savedControllers[channel] === undefined) {
                    savedControllers[channel] = Array.from(
                        defaultControllerArray
                    ) as MIDIController[];
                }
                savedControllers[channel][midiControllers.portamentoControl] =
                    event.messageData[0] as MIDIController;
                break;

            case midiMessageTypes.noteOff:
                break;

            // skip pitch bend
            case midiMessageTypes.pitchBend:
                pitchBends[channel] =
                    (event.messageData[1] << 7) | event.messageData[0];
                break;

            case midiMessageTypes.programChange: {
                // empty tracks cannot program change
                if (
                    this.midiData.isMultiPort &&
                    this.midiData.usedChannelsOnTrack[trackIndex].size === 0
                ) {
                    break;
                }
                const p = programs[channel];
                p.program = event.messageData[0];
                p.actualBank = p.bank;
                break;
            }

            case midiMessageTypes.controllerChange: {
                // empty tracks cannot controller change
                if (
                    this.midiData.isMultiPort &&
                    this.midiData.usedChannelsOnTrack[trackIndex].size === 0
                ) {
                    break;
                }
                // do not skip data entries
                const controllerNumber = event.messageData[0] as MIDIController;
                if (isCCNonSkippable(controllerNumber)) {
                    const ccV = event.messageData[1];
                    if (controllerNumber === midiControllers.bankSelect) {
                        // add the bank to be saved
                        programs[channel].bank = ccV;
                        break;
                    } else if (
                        controllerNumber === midiControllers.resetAllControllers
                    ) {
                        resetAllControlllers(channel);
                    }
                    if (this.sendMIDIMessages) {
                        this.sendMIDICC(channel, controllerNumber, ccV);
                    } else {
                        this.synth.controllerChange(
                            channel,
                            controllerNumber,
                            ccV
                        );
                    }
                } else {
                    if (savedControllers[channel] === undefined) {
                        savedControllers[channel] = Array.from(
                            defaultControllerArray
                        ) as MIDIController[];
                    }
                    savedControllers[channel][controllerNumber] = event
                        .messageData[1] as MIDIController;
                }
                break;
            }

            default:
                this.processEvent(event, trackIndex);
                break;
        }

        this.eventIndex[trackIndex]++;
        // find the next event
        trackIndex = this.findFirstEventIndex();
        const nextEvent =
            this.midiData.tracks[trackIndex][this.eventIndex[trackIndex]];
        if (nextEvent === undefined) {
            this.stop();
            return false;
        }
        this.playedTime +=
            this.oneTickToSeconds * (nextEvent.ticks - event.ticks);
    }

    // restoring saved controllers
    if (this.sendMIDIMessages) {
        for (
            let channelNumber = 0;
            channelNumber < channelsToSave;
            channelNumber++
        ) {
            // restore pitch bends
            if (pitchBends[channelNumber] !== undefined) {
                this.sendMIDIPitchWheel(
                    channelNumber,
                    pitchBends[channelNumber] >> 7,
                    pitchBends[channelNumber] & 0x7f
                );
            }
            if (savedControllers[channelNumber] !== undefined) {
                // every controller that has changed
                savedControllers[channelNumber].forEach((value, index) => {
                    if (
                        value !== defaultControllerArray[index] &&
                        !isCCNonSkippable(index as MIDIController)
                    ) {
                        this.sendMIDICC(channelNumber, index, value);
                    }
                });
            }
            // restore programs
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
        // for all synth channels
        for (
            let channelNumber = 0;
            channelNumber < channelsToSave;
            channelNumber++
        ) {
            // restore pitch bends
            if (pitchBends[channelNumber] !== undefined) {
                this.synth.pitchWheel(
                    channelNumber,
                    pitchBends[channelNumber] >> 7,
                    pitchBends[channelNumber] & 0x7f
                );
            }
            if (savedControllers[channelNumber] !== undefined) {
                // every controller that has changed
                savedControllers[channelNumber].forEach((value, index) => {
                    if (
                        value !== defaultControllerArray[index] &&
                        !isCCNonSkippable(index as MIDIController)
                    ) {
                        this.synth.controllerChange(
                            channelNumber,
                            index,
                            value
                        );
                    }
                });
            }
            // restore programs
            if (programs[channelNumber].actualBank >= 0) {
                const p = programs[channelNumber];
                if (p.program !== -1) {
                    // a program change has occurred, apply the actual bank when program change was executed
                    this.synth.controllerChange(
                        channelNumber,
                        midiControllers.bankSelect,
                        p.actualBank
                    );
                    this.synth.programChange(channelNumber, p.program);
                } else {
                    // no program change, apply the current bank select
                    this.synth.controllerChange(
                        channelNumber,
                        midiControllers.bankSelect,
                        p.bank
                    );
                }
            }
        }
    }
    return true;
}

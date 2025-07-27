import { getEvent, MIDIMessage } from "../midi/midi_message";
import { consoleColors } from "../utils/other";
import { SpessaSynthWarn } from "../utils/loggin";
import { readBytesAsUintBigEndian } from "../utils/byte_functions/big_endian";
import type { SpessaSynthSequencer } from "./sequencer_engine";
import { midiMessageTypes } from "../midi/enums";

/**
 * Processes a MIDI event.
 * @param event The MIDI event to process.
 * @param trackIndex The index of the track the event belongs to.
 */
export function processEventInternal(
    this: SpessaSynthSequencer,
    event: MIDIMessage,
    trackIndex: number
) {
    if (!this.midiData) {
        throw new Error("Unexpected lack of MIDI data in sequencer!");
    }
    if (this.sendMIDIMessages) {
        if (event.messageStatusByte >= 0x80) {
            this.sendMIDIMessage([
                event.messageStatusByte,
                ...event.messageData
            ]);
            return;
        }
    }
    const statusByteData = getEvent(event.messageStatusByte);
    const offset = this.midiPortChannelOffsets[this.midiPorts[trackIndex]] || 0;
    statusByteData.channel += offset;
    // process the event
    switch (statusByteData.status) {
        case midiMessageTypes.noteOn: {
            const velocity = event.messageData[1];
            if (velocity > 0) {
                this.synth.noteOn(
                    statusByteData.channel,
                    event.messageData[0],
                    velocity
                );
                this.playingNotes.push({
                    midiNote: event.messageData[0],
                    channel: statusByteData.channel,
                    velocity: velocity
                });
            } else {
                this.synth.noteOff(
                    statusByteData.channel,
                    event.messageData[0]
                );
                const toDelete = this.playingNotes.findIndex(
                    (n) =>
                        n.midiNote === event.messageData[0] &&
                        n.channel === statusByteData.channel
                );
                if (toDelete !== -1) {
                    this.playingNotes.splice(toDelete, 1);
                }
            }
            break;
        }

        case midiMessageTypes.noteOff: {
            this.synth.noteOff(statusByteData.channel, event.messageData[0]);
            const toDelete = this.playingNotes.findIndex(
                (n) =>
                    n.midiNote === event.messageData[0] &&
                    n.channel === statusByteData.channel
            );
            if (toDelete !== -1) {
                this.playingNotes.splice(toDelete, 1);
            }
            break;
        }

        case midiMessageTypes.pitchBend:
            this.synth.pitchWheel(
                statusByteData.channel,
                event.messageData[1],
                event.messageData[0]
            );
            break;

        case midiMessageTypes.controllerChange:
            // empty tracks cannot cc change
            if (
                this.midiData.isMultiPort &&
                this.midiData.usedChannelsOnTrack[trackIndex].size === 0
            ) {
                return;
            }
            this.synth.controllerChange(
                statusByteData.channel,
                event.messageData[0],
                event.messageData[1]
            );
            break;

        case midiMessageTypes.programChange:
            // empty tracks cannot program change
            if (
                this.midiData.isMultiPort &&
                this.midiData.usedChannelsOnTrack[trackIndex].size === 0
            ) {
                return;
            }
            this.synth.programChange(
                statusByteData.channel,
                event.messageData[0]
            );
            break;

        case midiMessageTypes.polyPressure:
            this.synth.polyPressure(
                statusByteData.channel,
                event.messageData[0],
                event.messageData[1]
            );
            break;

        case midiMessageTypes.channelPressure:
            this.synth.channelPressure(
                statusByteData.channel,
                event.messageData[0]
            );
            break;

        case midiMessageTypes.systemExclusive:
            this.synth.systemExclusive(event.messageData, offset);
            break;

        case midiMessageTypes.setTempo: {
            event.messageData.currentIndex = 0;
            let tempoBPM =
                60000000 / readBytesAsUintBigEndian(event.messageData, 3);
            this.oneTickToSeconds =
                60 / (tempoBPM * this.midiData.timeDivision);
            if (this.oneTickToSeconds === 0) {
                this.oneTickToSeconds = 60 / (120 * this.midiData.timeDivision);
                SpessaSynthWarn("invalid tempo! falling back to 120 BPM");
                tempoBPM = 120;
            }
            break;
        }

        // recognized but ignored
        case midiMessageTypes.timeSignature:
        case midiMessageTypes.endOfTrack:
        case midiMessageTypes.midiChannelPrefix:
        case midiMessageTypes.songPosition:
        case midiMessageTypes.activeSensing:
        case midiMessageTypes.keySignature:
        case midiMessageTypes.sequenceNumber:
        case midiMessageTypes.sequenceSpecific:
        case midiMessageTypes.text:
        case midiMessageTypes.lyric:
        case midiMessageTypes.copyright:
        case midiMessageTypes.trackName:
        case midiMessageTypes.marker:
        case midiMessageTypes.cuePoint:
        case midiMessageTypes.instrumentName:
        case midiMessageTypes.programName:
            break;

        case midiMessageTypes.midiPort:
            this.assignMIDIPort(trackIndex, event.messageData[0]);
            break;

        case midiMessageTypes.reset:
            this.synth.stopAllChannels();
            this.synth.resetAllControllers();
            break;

        default:
            SpessaSynthWarn(
                `%cUnrecognized Event: %c${event.messageStatusByte}%c status byte: %c${Object.keys(
                    midiMessageTypes
                ).find(
                    (k) =>
                        midiMessageTypes[k as keyof typeof midiMessageTypes] ===
                        statusByteData.status
                )}`,
                consoleColors.warn,
                consoleColors.unrecognized,
                consoleColors.warn,
                consoleColors.value
            );
            break;
    }
    if (statusByteData.status >= 0 && statusByteData.status < 0x80) {
        this?.onMetaEvent?.(event, trackIndex);
    }
}

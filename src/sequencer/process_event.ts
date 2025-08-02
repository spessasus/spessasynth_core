import { getEvent, MIDIMessage } from "../midi/midi_message";
import { consoleColors } from "../utils/other";
import { SpessaSynthWarn } from "../utils/loggin";
import { readBigEndian } from "../utils/byte_functions/big_endian";
import type { SpessaSynthSequencer } from "./sequencer";
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
    if (this.externalMIDIPlayback) {
        // Do not send meta events
        if (event.statusByte >= 0x80) {
            this.sendMIDIMessage([event.statusByte, ...event.data]);
            return;
        }
    }
    const track = this._midiData.tracks[trackIndex];
    const statusByteData = getEvent(event.statusByte);
    const offset =
        this.midiPortChannelOffsets[this.currentMIDIPorts[trackIndex]] || 0;
    statusByteData.channel += offset;
    // Process the event
    switch (statusByteData.status) {
        case midiMessageTypes.noteOn: {
            const velocity = event.data[1];
            if (velocity > 0) {
                this.synth.noteOn(
                    statusByteData.channel,
                    event.data[0],
                    velocity
                );
                this.playingNotes.push({
                    midiNote: event.data[0],
                    channel: statusByteData.channel,
                    velocity: velocity
                });
            } else {
                this.synth.noteOff(statusByteData.channel, event.data[0]);
                const toDelete = this.playingNotes.findIndex(
                    (n) =>
                        n.midiNote === event.data[0] &&
                        n.channel === statusByteData.channel
                );
                if (toDelete !== -1) {
                    this.playingNotes.splice(toDelete, 1);
                }
            }
            break;
        }

        case midiMessageTypes.noteOff: {
            this.synth.noteOff(statusByteData.channel, event.data[0]);
            const toDelete = this.playingNotes.findIndex(
                (n) =>
                    n.midiNote === event.data[0] &&
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
                event.data[1],
                event.data[0]
            );
            break;

        case midiMessageTypes.controllerChange:
            // Empty tracks cannot cc change
            if (this._midiData.isMultiPort && track.channels.size === 0) {
                return;
            }
            this.synth.controllerChange(
                statusByteData.channel,
                event.data[0],
                event.data[1]
            );
            break;

        case midiMessageTypes.programChange:
            // Empty tracks cannot program change
            if (this._midiData.isMultiPort && track.channels.size === 0) {
                return;
            }
            this.synth.programChange(statusByteData.channel, event.data[0]);
            break;

        case midiMessageTypes.polyPressure:
            this.synth.polyPressure(
                statusByteData.channel,
                event.data[0],
                event.data[1]
            );
            break;

        case midiMessageTypes.channelPressure:
            this.synth.channelPressure(statusByteData.channel, event.data[0]);
            break;

        case midiMessageTypes.systemExclusive:
            this.synth.systemExclusive(event.data, offset);
            break;

        case midiMessageTypes.setTempo: {
            event.data.currentIndex = 0;
            let tempoBPM = 60000000 / readBigEndian(event.data, 3);
            this.oneTickToSeconds =
                60 / (tempoBPM * this._midiData.timeDivision);
            if (this.oneTickToSeconds === 0) {
                this.oneTickToSeconds =
                    60 / (120 * this._midiData.timeDivision);
                SpessaSynthWarn("invalid tempo! falling back to 120 BPM");
                tempoBPM = 120;
            }
            break;
        }

        // Recognized but ignored
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
            this.assignMIDIPort(trackIndex, event.data[0]);
            break;

        case midiMessageTypes.reset:
            this.synth.stopAllChannels();
            this.synth.resetAllControllers();
            break;

        default:
            SpessaSynthWarn(
                `%cUnrecognized Event: %c${event.statusByte}%c status byte: %c${Object.keys(
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
        this.callEvent("metaEvent", {
            event,
            trackIndex
        });
    }
}

import { MIDIMessage } from "../midi/midi_message";
import {
    DEFAULT_MIDI_CONTROLLERS,
    RP_15_RESET_CC_NUMS
} from "../synthesizer/audio_engine/channel/reset";
import {
    type MIDIController,
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../midi/enums";
import type { SpessaSynthSequencer } from "./sequencer";
import { readBigEndian } from "../utils/byte_functions/big_endian";
import { MIDIUtils } from "../midi/midi_tools/midi_utils";
import { ParameterTracker } from "../midi/midi_tools/parameter_tracker";
import { CONTROLLER_TABLE_SIZE } from "../synthesizer/audio_engine/synth_constants";

const nonSkippableCCs = new Set<MIDIController>([
    MIDIControllers.dataDecrement,
    MIDIControllers.dataIncrement,
    MIDIControllers.dataEntryMSB,
    MIDIControllers.dataEntryLSB,
    MIDIControllers.registeredParameterLSB,
    MIDIControllers.registeredParameterMSB,
    MIDIControllers.nonRegisteredParameterLSB,
    MIDIControllers.nonRegisteredParameterMSB,
    MIDIControllers.bankSelect,
    MIDIControllers.bankSelectLSB,
    MIDIControllers.resetAllControllers,
    MIDIControllers.monoModeOn,
    MIDIControllers.polyModeOn
] as const);

interface ChannelStatus {
    /**
     * NRPN tracking for controller changes
     */
    param: ParameterTracker;
    /**
     * Save controllers and send them only after.
     */
    controllers: Int16Array;
    /**
     * Save portamento notes and send them only after (-1 means no portamento note).
     */
    portamentoNote: number;
    /**
     * Save pitch wheels and send them only after.
     */
    pitchWheel: number;
}

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
    this.index = 0;

    // We save the pitch wheels, programs and controllers here
    // To only send them once after going through the events

    const createChannelStatus = (channel: number): ChannelStatus => ({
        pitchWheel: 8192,
        controllers: new Int16Array(DEFAULT_MIDI_CONTROLLERS),
        param: new ParameterTracker(channel),
        portamentoNote: -1
    });
    const channels: ChannelStatus[] = [];
    for (let i = 0; i < this.synth.midiChannels.length; i++) {
        channels.push(createChannelStatus(i));
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
    const resetAllControllers = (chan: number) => {
        const ch = channels[chan];
        // Reset pitch wheel
        ch.pitchWheel = 8192;
        ch.param.resetAllControllers();
        for (const resetCC of RP_15_RESET_CC_NUMS)
            ch.controllers[resetCC] = DEFAULT_MIDI_CONTROLLERS[resetCC];
        // Forward it, so the synth's parameter selection matches the following data entries
        this.sendMIDICC(chan, MIDIControllers.resetAllControllers, 0);
    };

    const { timeline, tracks } = this._midiData;
    // Start with the same ports as a fresh playback, MIDI port events update them
    this.currentMIDIPorts = tracks.map((t) => t.port);

    while (true) {
        // Find the next event
        const e = timeline[this.index];
        if (e === undefined) {
            this.stop();
            return false;
        }
        const trackIndex = e.tr;
        const track = tracks[trackIndex];
        const event = track.events[e.ev];
        if (ticks === undefined) {
            if (this.playedTime >= time) break;
        } else if (event.ticks >= ticks) break;

        // Skip note ons
        let status: MIDIMessageType;
        let statusChannel = 0;
        if (event.statusByte >= 0x80 && event.statusByte < 0xf0) {
            // Voice message
            status = (event.statusByte & 0xf0) as MIDIMessageType;
            statusChannel = event.statusByte & 0x0f;
        } else {
            status = event.statusByte;
        }

        // Keep in mind midi ports to determine the channel!
        // Use the current port, like the playback does
        const portOffset =
            this.midiPortChannelOffsets[this.currentMIDIPorts[trackIndex]] ?? 0;
        const channel = statusChannel + portOffset;

        // Ensure that the channel is always there (ports may be added during the seek)
        channels[channel] ??= createChannelStatus(channel);

        const ch = channels[channel];

        switch (status) {
            // Skip note messages
            case MIDIMessageTypes.noteOn: {
                // Always track the last note, even if portamento isn't applied.
                // See: https://github.com/spessasus/spessasynth_core/issues/77
                ch.portamentoNote = event.data[0];
                break;
            }

            case MIDIMessageTypes.noteOff: {
                break;
            }

            // Skip pitch wheel
            case MIDIMessageTypes.pitchWheel: {
                ch.pitchWheel = (event.data[1] << 7) | event.data[0];
                break;
            }

            case MIDIMessageTypes.systemExclusive: {
                const analyzedMessages = MIDIUtils.analyzeSysEx(event.data);
                // The whole message is sent at most once, even if it has many results
                let shouldProcess = false;
                for (const analyzed of analyzedMessages)
                    // Sysex may change controllers
                    switch (analyzed.type) {
                        default: {
                            shouldProcess = true;
                            break;
                        }

                        /*
                        Program change cannot be skipped.
                        Some MIDIs edit drums via sysEx and skipping program changes causes them to be sent after, resetting the params.
                        Testcase: (GS88Pro)Th19_1S(KR.Palto47)
                         */

                        case "Controller Change": {
                            const { controller, value } = analyzed;
                            // The SysEx channel is relative to the port, like in the playback
                            const channel = analyzed.channel + portOffset;
                            // Channel number may be above 15
                            if (channel >= this.synth.midiChannels.length)
                                break;
                            channels[channel] ??= createChannelStatus(channel);
                            // Empty tracks cannot controller change
                            if (
                                this._midiData.isMultiPort &&
                                track.channels.size === 0
                            )
                                break;

                            if (
                                controller ===
                                MIDIControllers.resetAllControllers
                            ) {
                                resetAllControllers(channel);
                                break;
                            }
                            if (nonSkippableCCs.has(controller))
                                this.sendMIDICC(channel, controller, value);
                            else
                                channels[channel].controllers[controller] =
                                    value << 7;
                        }
                    }
                if (shouldProcess) this.processEvent(event, trackIndex);
                break;
            }

            case MIDIMessageTypes.controllerChange: {
                // Empty tracks cannot controller change
                if (this._midiData.isMultiPort && track.channels.size === 0)
                    break;

                const controller = event.data[0] as MIDIController;
                const value = event.data[1];

                switch (controller) {
                    default: {
                        if (
                            controller === MIDIControllers.resetAllControllers
                        ) {
                            resetAllControllers(channel);
                            break;
                        }
                        if (nonSkippableCCs.has(controller))
                            this.sendMIDICC(channel, controller, value);
                        else ch.controllers[controller] = value << 7;
                        break;
                    }

                    // Parameter tracking
                    case MIDIControllers.registeredParameterMSB:
                    case MIDIControllers.registeredParameterLSB:
                    case MIDIControllers.nonRegisteredParameterLSB:
                    case MIDIControllers.nonRegisteredParameterMSB: {
                        // Track and event indexes are irrelevant here
                        ch.param.controllerChange(controller, value, 0, 0);
                        // Always send regardless
                        this.sendMIDICC(channel, controller, value);
                        break;
                    }

                    case MIDIControllers.dataEntryMSB:
                    case MIDIControllers.dataEntryLSB: {
                        const analyzed = ch.param.controllerChange(
                            controller,
                            value,
                            0,
                            0
                        )!;
                        // Always send regardless
                        this.sendMIDICC(channel, controller, value);

                        // NRPN may change controllers
                        switch (analyzed.type) {
                            default: {
                                break;
                            }

                            case "Controller Change": {
                                if (nonSkippableCCs.has(analyzed.controller))
                                    this.sendMIDICC(
                                        channel,
                                        analyzed.controller,
                                        analyzed.value
                                    );
                                else
                                    ch.controllers[analyzed.controller] =
                                        analyzed.value << 7;
                            }
                        }
                        break;
                    }
                }

                break;
            }

            case MIDIMessageTypes.setTempo: {
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

        // Find the next event
        const nE = timeline[++this.index];
        if (nE === undefined) {
            this.stop();
            return false;
        }
        const nextEvent = tracks[nE.tr].events[nE.ev];
        this.playedTime +=
            this.oneTickToSeconds * (nextEvent.ticks - event.ticks);
    }

    // For all synth channels (including the ones added during the seek)
    const channelsToRestore = Math.min(
        channels.length,
        this.synth.midiChannels.length
    );
    for (let channel = 0; channel < channelsToRestore; channel++) {
        const ch = channels[channel] ?? createChannelStatus(channel);
        // Restoring pitch wheels
        this.sendMIDIPitchWheel(channel, ch.pitchWheel);

        // Restoring portamento (only if currently active)
        // Note: we do it before controllers as portamento control may want to override it
        if (ch.portamentoNote >= 0) {
            if (this.externalMIDIPlayback) {
                this.sendMIDICC(
                    channel,
                    MIDIControllers.portamentoControl,
                    ch.portamentoNote
                );
            } else {
                this.synth.midiChannels[channel].setLastNote(ch.portamentoNote);
            }
        }

        // Restoring saved controllers
        // Every controller that has changed
        for (let i = 0; i < CONTROLLER_TABLE_SIZE; i++) {
            // 14-bit, defaults are also 14-bit
            const value = ch.controllers[i];
            if (
                value !== DEFAULT_MIDI_CONTROLLERS[i] &&
                !nonSkippableCCs.has(i as MIDIController)
            ) {
                this.sendMIDICC(channel, i as MIDIController, value >> 7);
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

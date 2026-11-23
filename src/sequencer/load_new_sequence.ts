import { ConsoleColors, formatTime } from "../utils/other";
import { SpessaLog } from "../utils/loggin";
import { BasicMIDI } from "../midi/basic_midi";
import type { SpessaSynthSequencer } from "./sequencer";
import { PortTracker } from "../midi/midi_tools/port_tracker";

/**
 * Loads a new sequence internally.
 * @param parsedMIDI The parsed MIDI data to load.
 */
export function loadNewSequenceInternal(
    this: SpessaSynthSequencer,
    parsedMIDI: BasicMIDI
) {
    this.oneTickToSeconds = 60 / (120 * parsedMIDI.timeDivision);
    this._midiData = parsedMIDI;
    this.isFinished = false;

    // Clear old embedded bank if exists
    this.synth.clearEmbeddedSoundBank();

    // Check for embedded soundfont
    if (this._midiData.embeddedSoundBank !== undefined) {
        SpessaLog.info(
            "%cEmbedded soundbank detected! Using it.",
            ConsoleColors.recognized
        );
        this.synth.setEmbeddedSoundBank(
            this._midiData.embeddedSoundBank,
            this._midiData.bankOffset
        );

        // Preload if it has an embedded sound bank
        if (this.preload) {
            this._midiData.preloadSynth(this.synth);
        }
    }

    // Copy over the port data
    this.ports = new PortTracker(this._midiData);
    // Add channels for every port that plays notes
    const channelCount = 16 + Math.max(...this._midiData.portChannelOffsetMap);
    while (this.synth.midiChannels.length < channelCount) this.addNewMIDIPort();
    this.firstNoteTime = this._midiData.midiTicksToSeconds(
        this._midiData.firstNoteOn
    );
    SpessaLog.info(
        `%cTotal song time: ${formatTime(Math.ceil(this._midiData.duration)).time}`,
        ConsoleColors.recognized
    );
    this.callEvent("songChange", { songIndex: this._songIndex });

    if (this._midiData.duration === 0) {
        // The song is loaded, but there is nothing to play
        // https://github.com/spessasus/SpessaSynth/issues/106
        SpessaLog.warn("This MIDI file has a duration of exactly 0 seconds.");
        this.pausedTime = 0;
        this.isFinished = true;
        return;
    }

    if (this._midiData.duration <= 0.2) {
        SpessaLog.warn(
            `%cVery short song: (${formatTime(Math.round(this._midiData.duration)).time}). Disabling loop!`,
            ConsoleColors.warn
        );
        this.loopCount = 0;
    }
    // Reset the time
    this.currentTime = 0;
}

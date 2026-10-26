import type { BasicMIDI } from "../../basic_midi";
import { MIDITrack } from "../../midi_track";
import { MIDIMessage } from "../../midi_message";
import {
    MIDIControllers,
    type MIDIMessageType,
    MIDIMessageTypes
} from "../../enums";
import { IndexedByteArray } from "../../../utils/indexed_array";
import { getStringBytes } from "../../../utils/byte_functions/string";
import { SpessaLog } from "../../../utils/loggin";
import { ConsoleColors } from "../../../utils/other";
import { MIDIUtils } from "../../midi_tools/midi_utils";
import { TrackerChannel } from "./tracker_channel";
import {
    OFFSET_COARSE_CC,
    OFFSET_FINE_CC,
    TrackerMIDITrack
} from "./tracker_midi_track";
import { createTrackerSoundBank } from "./tracker_sound_bank";
import { NOTE_MAX, TrackerPattern } from "./tracker_pattern";
import {
    type TrackerEnvelope,
    type TrackerInstrument,
    TrackerLoopTypes,
    type TrackerSample
} from "./types";

/**
 * One MIDI tick is one tracker tick.
 * With 24 ticks per quarter note, the MIDI tempo in BPM equals the tracker tempo,
 * and a quarter note is four rows at speed 6.
 */
const TRACKER_TIME_DIVISION = 24;

/**
 * The period of the C-4 note, with four times the Amiga precision (MOD, XM and S3M share this scale).
 */
export const MIDDLE_C_PERIOD = 1712;

/**
 * The playback rate of the C-4 note at the default finetune, in Hertz.
 */
export const MIDDLE_C_RATE = 8363;

/**
 * Safety limit for modules that never end.
 */
const MAX_ROWS = 100_000;

/**
 * The amount of tracker channels per MIDI port.
 * Channel 10 is switched from drums to a melodic part, see {@link TrackerMIDITrack.finish}.
 */
const CHANNELS_PER_PORT = 16;

/**
 * Creates a disabled envelope.
 */
export function emptyEnvelope() {
    return {
        enabled: false,
        points: [],
        sustainPoint: -1,
        loopStart: -1,
        loopEnd: -1
    } as TrackerEnvelope;
}

/**
 * Creates an instrument that maps every note to a single sample.
 * Used for the formats without instruments.
 * @param name The instrument name.
 * @param sampleIndex The index of the sample in the module.
 */
export function singleSampleInstrument(name: string, sampleIndex: number) {
    return {
        name,
        sampleMap: new Int16Array(NOTE_MAX).fill(sampleIndex),
        volumeEnvelope: emptyEnvelope(),
        panningEnvelope: emptyEnvelope(),
        fadeout: 0
    } as TrackerInstrument;
}

/**
 * The base class of all tracker module formats.
 *
 * The derived classes parse the module into the shared representation (orders, patterns, samples, instruments)
 * and implement the format-specific effects using the primitives of {@link TrackerChannel}.
 * This class plays the module tick by tick and converts it to MIDI events with an embedded sound bank:
 * - Each tracker channel becomes one MIDI channel on its own track.
 * - Each sample becomes one preset. Notes select the preset with program changes (and bank select above 127).
 * - Pitch is the closest key plus the pitch wheel. The pitch wheel range is set per channel to fit the highest offset.
 * - Volume and envelopes are sent as main volume and expression, panning as the pan controller.
 * - Sample offsets are sent as two controllers that modulate the sample start in the sound bank.
 */
export abstract class TrackerModule {
    public title = "";
    /**
     * The order list. Values below zero are skipped (Scream Tracker marker patterns).
     */
    protected orders = new Array<number>();
    protected patterns = new Array<TrackerPattern>();
    protected samples = new Array<TrackerSample>();
    protected instruments = new Array<TrackerInstrument>();
    protected channelCount = 0;
    /**
     * The initial panning of each channel (0-255).
     */
    protected channelPanning = new Array<number>();
    protected initialSpeed = 6;
    protected initialTempo = 125;
    protected initialGlobalVolume = 64;
    /**
     * The order to continue from after the last order, -1 if the song stops.
     */
    protected restartPosition = -1;
    /**
     * The minimum period that slides can reach.
     */
    protected minPeriod = 1;
    /**
     * The maximum period that slides can reach.
     */
    protected maxPeriod = 32_000;
    /**
     * Extra text written into the RMIDI comment (sample names, song message).
     */
    protected comment = "";
    /**
     * The song artist, written into the RMIDI artist. Empty if the module does not store it.
     */
    protected artist = "";
    /**
     * The name of the tracker that saved the module, written into the RMIDI software. Empty if unknown.
     */
    protected madeWith = "";
    /**
     * If the format pans with square root (constant power) gains instead of linear gains.
     */
    protected squareRootPanning = false;
    /**
     * The MIDI key at which the samples play at their middle C rate.
     * Only affects the displayed notes, as the sound bank samples use the same root key.
     */
    protected rootKey = 60;
    /**
     * If a pattern break to a row above 63 is ignored instead of breaking to the first row.
     */
    protected ignoreInvalidBreaks = false;

    // Playback state

    protected speed = 6;
    protected globalVolume = 64;
    /**
     * The tick of the current row.
     */
    protected tick = 0;
    /**
     * The format name, written into the RMIDI comment.
     */
    protected abstract readonly formatName: string;
    /**
     * The attenuation of every sample in centibels, set with {@link setPreAmp}.
     */
    private attenuation = 0;
    private tempo = 125;
    private channels = new Array<TrackerChannel>();
    private positionJump = -1;
    private breakRow = -1;
    private patternLoopRow = -1;
    private patternDelay = 0;
    private songEnded = false;
    private currentRow = 0;
    private lastNoteOnTick = -1;

    /**
     * Parses the module file.
     * @param binary The file data.
     */
    public abstract parse(binary: IndexedByteArray): void;

    /**
     * Converts the module into the given MIDI.
     * @param outputMIDI The MIDI to populate.
     * @param fileName The file name.
     */
    public toMIDI(outputMIDI: BasicMIDI, fileName: string) {
        SpessaLog.group(
            `%cConverting ${this.formatName} "${this.title}"...`,
            ConsoleColors.info
        );
        this.speed = this.initialSpeed;
        this.tempo = this.initialTempo;
        this.globalVolume = this.initialGlobalVolume;
        this.channels = [];
        const outputs = new Array<TrackerMIDITrack>();
        for (let i = 0; i < this.channelCount; i++) {
            this.channels.push(
                new TrackerChannel(i, this.channelPanning[i] ?? 128)
            );
            outputs.push(
                new TrackerMIDITrack(
                    i % CHANNELS_PER_PORT,
                    Math.floor(i / CHANNELS_PER_PORT)
                )
            );
        }

        const conductor = new MIDITrack();
        conductor.name = this.title;
        const conductorEvent = (
            ticks: number,
            type: MIDIMessageType,
            data: ArrayLike<number>
        ) =>
            conductor.pushEvents(
                new MIDIMessage(ticks, type, new IndexedByteArray(data))
            );
        conductorEvent(
            0,
            MIDIMessageTypes.trackName,
            getStringBytes(this.title)
        );
        // GS reset, so the synthesizer starts from a known state
        conductor.pushEvents(MIDIUtils.reset(0, "gs"));
        const writeTempo = (ticks: number) => {
            const microseconds = Math.round(60_000_000 / this.tempo);
            conductorEvent(ticks, MIDIMessageTypes.setTempo, [
                (microseconds >> 16) & 0xff,
                (microseconds >> 8) & 0xff,
                microseconds & 0xff
            ]);
        };
        writeTempo(0);

        // Play the module
        const emptyPattern = new TrackerPattern(64, this.channelCount);
        const visitedRows = new Map<number, number>();
        let absoluteTick = 0;
        let order = 0;
        let row = 0;
        let lastOrder = -1;
        let loopStart = -1;
        for (let rowCount = 0; rowCount < MAX_ROWS; rowCount++) {
            if (this.songEnded) {
                break;
            }
            if (order >= this.orders.length) {
                // Jump to the restart position, the visited row check detects the loop
                if (
                    this.restartPosition < 0 ||
                    this.restartPosition >= this.orders.length
                ) {
                    break;
                }
                order = this.restartPosition;
                row = 0;
                continue;
            }
            const patternIndex = this.orders[order];
            if (patternIndex < 0) {
                order++;
                row = 0;
                continue;
            }
            const pattern = this.patterns[patternIndex] ?? emptyPattern;
            if (row >= pattern.rows) {
                order++;
                row = 0;
                continue;
            }

            // Detect the song looping back
            const rowKey = order * 1024 + row;
            const visitedTick = visitedRows.get(rowKey);
            if (visitedTick !== undefined) {
                loopStart = visitedTick;
                break;
            }
            visitedRows.set(rowKey, absoluteTick);
            if (order !== lastOrder) {
                lastOrder = order;
                conductorEvent(
                    absoluteTick,
                    MIDIMessageTypes.marker,
                    getStringBytes(`Pattern ${patternIndex}`)
                );
            }

            // Row start (tick 0)
            this.positionJump = -1;
            this.breakRow = -1;
            this.patternLoopRow = -1;
            this.patternDelay = 0;
            this.currentRow = row;
            this.tick = 0;
            const tempo = this.tempo;
            for (const channel of this.channels) {
                const offset = pattern.getCellOffset(row, channel.index);
                channel.rowNote = pattern.getNote(offset);
                channel.rowInstrument = pattern.getInstrument(offset);
                channel.rowVolume = pattern.getVolume(offset);
                channel.rowEffect = pattern.getEffect(offset);
                channel.rowParam = pattern.getParam(offset);
                channel.noteDelayTick = -1;
                channel.noteCutTick = -1;
                channel.arpeggio = 0;
                channel.volumeDelta = 0;
                this.processRow(channel);
            }
            if (this.tempo !== tempo) {
                writeTempo(absoluteTick);
            }
            if (this.songEnded) {
                break;
            }

            // Render every tick of the row
            const rowTicks = this.speed * (this.patternDelay + 1);
            for (let t = 0; t < rowTicks; t++) {
                this.tick = t % this.speed;
                for (const channel of this.channels) {
                    // The first tick of a row repeated by a pattern delay does nothing
                    if (this.tick > 0) {
                        this.processTick(channel);
                    }
                    if (this.tick === channel.noteCutTick) {
                        channel.volume = 0;
                    }
                    this.updateChannel(channel);
                    this.writeChannel(
                        channel,
                        outputs[channel.index],
                        absoluteTick
                    );
                }
                absoluteTick++;
            }

            // Advance to the next row
            if (this.patternLoopRow >= 0) {
                // Allow the looped rows to play again
                for (let r = this.patternLoopRow; r <= row; r++) {
                    visitedRows.delete(order * 1024 + r);
                }
                row = this.patternLoopRow;
            } else if (this.positionJump >= 0 || this.breakRow >= 0) {
                order = this.positionJump >= 0 ? this.positionJump : order + 1;
                row = Math.max(0, this.breakRow);
            } else {
                row++;
            }
        }

        // Only keep loops that contain notes (some modules loop on an empty pattern to stop)
        if (loopStart >= 0 && this.lastNoteOnTick >= loopStart) {
            conductorEvent(
                loopStart,
                MIDIMessageTypes.marker,
                getStringBytes("loopStart")
            );
            conductorEvent(
                absoluteTick,
                MIDIMessageTypes.marker,
                getStringBytes("loopEnd")
            );
        }

        outputMIDI.fileName = fileName;
        outputMIDI.format = 1;
        outputMIDI.timeDivision = TRACKER_TIME_DIVISION;
        outputMIDI.tracks = [
            conductor,
            ...outputs.map((o, i) => o.finish(`Channel ${i + 1}`, absoluteTick))
        ];
        outputMIDI.embeddedSoundBank = createTrackerSoundBank(
            this.samples,
            this.title,
            this.formatName,
            this.rootKey,
            this.attenuation
        );
        outputMIDI.bankOffset = 0;
        const info = (key: keyof typeof outputMIDI.rmidiInfo, text: string) => {
            outputMIDI.rmidiInfo[key] = getStringBytes(text, true);
        };
        info("name", this.title);
        // The comment already notes the conversion
        info("software", this.madeWith || "SpessaSynth");
        if (this.artist) {
            info("artist", this.artist);
        }
        info(
            "comment",
            `Converted from ${this.formatName} with SpessaSynth` +
                // Names are padded with spaces
                `${this.comment ? `\n${this.comment.replaceAll(/ +$/gm, "")}` : ""}`
        );
        // Module texts are stored one byte per character
        info("infoEncoding", "ISO-8859-1");
        outputMIDI.flush();
        SpessaLog.info(
            `%cConverted ${absoluteTick} ticks, ${this.samples.length} samples.`,
            ConsoleColors.recognized
        );
        SpessaLog.groupEnd();
    }

    /**
     * Processes the first tick of a row for a channel. The row data is in the channel's row fields.
     * @param channel The channel to process.
     */
    protected abstract processRow(channel: TrackerChannel): void;

    /**
     * Processes a non-first tick of a row for a channel. The current tick is in {@link tick}.
     * @param channel The channel to process.
     */
    protected abstract processTick(channel: TrackerChannel): void;

    /**
     * Converts a one-based note to a period.
     * @param note The note.
     * @param channel The channel, containing the sample and the finetune.
     */
    protected abstract noteToPeriod(
        note: number,
        channel: TrackerChannel
    ): number;

    /**
     * Converts a period to the playback rate of the sample in Hertz.
     * @param period The period.
     */
    protected abstract periodToFrequency(period: number): number;

    /**
     * Updates the channel after the effects of every tick (envelopes, automatic vibrato). Does nothing by default.
     * @param channel The channel to update.
     */
    protected updateChannel(channel: TrackerChannel) {
        void channel;
    }

    /**
     * Selects the sample for a note from the channel's instrument.
     * @param channel The channel.
     * @param note The one-based note.
     * @returns The selected sample, undefined if there is no playable sample.
     */
    protected selectSample(channel: TrackerChannel, note: number) {
        const index = channel.instrument?.sampleMap[note - 1] ?? -1;
        const sample = this.samples[index];
        if (!sample || sample.data.length === 0) {
            channel.sample = undefined;
            channel.sampleIndex = -1;
            return undefined;
        }
        channel.sample = sample;
        channel.sampleIndex = index;
        return sample;
    }

    /**
     * Triggers a note with the channel's sample.
     * @param channel The channel.
     * @param note The one-based note.
     */
    protected triggerNote(channel: TrackerChannel, note: number) {
        if (!channel.sample) {
            return;
        }
        channel.period = this.noteToPeriod(note, channel);
        channel.targetPeriod = channel.period;
        channel.trigger = true;
        channel.sampleOffset = 0;
        channel.resetWaveforms();
    }

    /**
     * Slides the period, clamping it to the format's limits.
     * @param channel The channel.
     * @param amount The amount to add to the period.
     */
    protected slidePeriod(channel: TrackerChannel, amount: number) {
        if (channel.period === 0) {
            return;
        }
        channel.period = Math.min(
            this.maxPeriod,
            Math.max(this.minPeriod, channel.period + amount)
        );
    }

    /**
     * Sets the attenuation from the pre-amp of the module player, 64 being the level of a 4 channel MOD.
     * @param preAmp The pre-amp value.
     */
    protected setPreAmp(preAmp: number) {
        // Calibrated against OpenMPT. The synthesizer applies 0.4 of the generator's attenuation
        this.attenuation = Math.round(85 + 500 * Math.log10(64 / preAmp));
    }

    protected setSpeed(speed: number) {
        if (speed > 0) {
            this.speed = speed;
        }
    }

    protected setTempo(tempo: number) {
        if (tempo >= 32) {
            this.tempo = tempo;
        }
    }

    /**
     * Stops the song after the current row.
     */
    protected stopSong() {
        this.songEnded = true;
    }

    protected setPositionJump(order: number) {
        this.positionJump = order;
    }

    /**
     * Breaks to a row of the next order.
     * @param param The effect parameter, the row as a binary-coded decimal.
     */
    protected patternBreak(param: number) {
        const row = (param >> 4) * 10 + (param & 0x0f);
        if (row < 64) {
            this.breakRow = row;
        } else if (!this.ignoreInvalidBreaks) {
            this.breakRow = 0;
        }
    }

    protected setPatternDelay(rows: number) {
        if (this.patternDelay === 0) {
            this.patternDelay = rows;
        }
    }

    /**
     * Processes a pattern loop effect.
     * @param channel The channel.
     * @param count Zero sets the loop start, other values loop that many times.
     */
    protected patternLoop(channel: TrackerChannel, count: number) {
        if (count === 0) {
            channel.patternLoopRow = this.currentRow;
            return;
        }
        if (channel.patternLoopCount === 0) {
            channel.patternLoopCount = count;
        } else if (--channel.patternLoopCount === 0) {
            return;
        }
        this.patternLoopRow = channel.patternLoopRow;
    }

    /**
     * Writes the MIDI events of a channel for the current tick.
     * @param channel The channel.
     * @param output The MIDI track of the channel.
     * @param ticks The current MIDI tick.
     */
    private writeChannel(
        channel: TrackerChannel,
        output: TrackerMIDITrack,
        ticks: number
    ) {
        if (channel.stop) {
            channel.stop = false;
            output.noteOff(ticks);
        }
        const sample = channel.sample;
        if (channel.trigger) {
            channel.trigger = false;
            output.noteOff(ticks);
            if (!sample) {
                return;
            }
            let offset = channel.sampleOffset;
            if (offset >= sample.data.length) {
                if (sample.loopType === TrackerLoopTypes.none) {
                    return;
                }
                offset = sample.loopStart;
            }
            output.selectPreset(ticks, channel.sampleIndex);
            const units = Math.floor(offset / 256);
            output.controllerChange(ticks, OFFSET_FINE_CC, units & 0x7f);
            output.controllerChange(ticks, OFFSET_COARSE_CC, units >> 7);
            const semitones = this.getSemitones(channel, sample);
            if (semitones === undefined) {
                return;
            }
            const key = Math.min(127, Math.max(0, Math.round(semitones)));
            this.writeControllers(channel, output, ticks);
            output.setPitch(ticks, semitones - key);
            output.noteOn(ticks, key);
            this.lastNoteOnTick = ticks;
            return;
        }
        if (output.activeKey === -1 || !sample) {
            return;
        }
        const semitones = this.getSemitones(channel, sample);
        if (semitones !== undefined) {
            output.setPitch(ticks, semitones - output.activeKey);
        }
        this.writeControllers(channel, output, ticks);
    }

    /**
     * Computes the MIDI pitch of the channel relative to the sound bank sample.
     * @param channel The channel.
     * @param sample The playing sample.
     * @returns The pitch in semitones, undefined if the channel has no pitch.
     */
    private getSemitones(channel: TrackerChannel, sample: TrackerSample) {
        const period =
            channel.period + channel.vibratoDelta + channel.autoVibratoDelta;
        if (period <= 0) {
            return undefined;
        }
        const frequency = this.periodToFrequency(period);
        if (frequency <= 0) {
            return undefined;
        }
        return (
            this.rootKey +
            12 * Math.log2(frequency / Math.round(sample.middleCRate)) +
            channel.arpeggio
        );
    }

    private writeControllers(
        channel: TrackerChannel,
        output: TrackerMIDITrack,
        ticks: number
    ) {
        // Volume controllers have a squared response
        const volume = channel.tremorMuted
            ? 0
            : Math.min(64, Math.max(0, channel.volume + channel.volumeDelta)) /
              64;
        const expression =
            (this.globalVolume / 64) *
            channel.envelopeVolume *
            channel.fadeoutVolume;
        output.controllerChange(
            ticks,
            MIDIControllers.mainVolume,
            Math.min(127, Math.round(128 * Math.sqrt(volume)))
        );
        output.controllerChange(
            ticks,
            MIDIControllers.expression,
            Math.min(127, Math.round(128 * Math.sqrt(expression)))
        );
        let panning = channel.panning;
        if (channel.envelopePanning !== 32) {
            panning +=
                ((channel.envelopePanning - 32) *
                    (128 - Math.abs(panning - 128))) /
                32;
        }
        // The synthesizer pans with the sine law, keep the same gain ratio between left and right
        const clamped = Math.min(256, Math.max(0, panning));
        const angle =
            (this.squareRootPanning
                ? Math.atan2(Math.sqrt(clamped), Math.sqrt(256 - clamped))
                : Math.atan2(clamped, 256 - clamped)) /
            (Math.PI / 2);
        output.controllerChange(
            ticks,
            MIDIControllers.pan,
            Math.min(127, Math.max(0, Math.round(64 + (angle - 0.5) * 128)))
        );
    }
}

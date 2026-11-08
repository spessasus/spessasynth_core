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
    FILTER_CUTOFF_CC,
    FILTER_CUTOFF_RANGE,
    FILTER_RESONANCE_CC,
    FILTER_RESONANCE_RANGE,
    OFFSET_COARSE_CC,
    OFFSET_FINE_CC,
    OFFSET_FINEST_CC,
    TrackerMIDITrack
} from "./tracker_midi_track";
import { TrackerSampleBank } from "./tracker_sound_bank";
import { NOTE_MAX, TrackerPattern } from "./tracker_pattern";
import type {
    TrackerEnvelope,
    TrackerInstrument,
    TrackerSample
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
 * The maximum number of voices (pattern channels and background voices), like Impulse Tracker.
 */
const MAX_VOICES = 256;

/**
 * The cutoff (in absolute cents) at which the synthesizer's filter is fully open.
 */
const FILTER_OPEN_CENTS = 13_500;

/**
 * Creates a disabled envelope.
 */
export function emptyEnvelope() {
    return {
        enabled: false,
        points: [],
        sustainPoint: -1,
        sustainStart: -1,
        loopStart: -1,
        loopEnd: -1
    } as TrackerEnvelope;
}

/**
 * Gets the value of an envelope at a position, interpolating linearly between the points.
 * @param envelope The envelope.
 * @param tick The position.
 * @returns The value (0-64).
 */
export function getEnvelopeValue(envelope: TrackerEnvelope, tick: number) {
    const points = envelope.points;
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (tick < b.tick) {
            if (tick <= a.tick || b.tick === a.tick) {
                return a.value;
            }
            return (
                a.value +
                ((b.value - a.value) * (tick - a.tick)) / (b.tick - a.tick)
            );
        }
    }
    return points[points.length - 1]?.value ?? 64;
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
 *   Background voices (Impulse Tracker new note actions) get extra MIDI channels from a shared pool.
 * - Each sample becomes one preset. Notes select the preset with program changes (and bank select above 127).
 * - Pitch is the closest key plus the pitch wheel. The pitch wheel range is set per channel to fit the highest offset.
 * - Volume and envelopes are sent as main volume and expression, panning as the pan controller.
 * - Sample offsets and the resonant filter are sent as controllers that drive modulators in the sound bank.
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
    /**
     * If {@link processTick} is also called for the first ticks of the rows repeated by a pattern delay.
     */
    protected processRepeatedFirstTicks = false;
    /**
     * If ping-pong loops play their last point twice (Impulse Tracker).
     */
    protected repeatPingPongEnd = false;
    /**
     * If the level of a channel follows the linear pan law of the tracker (quieter in the center),
     * instead of the constant power of the synthesizer.
     */
    protected linearPanLevel = false;

    // Playback state

    protected speed = 6;
    protected globalVolume = 64;
    /**
     * The tick of the current row, counted from zero again for each row repeated by a pattern delay.
     */
    protected tick = 0;
    /**
     * The tick of the current row, including the rows repeated by a pattern delay.
     */
    protected rowTick = 0;
    /**
     * Extra ticks added to every repetition of the current row (fine pattern delay).
     */
    protected frameDelay = 0;
    protected tempo = 125;
    /**
     * The pattern being played.
     */
    protected currentPattern = new TrackerPattern(64, 0);
    /**
     * The row being played.
     */
    protected currentRow = 0;
    /**
     * If a position jump wins over a pattern loop on the same row (Impulse Tracker), instead of the loop winning.
     */
    protected jumpOverridesLoop = false;
    /**
     * The sample variants used by the playback, they become the presets of the sound bank.
     */
    protected sampleBank = new TrackerSampleBank([]);
    /**
     * The pattern channels.
     */
    protected channels = new Array<TrackerChannel>();
    /**
     * The voices that keep playing in the background after a new note.
     */
    protected backgroundVoices = new Array<TrackerChannel>();
    /**
     * The format name, written into the RMIDI comment.
     */
    protected abstract readonly formatName: string;
    /**
     * The attenuation of every sample in centibels, set with {@link setPreAmp}.
     */
    private attenuation = 0;
    private outputs = new Array<TrackerMIDITrack>();
    /**
     * The voice that writes to each output, undefined if the output is free.
     */
    private outputOwners = new Array<TrackerChannel | undefined>();
    private positionJump = -1;
    private breakRow = -1;
    private patternLoopRow = -1;
    private patternDelay = 0;
    private rowDelaySet = false;
    private songEnded = false;
    /**
     * The MIDI tick of the tick being processed.
     */
    private currentTicks = 0;
    private lastNoteOnTick = -1;

    /**
     * The number of ticks in the current row, including pattern delays.
     */
    protected get rowTicks() {
        return (this.speed + this.frameDelay) * (this.patternDelay + 1);
    }

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
        this.sampleBank = new TrackerSampleBank(
            this.samples,
            this.repeatPingPongEnd
        );
        this.channels = [];
        this.backgroundVoices = [];
        this.outputs = [];
        this.outputOwners = [];
        for (let i = 0; i < this.channelCount; i++) {
            const channel = this.createChannel(
                i,
                this.channelPanning[i] ?? 128
            );
            this.channels.push(channel);
            this.createOutput();
            channel.output = this.outputs[i];
            this.outputOwners[i] = channel;
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
            // One MIDI quarter note is 24 ticks
            const microseconds = Math.round(
                this.getTickDuration() * TRACKER_TIME_DIVISION * 1_000_000
            );
            conductorEvent(ticks, MIDIMessageTypes.setTempo, [
                (microseconds >> 16) & 0xff,
                (microseconds >> 8) & 0xff,
                microseconds & 0xff
            ]);
        };
        writeTempo(0);
        let writtenTempo = this.getTickDuration();

        // Play the module
        const emptyPattern = new TrackerPattern(64, this.channelCount);
        // Rows are only repeated with different pattern loop counters
        const visitedRows = new Map<string, number>();
        const getRowKey = (order: number, row: number) => {
            let key = `${order}:${row}`;
            for (const channel of this.channels) {
                if (channel.patternLoopCount) {
                    key += `:${channel.index},${channel.patternLoopCount}`;
                }
            }
            return key;
        };
        let absoluteTick = 0;
        let order = 0;
        let row = 0;
        let lastOrder = -1;
        let loopStart = -1;
        // Set after a jump or a break, the target row may be beyond the end of the pattern
        let jumped = false;
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
                // A pattern break keeps its row
                if (!jumped) {
                    row = 0;
                }
                continue;
            }
            const patternIndex = this.orders[order];
            if (patternIndex < 0) {
                order++;
                // Skipping a marker keeps the break row too
                if (!jumped) {
                    row = 0;
                }
                continue;
            }
            const pattern = this.patterns[patternIndex] ?? emptyPattern;
            if (row >= pattern.rows) {
                if (jumped) {
                    // Breaking to a row that does not exist plays the target pattern from the start
                    row = 0;
                } else {
                    order++;
                    row = 0;
                    continue;
                }
            }
            jumped = false;

            // Detect the song looping back
            const rowKey = getRowKey(order, row);
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
            this.rowDelaySet = false;
            this.frameDelay = 0;
            this.currentRow = row;
            this.currentPattern = pattern;
            this.tick = 0;
            this.rowTick = 0;
            this.currentTicks = absoluteTick;
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
            if (this.songEnded) {
                break;
            }

            // Render every tick of the row
            const rowTicks = this.rowTicks;
            for (let t = 0; t < rowTicks; t++) {
                this.rowTick = t;
                this.tick = t % (this.speed + this.frameDelay);
                this.currentTicks = absoluteTick;
                if (t > 0) {
                    if (this.tick === 0 && this.processRepeatedFirstTicks) {
                        // The repeated first tick decides the next row again
                        this.positionJump = -1;
                        this.breakRow = -1;
                        this.patternLoopRow = -1;
                    }
                    for (const channel of this.channels) {
                        // The first tick of a row repeated by a pattern delay usually does nothing
                        if (this.tick > 0 || this.processRepeatedFirstTicks) {
                            this.processTick(channel);
                        }
                    }
                }
                for (const channel of this.channels) {
                    if (this.tick === channel.noteCutTick) {
                        channel.volume = 0;
                    }
                    this.updateChannel(channel);
                    this.writeChannel(channel, absoluteTick);
                }
                this.processBackgroundVoices(absoluteTick);
                // Tempo changes on the first tick or slides on the other ticks
                const tickDuration = this.getTickDuration();
                if (tickDuration !== writtenTempo) {
                    writtenTempo = tickDuration;
                    writeTempo(absoluteTick);
                }
                absoluteTick++;
            }

            // Advance to the next row
            const doJump = this.positionJump >= 0 || this.breakRow >= 0;
            if (
                this.patternLoopRow >= 0 &&
                !(doJump && this.jumpOverridesLoop && this.positionJump >= 0)
            ) {
                row = this.patternLoopRow;
            } else if (doJump) {
                order = this.positionJump >= 0 ? this.positionJump : order + 1;
                row = Math.max(0, this.breakRow);
                jumped = true;
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
            ...this.outputs.map((o, i) =>
                o.finish(
                    i < this.channelCount
                        ? `Channel ${i + 1}`
                        : `Voice ${i - this.channelCount + 1}`,
                    absoluteTick
                )
            )
        ];
        outputMIDI.embeddedSoundBank = this.sampleBank.write(
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
     * Gets the duration of a tick in seconds. A tick lasts 2.5 / tempo seconds by default.
     */
    protected getTickDuration() {
        return 2.5 / this.tempo;
    }

    /**
     * Creates a pattern channel. Formats with their own channel state override this.
     * @param index The channel index.
     * @param panning The initial panning (0-255).
     */
    protected createChannel(index: number, panning: number) {
        return new TrackerChannel(index, panning);
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
     * Also called for the background voices.
     * @param channel The channel to update.
     */
    protected updateChannel(channel: TrackerChannel) {
        void channel;
    }

    /**
     * Checks if a background voice has become silent for good and can be stopped.
     * @param voice The background voice.
     */
    protected isVoiceFinished(voice: TrackerChannel) {
        return (
            voice.output?.activeKey === -1 || voice.samplePosition === Infinity
        );
    }

    /**
     * Moves the note playing on a pattern channel into a background voice, so it keeps playing
     * while the channel starts a new note on another MIDI channel.
     * @param channel The pattern channel.
     * @returns The background voice, undefined if no note was playing.
     */
    protected moveToBackground(channel: TrackerChannel) {
        const output = channel.output;
        if (!output || output.activeKey === -1) {
            return undefined;
        }
        if (this.backgroundVoices.length >= MAX_VOICES - this.channelCount) {
            // Too many voices, stop the quietest one
            let quietest = this.backgroundVoices[0];
            for (const voice of this.backgroundVoices) {
                if (voice.outputLevel < quietest.outputLevel) {
                    quietest = voice;
                }
            }
            this.stopVoice(quietest);
        }
        const voice = channel.clone();
        voice.background = true;
        voice.rowEffect = 0;
        voice.rowParam = 0;
        voice.rowVolume = 0;
        voice.trigger = false;
        voice.stop = false;
        voice.arpeggio = 0;
        voice.vibratoDelta = 0;
        voice.volumeDelta = 0;
        voice.tremorMuted = false;
        this.backgroundVoices.push(voice);
        this.outputOwners[this.outputs.indexOf(output)] = voice;

        // Prefer the channel's own MIDI channel, then any free one
        let index =
            this.outputOwners[channel.index] === undefined ? channel.index : -1;
        if (index === -1) {
            index = this.outputOwners.indexOf(undefined, this.channelCount);
        }
        if (index === -1) {
            index = this.outputs.length;
            this.createOutput();
        }
        channel.output = this.outputs[index];
        this.outputOwners[index] = channel;
        return voice;
    }

    /**
     * Stops a background voice and frees its MIDI channel.
     * @param voice The background voice.
     */
    protected stopVoice(voice: TrackerChannel) {
        const index = this.backgroundVoices.indexOf(voice);
        if (index === -1) {
            return;
        }
        this.backgroundVoices.splice(index, 1);
        if (voice.output) {
            voice.output.noteOff(this.currentTicks);
            const outputIndex = this.outputs.indexOf(voice.output);
            if (this.outputOwners[outputIndex] === voice) {
                this.outputOwners[outputIndex] = undefined;
            }
        }
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
        channel.preset = index;
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
     * @param binaryCodedDecimal False if the parameter is the row number itself (Impulse Tracker).
     */
    protected patternBreak(param: number, binaryCodedDecimal = true) {
        if (!binaryCodedDecimal) {
            this.breakRow = param;
            return;
        }
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
     * Sets the pattern delay if no other channel has set it on this row, even to zero rows.
     * @param rows The number of extra repetitions of the row.
     */
    protected setRowDelay(rows: number) {
        if (!this.rowDelaySet) {
            this.rowDelaySet = true;
            this.patternDelay = rows;
        }
    }

    /**
     * Jumps back to a row of the current pattern after this row.
     * @param row The row to jump to.
     */
    protected setPatternLoopTarget(row: number) {
        this.patternLoopRow = row;
    }

    /**
     * Cancels a position jump set earlier on this row.
     */
    protected clearPositionJump() {
        this.positionJump = -1;
    }

    /**
     * Computes the playback rate of a channel's sample in Hertz, including all pitch effects.
     * @param channel The channel.
     * @returns The rate, zero or below if the channel has no pitch.
     */
    protected getFrequency(channel: TrackerChannel) {
        const period =
            channel.period + channel.vibratoDelta + channel.autoVibratoDelta;
        return period > 0 ? this.periodToFrequency(period) : 0;
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
     * Updates, writes and stops the background voices for the current tick.
     * @param ticks The current MIDI tick.
     */
    private processBackgroundVoices(ticks: number) {
        for (let i = 0; i < this.backgroundVoices.length; i++) {
            const voice = this.backgroundVoices[i];
            if (this.isVoiceFinished(voice)) {
                this.stopVoice(voice);
                i--;
                continue;
            }
            this.updateChannel(voice);
            this.writeChannel(voice, ticks);
        }
    }

    private createOutput() {
        const index = this.outputs.length;
        this.outputs.push(
            new TrackerMIDITrack(
                index % CHANNELS_PER_PORT,
                Math.floor(index / CHANNELS_PER_PORT)
            )
        );
        this.outputOwners.push(undefined);
    }

    /**
     * Writes the MIDI events of a channel for the current tick.
     * @param channel The channel.
     * @param ticks The current MIDI tick.
     */
    private writeChannel(channel: TrackerChannel, ticks: number) {
        const output = channel.output;
        if (!output) {
            return;
        }
        if (channel.stop) {
            channel.stop = false;
            output.noteOff(ticks);
        }
        const sample = channel.sample;
        if (channel.trigger) {
            channel.trigger = false;
            output.noteOff(ticks);
            channel.samplePosition = Infinity;
            if (!sample) {
                return;
            }
            const preset = channel.preset;
            let offset = channel.sampleOffset;
            if (offset >= this.sampleBank.getLength(preset)) {
                if (!this.sampleBank.isLooped(preset)) {
                    return;
                }
                offset = this.sampleBank.getLoopStart(preset);
            }
            output.selectPreset(ticks, preset);
            const units = Math.floor(offset / 256);
            output.controllerChange(ticks, OFFSET_FINE_CC, units & 0x7f);
            output.controllerChange(ticks, OFFSET_COARSE_CC, units >> 7);
            output.controllerChange(
                ticks,
                OFFSET_FINEST_CC,
                Math.floor((offset & 0xff) / 2),
                true
            );
            const semitones = this.getSemitones(channel, sample);
            if (semitones === undefined) {
                return;
            }
            const key = Math.min(127, Math.max(0, Math.round(semitones)));
            this.writeControllers(channel, output, ticks);
            output.setPitch(ticks, semitones - key);
            output.noteOn(ticks, key);
            this.lastNoteOnTick = ticks;
            channel.samplePosition = offset;
            this.advancePosition(channel, sample, semitones);
            return;
        }
        if (output.activeKey === -1 || !sample) {
            return;
        }
        const semitones = this.getSemitones(channel, sample);
        if (semitones !== undefined) {
            output.setPitch(ticks, semitones - output.activeKey);
            this.advancePosition(channel, sample, semitones);
        }
        this.writeControllers(channel, output, ticks);
    }

    /**
     * Advances the sample position of a channel by one tick.
     * @param channel The channel.
     * @param sample The playing sample.
     * @param semitones The current pitch, see {@link getSemitones}.
     */
    private advancePosition(
        channel: TrackerChannel,
        sample: TrackerSample,
        semitones: number
    ) {
        if (channel.samplePosition === Infinity) {
            return;
        }
        const rate =
            Math.round(sample.middleCRate) *
            Math.pow(2, (semitones - this.rootKey) / 12);
        channel.samplePosition = this.sampleBank.advance(
            channel.preset,
            channel.samplePosition,
            rate * this.getTickDuration()
        );
    }

    /**
     * Computes the MIDI pitch of the channel relative to the sound bank sample.
     * @param channel The channel.
     * @param sample The playing sample.
     * @returns The pitch in semitones, undefined if the channel has no pitch.
     */
    private getSemitones(channel: TrackerChannel, sample: TrackerSample) {
        const frequency = this.getFrequency(channel);
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
        let expression =
            (this.globalVolume / 64) *
            channel.volumeScale *
            channel.envelopeVolume *
            channel.fadeoutVolume;
        let panning = channel.outputPanning;
        if (panning < 0) {
            panning = channel.panning;
            if (channel.envelopePanning !== 32) {
                panning +=
                    ((channel.envelopePanning - 32) *
                        (128 - Math.abs(panning - 128))) /
                    32;
            }
        }
        // The synthesizer pans with the sine law, keep the same gain ratio between left and right
        const clamped = Math.min(256, Math.max(0, panning));
        if (this.linearPanLevel) {
            // A centered channel is 3 dB quieter than a hard panned one
            expression *= Math.hypot(256 - clamped, clamped) / 256;
        }
        channel.outputLevel = volume * expression;
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

        // Resonant filter, zero leaves it open
        const cutoff =
            channel.filterCutoff >= FILTER_OPEN_CENTS
                ? 0
                : Math.min(
                      16_383,
                      Math.max(
                          1,
                          Math.round(
                              ((FILTER_OPEN_CENTS - channel.filterCutoff) /
                                  FILTER_CUTOFF_RANGE) *
                                  16_384
                          )
                      )
                  );
        const resonance = Math.min(
            16_383,
            Math.max(
                0,
                Math.round(
                    (channel.filterResonance / FILTER_RESONANCE_RANGE) * 16_384
                )
            )
        );
        output.controllerChange14(ticks, FILTER_CUTOFF_CC, cutoff, true);
        output.controllerChange14(ticks, FILTER_RESONANCE_CC, resonance, true);
    }
}

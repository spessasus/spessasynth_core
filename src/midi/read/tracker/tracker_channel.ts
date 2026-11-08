/**
 * @license
 * The random waveform table in this file is taken from the sound library of OpenMPT (https://openmpt.org/).
 * OpenMPT is distributed under the BSD license below.
 *
 * Copyright (c) 2004-2026, OpenMPT Project Developers and Contributors
 * Copyright (c) 1997-2003, Olivier Lapicque
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of the OpenMPT project nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import type { TrackerInstrument, TrackerSample } from "./types";
import type { TrackerMIDITrack } from "./tracker_midi_track";

/**
 * The 64-step sine table shared by the vibrato and tremolo effects.
 */
const SINE_TABLE = new Int8Array(64);
/**
 * The random waveform table,
 * Fixed so conversions are deterministic, and we can test them.
 * This is the random table of OpenMPT (ModRandomTable).
 */
const RANDOM_TABLE = new Int8Array([
    98, -127, -43, 88, 102, 41, -65, -94, 125, 20, -71, -86, -70, -32, -16, -96,
    17, 72, 107, -5, 116, -69, -62, -40, 10, -61, 65, 109, -18, -38, -13, -76,
    -23, 88, 21, -94, 8, 106, 21, -112, 6, 109, 20, -88, -30, 9, -127, 118, 42,
    -34, 89, -4, -51, -72, 21, -29, 112, 123, 84, -101, -92, 98, -54, -95
]);
for (let i = 0; i < 64; i++) {
    SINE_TABLE[i] = Math.round(127 * Math.sin((i * Math.PI) / 32));
}

/**
 * The playback state of a single tracker channel.
 * Contains the effect primitives that are shared between the module formats.
 */
export class TrackerChannel {
    /**
     * The index of this channel in the module.
     */
    public readonly index: number;

    // The current row data

    public rowNote = 0;
    public rowInstrument = 0;
    public rowVolume = 0;
    public rowEffect = 0;
    public rowParam = 0;

    // The playing instrument and sample

    public instrument?: TrackerInstrument;
    public sample?: TrackerSample;
    /**
     * The index of the playing sample in the module, -1 if none.
     */
    public sampleIndex = -1;
    /**
     * The sound bank preset that plays the sample, usually the sample index.
     * Other values select a variant of the sample, see {@link TrackerSampleBank}.
     */
    public preset = -1;
    /**
     * The playback position in the preset's sample, Infinity once a sample without a loop has ended.
     */
    public samplePosition = 0;
    /**
     * The fine-tuning used for the next notes, initialized from the sample.
     * Its unit is specific to the module format, see {@link TrackerSample.finetune}.
     */
    public finetune = 0;

    // Pitch

    public period = 0;
    /**
     * The tone portamento target period.
     */
    public targetPeriod = 0;
    public tonePortamentoSpeed = 0;
    /**
     * The period offset caused by the vibrato effect.
     */
    public vibratoDelta = 0;
    /**
     * The period offset caused by the instrument automatic vibrato.
     */
    public autoVibratoDelta = 0;
    /**
     * The arpeggio offset, in semitones.
     */
    public arpeggio = 0;

    // Volume and panning

    /**
     * The channel volume (0-64).
     */
    public volume = 64;
    /**
     * The volume offset caused by tremolo.
     */
    public volumeDelta = 0;
    /**
     * An additional volume multiplier (0-1) for the format-specific volumes,
     * such as the channel, sample and instrument global volumes.
     */
    public volumeScale = 1;
    /**
     * Set to true while tremor silences the channel.
     */
    public tremorMuted = false;
    public tremorCounter = 0;
    /**
     * The channel panning (0-255).
     */
    public panning = 128;
    /**
     * The final panning (0-256) computed by the format, -1 to compute it from the panning and its envelope.
     */
    public outputPanning = -1;
    /**
     * The resonant filter cutoff in absolute cents, 13,500 or above leaves the filter open.
     */
    public filterCutoff = 13_500;
    /**
     * The resonant filter resonance in centibels.
     */
    public filterResonance = 0;

    // Instrument envelopes

    public keyOn = false;
    public volumeEnvelopeTick = 0;
    public panningEnvelopeTick = 0;
    /**
     * The volume envelope multiplier (0-1).
     */
    public envelopeVolume = 1;
    /**
     * The panning envelope value (0-64, 32 is the center).
     */
    public envelopePanning = 32;
    /**
     * The fadeout multiplier (0-1).
     */
    public fadeoutVolume = 1;
    public autoVibratoPosition = 0;
    public autoVibratoTicks = 0;

    // Waveform effects

    public vibratoSpeed = 0;
    public vibratoDepth = 0;
    public vibratoPosition = 0;
    public vibratoWaveform = 0;
    public tremoloSpeed = 0;
    public tremoloDepth = 0;
    public tremoloPosition = 0;
    public tremoloWaveform = 0;

    // Effect memory

    public portamentoUpMemory = 0;
    public portamentoDownMemory = 0;
    public finePortamentoUpMemory = 0;
    public finePortamentoDownMemory = 0;
    public extraFinePortamentoUpMemory = 0;
    public extraFinePortamentoDownMemory = 0;
    public volumeSlideMemory = 0;
    public fineVolumeUpMemory = 0;
    public fineVolumeDownMemory = 0;
    public panningSlideMemory = 0;
    public globalVolumeSlideMemory = 0;
    public offsetMemory = 0;
    public retriggerMemory = 0;
    public tremorMemory = 0;

    // Note control

    /**
     * Set when a note should be (re)triggered on the current tick.
     */
    public trigger = false;
    /**
     * Set when the playing note should be stopped on the current tick.
     */
    public stop = false;
    /**
     * The sample offset for the next trigger, in sample points.
     */
    public sampleOffset = 0;
    public retriggerCounter = 0;
    /**
     * The tick on which the delayed row note is triggered, -1 if there is no delay.
     */
    public noteDelayTick = -1;
    /**
     * The tick on which the note is cut, -1 if there is no cut.
     */
    public noteCutTick = -1;
    public patternLoopRow = 0;
    public patternLoopCount = 0;

    // Output

    /**
     * The MIDI track (one MIDI channel) this channel writes to.
     */
    public output?: TrackerMIDITrack;
    /**
     * True for the background voices that keep playing after a new note (Impulse Tracker new note actions).
     */
    public background = false;
    /**
     * The volume of the last written tick (0-1), used to pick the voice to stop when there are too many.
     */
    public outputLevel = 0;

    public constructor(index: number, panning: number) {
        this.index = index;
        this.panning = panning;
    }

    /**
     * Gets the value of a vibrato/tremolo waveform.
     * @param waveform The waveform type (0 sine, 1 ramp down, 2 square, 3 random).
     * @param position The position in the waveform (0-63).
     * @returns The value in range of -127 to 127.
     */
    public static getWaveform(waveform: number, position: number) {
        position &= 0x3f;
        switch (waveform & 3) {
            default: {
                return SINE_TABLE[position];
            }

            case 1: {
                return (position < 32 ? 0 : 255) - position * 4;
            }

            case 2: {
                return position < 32 ? 127 : -127;
            }

            case 3: {
                return RANDOM_TABLE[position];
            }
        }
    }

    /**
     * Creates a copy of this channel, keeping its class.
     */
    public clone() {
        return Object.assign(
            Object.create(Object.getPrototypeOf(this) as object) as this,
            this
        );
    }

    /**
     * Slides the channel volume, clamping it to 0-64.
     * @param amount The amount to add.
     */
    public slideVolume(amount: number) {
        this.volume = Math.min(64, Math.max(0, this.volume + amount));
    }

    /**
     * Slides the channel panning, clamping it to 0-255.
     * @param amount The amount to add.
     */
    public slidePanning(amount: number) {
        this.panning = Math.min(255, Math.max(0, this.panning + amount));
    }

    /**
     * Slides the period towards the tone portamento target.
     */
    public tonePortamento() {
        if (this.targetPeriod === 0 || this.period === 0) {
            return;
        }
        this.period =
            this.period < this.targetPeriod
                ? Math.min(
                      this.targetPeriod,
                      this.period + this.tonePortamentoSpeed
                  )
                : Math.max(
                      this.targetPeriod,
                      this.period - this.tonePortamentoSpeed
                  );
    }

    /**
     * Sets the vibrato speed and depth, keeping the previous values for zero nibbles.
     * @param param The effect parameter (speed in the high nibble, depth in the low nibble).
     * @param depthScale The multiplier of the depth nibble.
     */
    public setVibrato(param: number, depthScale = 1) {
        if (param >> 4) {
            this.vibratoSpeed = param >> 4;
        }
        if (param & 0x0f) {
            this.vibratoDepth = (param & 0x0f) * depthScale;
        }
    }

    /**
     * Computes the vibrato offset for the current position.
     * @param divisor The depth divisor, 16 for regular and 64 for fine vibrato.
     * @param advance If the position should advance.
     */
    public vibrato(divisor: number, advance: boolean) {
        this.vibratoDelta =
            (TrackerChannel.getWaveform(
                this.vibratoWaveform,
                this.vibratoPosition
            ) *
                this.vibratoDepth) /
            divisor;
        if (advance) {
            this.vibratoPosition += this.vibratoSpeed;
        }
    }

    /**
     * Sets the arpeggio offset for a step of the arpeggio cycle.
     * @param param The effect parameter (first offset in the high nibble, second offset in the low nibble).
     * @param step The step of the cycle (0 is the base note).
     */
    public setArpeggio(param: number, step: number) {
        this.arpeggio = step === 0 ? 0 : step === 1 ? param >> 4 : param & 0x0f;
    }

    /**
     * Processes a sample offset effect, which only applies to a note triggered on the same row.
     * @param param The effect parameter (offset in units of 256 sample points), zero uses the previous offset.
     */
    public setSampleOffset(param: number) {
        if (param) {
            this.offsetMemory = param * 256;
        }
        if (this.trigger) {
            this.sampleOffset = this.offsetMemory;
        }
    }

    /**
     * Sets the tremolo speed and depth, keeping the previous values for zero nibbles.
     * @param param The effect parameter (speed in the high nibble, depth in the low nibble).
     */
    public setTremolo(param: number) {
        if (param >> 4) {
            this.tremoloSpeed = param >> 4;
        }
        if (param & 0x0f) {
            this.tremoloDepth = param & 0x0f;
        }
    }

    /**
     * Computes the tremolo volume offset and advances the position.
     * @param divisor The depth divisor.
     */
    public tremolo(divisor: number) {
        this.volumeDelta =
            (TrackerChannel.getWaveform(
                this.tremoloWaveform,
                this.tremoloPosition
            ) *
                this.tremoloDepth) /
            divisor;
        this.tremoloPosition += this.tremoloSpeed;
    }

    /**
     * Processes the tremor effect, muting the channel periodically.
     * @param param The on time (high nibble) and the off time (low nibble), in ticks minus one.
     */
    public tremor(param: number) {
        const onTicks = (param >> 4) + 1;
        const offTicks = (param & 0x0f) + 1;
        this.tremorMuted = this.tremorCounter >= onTicks;
        this.tremorCounter = (this.tremorCounter + 1) % (onTicks + offTicks);
    }

    /**
     * Processes a multi retrigger effect (Fast Tracker Rxy, Scream Tracker Qxy).
     * @param param The volume change (high nibble) and the interval (low nibble).
     */
    public multiRetrigger(param: number) {
        const interval = param & 0x0f;
        if (interval === 0 || ++this.retriggerCounter < interval) {
            return;
        }
        this.retriggerCounter = 0;
        this.trigger = true;
        this.sampleOffset = 0;
        switch (param >> 4) {
            default: {
                break;
            }

            case 1:
            case 2:
            case 3:
            case 4:
            case 5: {
                this.slideVolume(-(1 << ((param >> 4) - 1)));
                break;
            }

            case 6: {
                this.volume = Math.floor((this.volume * 2) / 3);
                break;
            }

            case 7: {
                this.volume >>= 1;
                break;
            }

            case 9:
            case 0xa:
            case 0xb:
            case 0xc:
            case 0xd: {
                this.slideVolume(1 << ((param >> 4) - 9));
                break;
            }

            case 0xe: {
                this.slideVolume(Math.floor(this.volume / 2));
                break;
            }

            case 0xf: {
                this.slideVolume(this.volume);
                break;
            }
        }
    }

    /**
     * Resets the waveform positions on a new note, unless the waveform has the "no retrigger" flag.
     */
    public resetWaveforms() {
        if (this.vibratoWaveform < 4) {
            this.vibratoPosition = 0;
        }
        if (this.tremoloWaveform < 4) {
            this.tremoloPosition = 0;
        }
        this.retriggerCounter = 0;
        this.tremorCounter = 0;
    }
}

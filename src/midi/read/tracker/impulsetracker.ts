/**
 * @license
 * Parts of this file are ported from the sound library of OpenMPT (https://openmpt.org/).
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

import type { IndexedByteArray } from "../../../utils/indexed_array";
import { readBinaryString } from "../../../utils/byte_functions/string";
import { readLittleEndian } from "../../../utils/byte_functions/little_endian";
import {
    emptyEnvelope,
    getEnvelopeValue,
    TrackerModule
} from "./tracker_module";
import type { TrackerChannel } from "./tracker_channel";
import type { ImpulseTrackerEnvelopeState } from "./impulse_tracker_channel";
import { ImpulseTrackerChannel } from "./impulse_tracker_channel";
import { readImpulseTrackerSample } from "./impulse_tracker_samples";
import {
    NOTE_CUT,
    NOTE_MAX,
    NOTE_NONE,
    NOTE_OFF,
    TrackerPattern
} from "./tracker_pattern";
import {
    type ImpulseTrackerInstrument,
    type ImpulseTrackerSample,
    type TrackerEnvelope,
    type TrackerEnvelopePoint,
    TrackerLoopTypes,
    type TrackerSampleVariant,
    TrackerSampleVariants
} from "./types";

/**
 * The Impulse Tracker effects (letters converted to numbers, A = 1).
 */
const ImpulseTrackerEffects = {
    speed: 1, // A
    positionJump: 2, // B
    patternBreak: 3, // C
    volumeSlide: 4, // D
    portamentoDown: 5, // E
    portamentoUp: 6, // F
    tonePortamento: 7, // G
    vibrato: 8, // H
    tremor: 9, // I
    arpeggio: 10, // J
    vibratoVolumeSlide: 11, // K
    tonePortamentoVolumeSlide: 12, // L
    channelVolume: 13, // M
    channelVolumeSlide: 14, // N
    sampleOffset: 15, // O
    panningSlide: 16, // P
    retrigger: 17, // Q
    tremolo: 18, // R
    extended: 19, // S
    tempo: 20, // T
    fineVibrato: 21, // U
    globalVolume: 22, // V
    globalVolumeSlide: 23, // W
    panning: 24, // X
    panbrello: 25, // Y
    midiMacro: 26, // Z
    extendedParameter: 27, // # (OpenMPT)
    smoothMidiMacro: 28, // \ (OpenMPT)
    delayCut: 29 // : (OpenMPT)
} as const;

/**
 * The Impulse Tracker extended (Sxy) effects.
 */
const ImpulseTrackerExtendedEffects = {
    glissando: 0x1,
    finetune: 0x2,
    vibratoWaveform: 0x3,
    tremoloWaveform: 0x4,
    panbrelloWaveform: 0x5,
    fineRowDelay: 0x6,
    instrumentControl: 0x7,
    panning: 0x8,
    soundControl: 0x9,
    highOffset: 0xa,
    patternLoop: 0xb,
    noteCut: 0xc,
    noteDelay: 0xd,
    rowDelay: 0xe,
    activeMacro: 0xf
} as const;

/**
 * The volume column commands, decoded from the volume byte.
 */
const VolumeCommands = {
    none: 0,
    volume: 1,
    panning: 2,
    fineVolumeUp: 3,
    fineVolumeDown: 4,
    volumeSlideUp: 5,
    volumeSlideDown: 6,
    portamentoDown: 7,
    portamentoUp: 8,
    tonePortamento: 9,
    vibratoDepth: 10
} as const;

type VolumeCommand = (typeof VolumeCommands)[keyof typeof VolumeCommands];

/**
 * The new note actions and the duplicate check actions.
 */
const NoteActions = {
    cut: 0,
    continue: 1,
    noteOff: 2,
    noteFade: 3
} as const;

/**
 * The maximum number of channels in an Impulse Tracker module.
 */
const MAX_CHANNELS = 64;

/**
 * The maximum number of envelope points.
 */
const MAX_ENVELOPE_POINTS = 25;

/**
 * Note fade (~~~ in Impulse Tracker), starts the instrument fadeout.
 */
const NOTE_FADE = 252;

/**
 * The one-based C-5 note, which plays the samples at their middle C rate.
 */
const MIDDLE_C_NOTE = 61;

/**
 * The tone portamento speeds of the volume column (gx).
 */
const VOLUME_COLUMN_PORTAMENTO = [
    0x00, 0x01, 0x04, 0x08, 0x10, 0x20, 0x40, 0x60, 0x80, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff
];

/**
 * The middle C rates of the S2x finetune values.
 */
const FINETUNE_RATES = [
    7895, 7941, 7985, 8046, 8107, 8169, 8232, 8280, 8363, 8413, 8463, 8529,
    8581, 8651, 8723, 8757
];

/**
 * The volume multipliers (in 1/16) and offsets of the retrigger effect.
 */
const RETRIGGER_MULTIPLIERS = [
    0, 0, 0, 0, 0, 0, 10, 8, 0, 0, 0, 0, 0, 0, 24, 32
];
const RETRIGGER_OFFSETS = [
    0, -1, -2, -4, -8, -16, 0, 0, 0, 1, 2, 4, 8, 16, 0, 0
];

/**
 * The Amiga period of a 8363 Hz middle C, used by the Amiga frequency slides.
 */
const AMIGA_CONSTANT = 1712 * 8363;

/**
 * The OpenMPT mixing levels.
 */
const MixLevels = {
    original: 0,
    v117RC1: 1,
    v117RC2: 2,
    v117RC3: 3,
    compatible: 4
} as const;

/**
 * The channel count dependent attenuation of the old OpenMPT mixing levels, for every two channels.
 */
const PRE_AMP_TABLE = [
    0x60, 0x60, 0x60, 0x70, 0x80, 0x88, 0x90, 0x98, 0xa0, 0xa4, 0xa8, 0xac,
    0xb0, 0xb4, 0xb8, 0xbc
];

/**
 * The size of one MIDI macro string.
 */
const MACRO_LENGTH = 32;

/**
 * The Impulse Tracker sine table (256 steps, -64 to 64).
 */
const SINE_TABLE = new Int8Array(256);
for (let i = 0; i < 256; i++) {
    SINE_TABLE[i] = Math.round(64 * Math.sin((i * Math.PI) / 128));
}

/**
 * The sample of an empty instrument keyboard slot that points to a sample that does not exist.
 */
const EMPTY_SAMPLE: ImpulseTrackerSample = {
    name: "",
    data: new Float32Array(0),
    loopType: TrackerLoopTypes.none,
    loopStart: 0,
    loopEnd: 0,
    volume: 0,
    globalVolume: 0,
    panning: -1,
    finetune: 8363,
    relativeNote: 0,
    middleCRate: 8363,
    vibratoType: 0,
    vibratoSweep: 0,
    vibratoDepth: 0,
    vibratoRate: 0
};

/**
 * Background voices below this level (-60 dB) are stopped once they can only get quieter.
 */
const INAUDIBLE_LEVEL = 0.001;

/**
 * The sample rate the resonant filter is matched at. The OpenMPT reference renders use it.
 */
const FILTER_SAMPLE_RATE = 44_100;

const isNote = (note: number) => note > NOTE_NONE && note <= NOTE_MAX;

/**
 * Decodes the volume column byte.
 * @param value The stored value, zero if the column is empty and the byte plus one otherwise.
 */
function decodeVolume(value: number): [VolumeCommand, number] {
    const v = value - 1;
    if (v < 0) {
        return [VolumeCommands.none, 0];
    }
    if (v <= 64) {
        return [VolumeCommands.volume, v];
    }
    if (v <= 74) {
        return [VolumeCommands.fineVolumeUp, v - 65];
    }
    if (v <= 84) {
        return [VolumeCommands.fineVolumeDown, v - 75];
    }
    if (v <= 94) {
        return [VolumeCommands.volumeSlideUp, v - 85];
    }
    if (v <= 104) {
        return [VolumeCommands.volumeSlideDown, v - 95];
    }
    if (v <= 114) {
        return [VolumeCommands.portamentoDown, v - 105];
    }
    if (v <= 124) {
        return [VolumeCommands.portamentoUp, v - 115];
    }
    if (v >= 128 && v <= 192) {
        return [VolumeCommands.panning, v - 128];
    }
    if (v >= 193 && v <= 202) {
        return [VolumeCommands.tonePortamento, v - 193];
    }
    if (v >= 203 && v <= 212) {
        return [VolumeCommands.vibratoDepth, v - 203];
    }
    return [VolumeCommands.none, 0];
}

/**
 * Creates an envelope, clamping the loop points to the existing points.
 * @param points The envelope points.
 * @param flags The flags (bit 0 enabled, bit 1 loop, bit 2 sustain loop, bit 3 carry).
 * @param loopStart The loop start point.
 * @param loopEnd The loop end point.
 * @param sustainStart The sustain loop start point.
 * @param sustainEnd The sustain loop end point.
 */
function createEnvelope(
    points: TrackerEnvelopePoint[],
    flags: number,
    loopStart: number,
    loopEnd: number,
    sustainStart: number,
    sustainEnd: number
) {
    const last = points.length - 1;
    const hasLoop = (flags & 2) !== 0 && last >= 0;
    const hasSustain = (flags & 4) !== 0 && last >= 0;
    loopStart = Math.min(loopStart, last);
    sustainStart = Math.min(sustainStart, last);
    const envelope: TrackerEnvelope = {
        enabled: (flags & 1) !== 0 && last >= 0,
        points,
        sustainPoint: hasSustain
            ? Math.min(last, Math.max(sustainEnd, sustainStart))
            : -1,
        sustainStart: hasSustain ? sustainStart : -1,
        loopStart: hasLoop ? loopStart : -1,
        loopEnd: hasLoop ? Math.min(last, Math.max(loopEnd, loopStart)) : -1,
        carry: (flags & 8) !== 0
    };
    return envelope;
}

/**
 * Reads an envelope of a new format (Impulse Tracker 2.00 and above) instrument.
 * @param binary The file data.
 * @param offset The envelope offset.
 * @param signed True for the panning and pitch envelopes (stored from -32 to 32).
 */
function readEnvelope(
    binary: IndexedByteArray,
    offset: number,
    signed: boolean
) {
    const flags = binary[offset];
    const count = Math.min(MAX_ENVELOPE_POINTS, binary[offset + 1]);
    const points = new Array<TrackerEnvelopePoint>();
    for (let p = 0; p < count; p++) {
        const value = binary[offset + 6 + p * 3];
        let tick = readLittleEndian(binary, 2, offset + 7 + p * 3);
        const previous = points[p - 1];
        if (previous && tick < previous.tick && !(tick & 0xff_00)) {
            // Some old ModPlug versions lost the high byte of the positions
            tick |= previous.tick & 0xff_00;
            if (tick < previous.tick) {
                tick += 0x1_00;
            }
        }
        points.push({
            value: Math.min(
                64,
                Math.max(0, signed ? ((value << 24) >> 24) + 32 : value)
            ),
            tick
        });
    }
    return createEnvelope(
        points,
        flags,
        binary[offset + 2],
        binary[offset + 3],
        binary[offset + 4],
        binary[offset + 5]
    );
}

/**
 * Matches the Impulse Tracker resonant filter to the synthesizer's filter.
 * Both are two-pole filters, so the synthesizer's cutoff and resonance are chosen to give the same poles.
 * @param cutoff The cutoff (0-127), already scaled by the filter envelope.
 * @param resonance The resonance (0-127).
 * @param extendedRange If the OpenMPT extended filter range is used.
 * @returns The cutoff in absolute cents and the resonance in centibels.
 */
function matchFilter(
    cutoff: number,
    resonance: number,
    extendedRange: boolean
) {
    const fs = FILTER_SAMPLE_RATE;
    const frequency = Math.min(
        fs / 2,
        Math.max(
            120,
            Math.min(
                20_000,
                110 * Math.pow(2, 0.25 + cutoff / (extendedRange ? 20 : 24))
            )
        )
    );
    // Damping factor
    const damping = Math.pow(10, (-resonance * (24 / 128)) / 20);
    let d: number;
    let e: number;
    if (extendedRange) {
        const r = (2 * Math.PI * frequency) / fs;
        d = Math.min(2, (1 - 2 * damping) * r);
        d = (2 * damping - d) / r;
        e = 1 / (r * r);
    } else {
        const r = fs / (2 * Math.PI * frequency);
        d = damping * r + damping - 1;
        e = r * r;
    }
    // Denominator of the filter, normalized
    const a1 = -(d + 2 * e) / (1 + d + e);
    const a2 = e / (1 + d + e);
    // The same poles for a biquad lowpass
    const alpha = (1 - a2) / (1 + a2);
    const w = Math.acos(Math.min(1, Math.max(-1, (-a1 * (1 + alpha)) / 2)));
    const q = Math.sin(w) / (2 * alpha);
    const hz = (w * fs) / (2 * Math.PI);
    return {
        cents: 1200 * Math.log2(Math.max(1, hz) / 8.176),
        // The synthesizer's resonance of zero is a Q of 0.707
        centibels: Math.max(0, 30.1 + 200 * Math.log10(q))
    };
}

/**
 * Impulse Tracker module (IT) loader and player.
 *
 * The playback follows the Impulse Tracker compatible behavior of OpenMPT:
 * - Instrument and sample modes, new note actions (background voices on their own MIDI channels)
 *   and duplicate checks, the volume, panning and pitch/filter envelopes with loops, sustain loops and carry,
 *   fadeout, random volume and panning variation and pitch-pan separation.
 * - The resonant filter (instrument cutoff and resonance, filter envelope, Zxx and \xx MIDI macros).
 * - Sample sustain loops (switching to the regular loop on key off), stereo samples
 *   and reversed playback (S9F), all through extra presets in the sound bank.
 * - Every effect, including the OpenMPT extensions to the IT format that change the playback.
 */
export class ImpulseTrackerModule extends TrackerModule {
    protected readonly formatName = "Impulse Tracker IT";
    protected processRepeatedFirstTicks = true;
    protected jumpOverridesLoop = true;
    protected repeatPingPongEnd = true;
    protected linearPanLevel = true;
    private linearSlides = false;
    private oldEffects = false;
    /**
     * If Gxx does not share the memory of Exx and Fxx ("Compatible Gxx").
     */
    private compatibleGxx = false;
    private instrumentMode = false;
    private stereo = true;
    private extendedFilterRange = false;
    /**
     * If the retrigger effect also restarts samples that have stopped (ChibiTracker).
     */
    private retriggerStoppedSamples = false;
    /**
     * The OpenMPT tempo mode (0 classic, 1 alternative, 2 modern).
     */
    private tempoMode = 0;
    /**
     * The rows per beat, used by the modern tempo mode.
     */
    private rowsPerBeat = 4;
    /**
     * Set with S9D, the filter is only used when an instrument enables it.
     */
    private openMPTFilterMode = false;
    private itInstruments = new Array<ImpulseTrackerInstrument | undefined>();
    private itSamples = new Array<ImpulseTrackerSample>();
    /**
     * The initial channel volume of each channel (0-64).
     */
    private channelVolumes = new Array<number>();
    /**
     * The channels with surround panning at the start.
     */
    private channelSurround = new Array<boolean>();
    /**
     * The parametered (SFx) MIDI macros.
     */
    private parameteredMacros = new Array<string>(16).fill("");
    /**
     * The fixed (Z80-ZFF) MIDI macros.
     */
    private fixedMacros = new Array<string>(128).fill("");
    /**
     * The state of the random number generator, fixed so conversions are deterministic.
     */
    private randomState = 0x12_34_56_78;
    /**
     * The background voice that was created last, used by the envelope carry with Compatible Gxx.
     */
    private lastMovedVoice?: ImpulseTrackerChannel;

    /**
     * Checks if the file is an IT module.
     * @param binary The file data.
     */
    public static isIT(binary: IndexedByteArray) {
        return (
            binary.length > 0xc0 && readBinaryString(binary, 4, 0) === "IMPM"
        );
    }

    /**
     * Parses an IT file.
     * @param binary The file data.
     */
    public parse(binary: IndexedByteArray) {
        this.title = readBinaryString(binary, 26, 4).trim();
        // Impulse Tracker has no restart position, songs restart from the beginning
        this.restartPosition = 0;
        const orderCount = readLittleEndian(binary, 2, 0x20);
        const instrumentCount = readLittleEndian(binary, 2, 0x22);
        const sampleCount = readLittleEndian(binary, 2, 0x24);
        const patternCount = readLittleEndian(binary, 2, 0x26);
        const trackerVersion = readLittleEndian(binary, 2, 0x28);
        const compatibleVersion = readLittleEndian(binary, 2, 0x2a);
        const flags = readLittleEndian(binary, 2, 0x2c);
        const special = readLittleEndian(binary, 2, 0x2e);
        const reserved = readLittleEndian(binary, 4, 0x3c);
        this.stereo = (flags & 1) !== 0;
        this.instrumentMode = (flags & 4) !== 0;
        this.linearSlides = (flags & 8) !== 0;
        this.oldEffects = (flags & 0x10) !== 0;
        this.compatibleGxx = (flags & 0x20) !== 0;
        this.extendedFilterRange = (flags & 0x10_00) !== 0;
        // Impulse Tracker global volume is 0-128
        this.initialGlobalVolume = Math.min(128, binary[0x30]) / 2;
        const mixVolume = Math.min(128, binary[0x31]);
        this.initialSpeed = binary[0x32] || 6;
        this.initialTempo = binary[0x33] >= 32 ? binary[0x33] : 125;
        this.madeWith = this.detectTracker(
            binary,
            trackerVersion,
            compatibleVersion,
            reserved
        );
        // ModPlug Tracker did not set the "sample data present" flag in some cases
        const savedByModPlug =
            trackerVersion === 0x2_17 &&
            compatibleVersion === 0x2_00 &&
            reserved === 0;
        const muteMissingData =
            !savedByModPlug &&
            trackerVersion >= 0x1_00 &&
            trackerVersion <= 0x2_17 &&
            (trackerVersion < 0x2_07 || reserved !== 0);

        for (let i = 0; i < orderCount; i++) {
            const order = binary[0xc0 + i];
            if (order === 255) {
                break;
            }
            // 254 is a marker pattern ("+++"), OpenMPT skips missing patterns the same way
            this.orders.push(
                order === 254 || order >= patternCount ? -1 : order
            );
        }
        const instrumentOffsets = 0xc0 + orderCount;
        const sampleOffsets = instrumentOffsets + instrumentCount * 4;
        const patternOffsets = sampleOffsets + sampleCount * 4;
        this.readMacros(
            binary,
            patternOffsets + patternCount * 4,
            flags,
            special
        );

        // Samples
        const sampleNames = new Array<string>();
        // The OpenMPT extensions follow the last sample
        let extensionsOffset = 0;
        for (let i = 0; i < sampleCount; i++) {
            const offset = readLittleEndian(binary, 4, sampleOffsets + i * 4);
            let sample: ImpulseTrackerSample = {
                ...EMPTY_SAMPLE,
                data: new Float32Array(0)
            };
            if (offset > 0 && offset < binary.length) {
                const read = readImpulseTrackerSample(
                    binary,
                    offset,
                    trackerVersion,
                    muteMissingData
                );
                sample = read.sample;
                extensionsOffset = Math.max(extensionsOffset, read.end);
            }
            this.itSamples.push(sample);
            this.samples.push(sample);
            sampleNames.push(sample.name);
        }

        // Instruments
        const instrumentNames = new Array<string>();
        if (this.instrumentMode) {
            for (let i = 0; i < instrumentCount; i++) {
                const offset = readLittleEndian(
                    binary,
                    4,
                    instrumentOffsets + i * 4
                );
                const instrument =
                    offset > 0 && offset + 0x2_30 <= binary.length
                        ? this.readInstrument(binary, offset, compatibleVersion)
                        : undefined;
                this.itInstruments.push(instrument);
                instrumentNames.push(instrument?.name ?? "");
            }
        }

        // Patterns, all 64 channels are read and then only the used ones are kept
        const fullPatterns = new Array<TrackerPattern>();
        const usedChannels = new Array<boolean>(MAX_CHANNELS).fill(false);
        for (let p = 0; p < patternCount; p++) {
            const offset = readLittleEndian(binary, 4, patternOffsets + p * 4);
            const rows =
                offset > 0 && offset + 8 <= binary.length
                    ? readLittleEndian(binary, 2, offset + 2)
                    : 0;
            if (rows < 1 || rows > 1024) {
                // Empty 64-row pattern
                fullPatterns.push(new TrackerPattern(64, MAX_CHANNELS));
                continue;
            }
            const pattern = new TrackerPattern(rows, MAX_CHANNELS);
            fullPatterns.push(pattern);
            extensionsOffset = Math.max(
                extensionsOffset,
                offset + 8 + readLittleEndian(binary, 2, offset)
            );
            this.readPattern(
                binary,
                offset,
                pattern,
                usedChannels,
                trackerVersion
            );
        }

        // Map the used channels
        const channelMap = new Array<number>();
        const mutedChannels = new Array<boolean>();
        for (let c = 0; c < MAX_CHANNELS; c++) {
            if (!usedChannels[c]) {
                continue;
            }
            const panning = binary[0x40 + c];
            channelMap.push(c);
            // Muted channels still process their global effects
            mutedChannels.push(panning >= 128);
            // 0-64, 100 is surround sound
            const surround = (panning & 0x7f) === 100;
            this.channelSurround.push(surround);
            this.channelPanning.push(
                surround ? 128 : Math.min(256, (panning & 0x7f) * 4)
            );
            this.channelVolumes.push(Math.min(64, binary[0x80 + c]));
        }
        this.channelCount = channelMap.length;
        for (const full of fullPatterns) {
            const pattern = new TrackerPattern(full.rows, this.channelCount);
            for (let row = 0; row < full.rows; row++) {
                for (const [c, source] of channelMap.entries()) {
                    const offset = full.getCellOffset(row, source);
                    const muted = mutedChannels[c];
                    pattern.setCell(
                        row,
                        c,
                        muted ? NOTE_NONE : full.getNote(offset),
                        muted ? 0 : full.getInstrument(offset),
                        muted ? 0 : full.getVolume(offset),
                        full.getEffect(offset),
                        full.getParam(offset)
                    );
                }
            }
            this.patterns.push(pattern);
        }

        // Files saved by ModPlug Tracker and old OpenMPT versions use their mixing levels
        let modPlugMade =
            ((trackerVersion & 0xf0_00) === 0x50_00 &&
                readBinaryString(binary, 4, 0x3c) === "OMPT") ||
            compatibleVersion === 0x8_88 ||
            trackerVersion === 0x8_88 ||
            (trackerVersion === 0x2_14 &&
                compatibleVersion === 0x2_02 &&
                reserved === 0) ||
            (trackerVersion === 0x2_17 &&
                compatibleVersion === 0x2_00 &&
                reserved === 0);
        let highestChannel = usedChannels.lastIndexOf(true) + 1;
        const extensions = this.readExtensions(
            binary,
            extensionsOffset,
            this.instrumentMode ? instrumentCount : 0
        );
        let mixLevels = -1;
        // ChibiTracker modules are twice as loud
        const chibiTracker = readBinaryString(binary, 4, 0x3c) === "CHBI";
        let samplePreAmp = chibiTracker ? mixVolume / 2 : mixVolume;
        this.retriggerStoppedSamples = chibiTracker;
        if (extensions) {
            modPlugMade = true;
            mixLevels = extensions.mixLevels;
            if (extensions.samplePreAmp >= 0) {
                samplePreAmp = Math.min(2000, extensions.samplePreAmp);
            }
            highestChannel = Math.max(highestChannel, extensions.channels);
        }
        if (mixLevels < 0) {
            mixLevels = modPlugMade ? MixLevels.original : MixLevels.compatible;
        }
        // The old mixing levels depend on the channel count, measured against OpenMPT
        const preAmpTable =
            PRE_AMP_TABLE[Math.min(31, Math.max(1, highestChannel)) >> 1];
        let gain = 1;
        switch (mixLevels) {
            default: {
                break;
            }

            case MixLevels.original: {
                gain = 64 / preAmpTable;
                break;
            }

            case MixLevels.v117RC1: {
                gain = 8 / preAmpTable;
                break;
            }

            case MixLevels.v117RC2: {
                gain = 128 / preAmpTable;
                break;
            }

            case MixLevels.v117RC3: {
                gain = 2;
                break;
            }
        }
        // Calibrated against OpenMPT, the mix volume is the pre-amp.
        // The linear pan level makes centered channels 3 dB quieter, so everything is 3 dB louder.
        // OpenMPT is 1 dB quieter than that in the player tests and other modules
        this.setPreAmp(Math.max(1, samplePreAmp * gain * Math.SQRT2 * 0.89));

        let message = "";
        if (special & 1) {
            message = readBinaryString(
                binary,
                readLittleEndian(binary, 2, 0x36),
                readLittleEndian(binary, 4, 0x38)
            )
                .replaceAll("\r\n", "\n")
                .replaceAll("\r", "\n")
                .trim();
        }
        const names = (this.instrumentMode ? instrumentNames : sampleNames)
            .join("\n")
            .trim();
        this.comment = [message, names].filter(Boolean).join("\n\n");
    }

    protected createChannel(index: number, panning: number) {
        const channel = new ImpulseTrackerChannel(
            index,
            panning,
            this.channelVolumes[index] ?? 64
        );
        channel.surround = this.channelSurround[index] ?? false;
        return channel;
    }

    protected noteToPeriod(note: number, channel: TrackerChannel) {
        // Impulse Tracker periods are frequencies in Hertz
        return channel.finetune * Math.pow(2, (note - MIDDLE_C_NOTE) / 12);
    }

    protected periodToFrequency(period: number) {
        return period;
    }

    protected getFrequency(channel: TrackerChannel) {
        return (channel as ImpulseTrackerChannel).outputFrequency;
    }

    protected processRow(channel: TrackerChannel) {
        this.processEffects(channel as ImpulseTrackerChannel);
    }

    protected processTick(channel: TrackerChannel) {
        this.processEffects(channel as ImpulseTrackerChannel);
    }

    protected isVoiceFinished(voice: TrackerChannel) {
        const v = voice as ImpulseTrackerChannel;
        // Background voices without volume are stopped
        if (
            super.isVoiceFinished(voice) ||
            !v.playing ||
            (v.noteFade && v.fadeout <= 0) ||
            !v.volume ||
            !v.channelVolume ||
            !v.instrumentVolume
        ) {
            return true;
        }
        // Inaudible fading voices only get quieter once the volume envelope has ended
        if (!v.noteFade || v.outputLevel >= INAUDIBLE_LEVEL) {
            return false;
        }
        const envelope = v.instrument?.volumeEnvelope;
        const points = envelope?.points ?? [];
        return (
            !envelope?.enabled ||
            points.length === 0 ||
            (envelope.loopEnd < 0 &&
                v.volumeEnvelopeState.position - 1 >=
                    points[points.length - 1].tick)
        );
    }

    /**
     * Processes the volumes, envelopes, panning, filter and pitch of a channel or background voice for the current tick.
     * Follows the mixer setup of OpenMPT.
     * @param channel The channel.
     */
    protected updateChannel(channel: TrackerChannel) {
        const ch = channel as ImpulseTrackerChannel;
        const firstTick = this.tick === 0;
        const instrument = ch.instrument;
        const samplePlaying = ch.playing && ch.period > 0;
        let volume = ch.volume * 4;
        let instrumentVolume = ch.instrumentVolume;
        let panning = ch.panning;
        let envelopeVolume = 1;
        let fadeoutVolume = 1;
        let frequency = ch.period;
        ch.tremorMuted = false;
        if (samplePlaying) {
            instrumentVolume = Math.min(
                64,
                Math.max(0, instrumentVolume + ch.volumeSwing)
            );
            panning = Math.min(256, Math.max(0, panning + ch.panningSwing));

            // Tremolo
            if (ch.tremoloActive) {
                const delta = this.getWaveform(ch.tremoloType, ch.tremoloPos);
                volume += Math.trunc((delta * ch.tremoloDepth) / 32);
                if (!firstTick || !this.oldEffects) {
                    ch.tremoloPos =
                        (ch.tremoloPos + 4 * ch.tremoloSpeed) & 0xff;
                }
            }

            // Tremor
            if (ch.command === ImpulseTrackerEffects.tremor) {
                if (ch.tremorCount & 0x80) {
                    if (ch.tremorCount === 0x80) {
                        ch.tremorCount = (ch.tremorParam >> 4) | 0xc0;
                    } else if (ch.tremorCount === 0xc0) {
                        ch.tremorCount = (ch.tremorParam & 0x0f) | 0x80;
                    } else {
                        ch.tremorCount--;
                    }
                }
                if ((ch.tremorCount & 0xc0) === 0x80) {
                    volume = 0;
                }
            }
            volume = Math.min(256, Math.max(0, volume));

            // Envelopes
            if (instrument) {
                // The positions are updated before the envelopes are processed
                this.incrementEnvelope(
                    ch,
                    ch.volumeEnvelopeState,
                    instrument.volumeEnvelope,
                    true
                );
                this.incrementEnvelope(
                    ch,
                    ch.panningEnvelopeState,
                    instrument.panningEnvelope,
                    false
                );
                this.incrementEnvelope(
                    ch,
                    ch.pitchEnvelopeState,
                    instrument.pitchEnvelope,
                    false
                );
                // S77, S79 and S7B only pause the envelopes
                const volumeState = ch.volumeEnvelopeState;
                if (
                    (volumeState.enabled ||
                        instrument.volumeEnvelope.enabled) &&
                    volumeState.position > 0
                ) {
                    envelopeVolume =
                        getEnvelopeValue(
                            instrument.volumeEnvelope,
                            volumeState.position - 1
                        ) / 64;
                }
                // Fadeout
                if (ch.noteFade) {
                    if (instrument.fadeout) {
                        ch.fadeout = Math.max(
                            0,
                            ch.fadeout - instrument.fadeout * 2
                        );
                        fadeoutVolume = ch.fadeout / 65_536;
                    } else if (!ch.fadeout) {
                        fadeoutVolume = 0;
                    }
                }
                const panningState = ch.panningEnvelopeState;
                if (
                    (panningState.enabled ||
                        instrument.panningEnvelope.enabled) &&
                    panningState.position > 0
                ) {
                    const value =
                        getEnvelopeValue(
                            instrument.panningEnvelope,
                            panningState.position - 1
                        ) - 32;
                    panning +=
                        (value * (panning >= 128 ? 256 - panning : panning)) /
                        32;
                    panning = Math.min(256, Math.max(0, panning));
                }
            } else if (ch.noteFade) {
                // Without an instrument, key off cuts the note
                ch.fadeout = 0;
                volume = 0;
            }

            // Glissando
            if (ch.glissando && ch.portamentoActive && frequency > 0) {
                const note = Math.min(
                    NOTE_MAX,
                    Math.max(
                        1,
                        Math.ceil(
                            MIDDLE_C_NOTE +
                                12 * Math.log2(frequency / ch.finetune) -
                                1e-6
                        )
                    )
                );
                frequency = this.noteToPeriod(note, ch);
            }

            // Arpeggio
            if (
                ch.command === ImpulseTrackerEffects.arpeggio &&
                ch.arpeggioParam
            ) {
                const step =
                    (this.rowTick % (this.speed + this.frameDelay)) % 3;
                const semitones =
                    step === 1
                        ? ch.arpeggioParam >> 4
                        : step === 2
                          ? ch.arpeggioParam & 0x0f
                          : 0;
                frequency *= Math.pow(2, semitones / 12);
            }

            // Panbrello
            let delta = ch.panbrelloOffset;
            if (ch.rowEffect === ImpulseTrackerEffects.panbrello) {
                delta = this.getWaveform(ch.panbrelloType, ch.panbrelloPos);
                if (ch.panbrelloType === 3) {
                    // Sample and hold
                    if (
                        ch.panbrelloPos === 0 ||
                        ch.panbrelloPos >= ch.panbrelloSpeed
                    ) {
                        ch.panbrelloPos = 0;
                        ch.panbrelloRandom = delta;
                    }
                    ch.panbrelloPos = (ch.panbrelloPos + 1) & 0xff;
                    delta = ch.panbrelloRandom;
                } else {
                    ch.panbrelloPos =
                        (ch.panbrelloPos + ch.panbrelloSpeed) & 0xff;
                }
                // The panbrello stays until the next note or panning command
                ch.panbrelloOffset = delta;
            }
            if (delta) {
                panning = Math.min(
                    256,
                    Math.max(
                        0,
                        panning +
                            Math.trunc((delta * ch.panbrelloDepth + 2) / 8)
                    )
                );
            }
        }
        if (ch.surround || !this.stereo) {
            // Surround is played as center
            panning = 128;
        }

        // The filter of a new note
        if (ch.triggered) {
            let useFilter = !this.openMPTFilterMode;
            if (instrument) {
                if (instrument.resonance >= 0) {
                    ch.resonance = instrument.resonance;
                    useFilter = true;
                }
                if (instrument.cutoff >= 0) {
                    ch.cutoff = instrument.cutoff;
                    useFilter = true;
                }
            } else {
                ch.volumeSwing = 0;
                ch.panningSwing = 0;
                ch.cutoffSwing = 0;
                ch.resonanceSwing = 0;
            }
            if (useFilter) {
                this.setupFilter(ch, 256);
            }
        }

        // MIDI macros
        if (!ch.background) {
            this.processMacro(ch);
        }

        if (samplePlaying && instrument) {
            // Pitch or filter envelope
            const state = ch.pitchEnvelopeState;
            if (
                (state.enabled || instrument.pitchEnvelope.enabled) &&
                instrument.pitchEnvelope.points.length > 0
            ) {
                if (state.position === 0) {
                    // Impulse Tracker applies the filter as if the envelope was at its center
                    if (instrument.filterEnvelope) {
                        this.setupFilter(ch, 0);
                    }
                } else {
                    const value =
                        (getEnvelopeValue(
                            instrument.pitchEnvelope,
                            state.position - 1
                        ) -
                            32) *
                        8;
                    if (instrument.filterEnvelope) {
                        this.setupFilter(ch, value);
                    } else {
                        frequency *= Math.pow(
                            2,
                            Math.min(255, Math.max(-255, value)) / 192
                        );
                    }
                }
            }
        }

        // Vibrato, applied twice if both the volume column and the effect column have it
        const [volumeCommand, volumeParam] = decodeVolume(ch.rowVolume);
        if (
            volumeCommand === VolumeCommands.vibratoDepth &&
            (ch.rowEffect === ImpulseTrackerEffects.vibrato ||
                ch.rowEffect === ImpulseTrackerEffects.vibratoVolumeSlide ||
                ch.rowEffect === ImpulseTrackerEffects.fineVibrato)
        ) {
            this.setVibrato(ch, volumeParam, 4);
            frequency = this.applyVibrato(ch, frequency, firstTick);
        }
        frequency = this.applyVibrato(ch, frequency, firstTick);

        // Automatic vibrato
        const sample = ch.sample;
        if (samplePlaying && sample?.vibratoDepth && sample.vibratoRate) {
            const position = ch.autoVibratoPos & 0xff;
            ch.autoVibratoDepth = Math.min(
                sample.vibratoDepth * 256,
                ch.autoVibratoDepth + sample.vibratoSweep
            );
            const depth = Math.trunc(ch.autoVibratoDepth / 256);
            ch.autoVibratoPos = (ch.autoVibratoPos + sample.vibratoRate) & 0xff;
            let delta: number;
            switch (sample.vibratoType) {
                default: {
                    delta = SINE_TABLE[position];
                    break;
                }

                case 1: {
                    delta = 64 - Math.trunc((position + 1) / 2);
                    break;
                }

                case 2: {
                    delta = position < 128 ? 64 : 0;
                    break;
                }

                case 3: {
                    delta = this.random7() - 0x40;
                    break;
                }

                case 4: {
                    delta = Math.trunc((position + 1) / 2) - 64;
                    break;
                }
            }
            delta = Math.trunc((delta * depth) / 64);
            frequency *= Math.pow(2, delta / 768);
        }

        // Effects on the next tick see if the sample was playing on this one
        ch.active = samplePlaying;
        // A finished fadeout stops the sample for good
        if (ch.noteFade && ch.fadeout <= 0 && !ch.trigger) {
            ch.samplePosition = Infinity;
        }
        // Outputs
        if (!samplePlaying && !ch.trigger) {
            // A stopped channel is silent, end its note
            fadeoutVolume = 0;
            if (ch.output && ch.output.activeKey !== -1) {
                ch.stop = true;
            }
        }
        ch.outputFrequency = samplePlaying ? frequency : 0;
        ch.volumeDelta = volume / 4 - ch.volume;
        ch.envelopeVolume = envelopeVolume;
        ch.fadeoutVolume = fadeoutVolume;
        ch.volumeScale = (ch.channelVolume / 64) * (instrumentVolume / 64);
        ch.outputPanning = panning;
        if (ch.filterEnabled) {
            const filter = matchFilter(
                ch.filterCutoffValue,
                ch.resonance,
                this.extendedFilterRange
            );
            ch.filterCutoff = filter.cents;
            ch.filterResonance = filter.centibels;
        } else {
            ch.filterCutoff = 13_500;
            ch.filterResonance = 0;
        }
        ch.previousKeyOff = ch.keyOff;
    }

    protected getTickDuration() {
        switch (this.tempoMode) {
            default: {
                return 2.5 / this.tempo;
            }

            case 1: {
                // Alternative: the tempo is the number of ticks per second
                return 1 / this.tempo;
            }

            case 2: {
                // Modern: the tempo is in beats per minute
                return 60 / (this.tempo * this.speed * this.rowsPerBeat);
            }
        }
    }

    /**
     * Reads the OpenMPT instrument (XTPM) and song (STPM) extensions.
     * @param binary The file data.
     * @param offset The offset after the last sample and pattern.
     * @param instrumentCount The number of instruments in the file.
     * @returns The song properties that need the rest of the file, undefined if there are no song extensions.
     */
    private readExtensions(
        binary: IndexedByteArray,
        offset: number,
        instrumentCount: number
    ) {
        // The chunk identifiers are stored reversed
        const readCode = (position: number) => {
            const code = readBinaryString(binary, 4, position);
            return code[3] + code[2] + code[1] + code[0];
        };
        const isText = (position: number) => {
            let anyLetter = false;
            for (let i = 0; i < 4; i++) {
                const byte = binary[position + i];
                if (byte >= 0x80) {
                    return false;
                }
                anyLetter ||= (byte & 0x60) !== 0;
            }
            return anyLetter;
        };
        const readValue = (position: number, size: number) =>
            size > 0
                ? readLittleEndian(binary, Math.min(4, size), position)
                : 0;

        if (readBinaryString(binary, 4, offset) === "XTPM") {
            offset += 4;
            while (offset + 6 <= binary.length) {
                const code = readCode(offset);
                if (code === "MPTS" || !isText(offset)) {
                    break;
                }
                const size = readLittleEndian(binary, 2, offset + 4);
                offset += 6;
                for (let i = 0; i < instrumentCount; i++) {
                    const instrument = this.itInstruments[i];
                    if (instrument && offset + size <= binary.length) {
                        this.readInstrumentExtension(
                            instrument,
                            code,
                            readValue(offset, size)
                        );
                    }
                    offset += size;
                }
            }
        }

        if (readBinaryString(binary, 4, offset) !== "STPM") {
            return undefined;
        }
        offset += 4;
        const properties = {
            mixLevels: -1,
            samplePreAmp: -1,
            channels: 0
        };
        let tempo = this.initialTempo;
        let tempoFraction = 0;
        while (offset + 7 <= binary.length && isText(offset)) {
            const code = readCode(offset);
            const size = readLittleEndian(binary, 2, offset + 4);
            offset += 6;
            if (offset + size > binary.length) {
                break;
            }
            const value = readValue(offset, size);
            switch (code) {
                default: {
                    break;
                }

                case "DT..": {
                    tempo = value;
                    break;
                }

                case "DTFR": {
                    tempoFraction = value;
                    break;
                }

                case "RPB.": {
                    this.rowsPerBeat = value || 4;
                    break;
                }

                case "TM..": {
                    this.tempoMode = value < 3 ? value : 0;
                    break;
                }

                case "PMM.": {
                    properties.mixLevels = value < 6 ? value : 0;
                    break;
                }

                case "SPA.": {
                    properties.samplePreAmp = value;
                    break;
                }

                case "DGV.": {
                    // Stored from 0 to 256
                    this.initialGlobalVolume = Math.min(256, value) / 4;
                    break;
                }

                case "RP..": {
                    this.restartPosition = value;
                    break;
                }

                case "C...": {
                    properties.channels = value;
                    break;
                }

                case "AUTH": {
                    this.artist = readBinaryString(binary, size, offset).trim();
                    break;
                }
            }
            offset += size;
        }
        // The fraction is in 1/10,000
        this.initialTempo = Math.min(
            this.tempoMode === 2 ? 1000 : 255,
            Math.max(32, tempo + tempoFraction / 10_000)
        );
        return properties;
    }

    /**
     * Applies one OpenMPT instrument extension field.
     * @param instrument The instrument.
     * @param code The field code.
     * @param value The field value.
     */
    private readInstrumentExtension(
        instrument: ImpulseTrackerInstrument,
        code: string,
        value: number
    ) {
        switch (code) {
            default: {
                break;
            }

            case "FO..": {
                instrument.fadeout = value;
                break;
            }

            case "GV..": {
                instrument.globalVolume = Math.min(64, value);
                break;
            }

            case "P...": {
                instrument.panning = Math.min(256, value);
                break;
            }

            case "VS..": {
                instrument.volumeSwing = Math.min(100, value);
                break;
            }

            case "PS..": {
                instrument.panningSwing = Math.min(64, value);
                break;
            }

            case "CS..": {
                instrument.cutoffSwing = Math.min(64, value);
                break;
            }

            case "RS..": {
                instrument.resonanceSwing = Math.min(64, value);
                break;
            }

            case "NNA.": {
                instrument.newNoteAction = value & 3;
                break;
            }

            case "DCT.": {
                instrument.duplicateCheckType = value & 3;
                break;
            }

            case "DNA.": {
                instrument.duplicateCheckAction = value % 3;
                break;
            }

            case "PPS.": {
                instrument.pitchPanSeparation = (value << 24) >> 24;
                break;
            }

            case "PPC.": {
                instrument.pitchPanCenter = Math.min(119, value);
                break;
            }

            case "IFC.": {
                instrument.cutoff = value & 0x80 ? value & 0x7f : -1;
                break;
            }

            case "IFR.": {
                instrument.resonance = value & 0x80 ? value & 0x7f : -1;
                break;
            }
        }
    }

    /**
     * Detects the tracker that saved the module.
     * @param binary The file data.
     * @param trackerVersion The Cwt/v field.
     * @param compatibleVersion The Cmwt field.
     * @param reserved The reserved field.
     */
    private detectTracker(
        binary: IndexedByteArray,
        trackerVersion: number,
        compatibleVersion: number,
        reserved: number
    ) {
        if (readBinaryString(binary, 4, 0x3c) === "CHBI") {
            return "ChibiTracker";
        }
        switch (trackerVersion >> 12) {
            default: {
                return "";
            }

            case 0: {
                if (
                    trackerVersion === 0x2_17 &&
                    compatibleVersion === 0x2_00 &&
                    reserved === 0
                ) {
                    return "ModPlug Tracker";
                }
                if (trackerVersion === 0x2_14 && compatibleVersion === 0x2_02) {
                    return "ModPlug Tracker";
                }
                if (compatibleVersion > 0x2_14) {
                    return "Impulse Tracker 2.15";
                }
                if (trackerVersion >= 0x2_15 && trackerVersion <= 0x2_17) {
                    return `Impulse Tracker 2.14p${["1-2", "3", "4-5"][trackerVersion - 0x2_15]}`;
                }
                return `Impulse Tracker ${(trackerVersion >> 8) & 0x0f}.${(trackerVersion & 0xff).toString(16).padStart(2, "0")}`;
            }

            case 1: {
                return "Schism Tracker";
            }

            case 4: {
                return "pyIT";
            }

            case 5: {
                return "OpenMPT";
            }

            case 6: {
                return "BeRoTracker";
            }

            case 7: {
                return "ITMCK";
            }

            case 8: {
                return "Tralala";
            }

            case 0xc: {
                return "ChickDune ChipTune Tracker";
            }

            case 0xd: {
                return "Dushin";
            }
        }
    }

    /**
     * Reads the MIDI macros, embedded in the file or the defaults.
     * @param binary The file data.
     * @param offset The offset after the parapointers.
     * @param flags The header flags.
     * @param special The header special flags.
     */
    private readMacros(
        binary: IndexedByteArray,
        offset: number,
        flags: number,
        special: number
    ) {
        // SF0 controls the cutoff, Z80-Z8F the resonance
        this.parameteredMacros[0] = "F0F000z";
        for (let i = 0; i < 16; i++) {
            this.fixedMacros[i] =
                `F0F001${(i * 8).toString(16).padStart(2, "0").toUpperCase()}`;
        }
        if ((flags & 0x80) === 0 && (special & 8) === 0) {
            return;
        }
        if (special & 2) {
            // The edit history comes first
            offset += 2 + readLittleEndian(binary, 2, offset) * 8;
        }
        // Skip the global macros
        offset += 9 * MACRO_LENGTH;
        if (offset + 144 * MACRO_LENGTH > binary.length) {
            return;
        }
        for (let i = 0; i < 16; i++) {
            this.parameteredMacros[i] = readBinaryString(
                binary,
                MACRO_LENGTH,
                offset + i * MACRO_LENGTH
            );
        }
        offset += 16 * MACRO_LENGTH;
        for (let i = 0; i < 128; i++) {
            this.fixedMacros[i] = readBinaryString(
                binary,
                MACRO_LENGTH,
                offset + i * MACRO_LENGTH
            );
        }
    }

    /**
     * Reads the packed data of a pattern.
     * @param binary The file data.
     * @param offset The pattern header offset.
     * @param pattern The pattern to fill (64 channels).
     * @param usedChannels Set to true for the channels with data.
     * @param trackerVersion The Cwt/v field of the module header.
     */
    private readPattern(
        binary: IndexedByteArray,
        offset: number,
        pattern: TrackerPattern,
        usedChannels: boolean[],
        trackerVersion: number
    ) {
        const end = Math.min(
            binary.length,
            offset + 8 + readLittleEndian(binary, 2, offset)
        );
        const masks = new Uint8Array(MAX_CHANNELS);
        const lastNote = new Uint8Array(MAX_CHANNELS);
        const lastInstrument = new Uint8Array(MAX_CHANNELS);
        const lastVolume = new Uint8Array(MAX_CHANNELS);
        const lastEffect = new Uint8Array(MAX_CHANNELS);
        const lastParam = new Uint8Array(MAX_CHANNELS);
        let position = offset + 8;
        for (let row = 0; row < pattern.rows && position < end;) {
            const channelVariable = binary[position++];
            if (channelVariable === 0) {
                row++;
                continue;
            }
            const channel = (channelVariable - 1) & 0x3f;
            if (channelVariable & 0x80) {
                masks[channel] = binary[position++];
            }
            const mask = masks[channel];
            let note = NOTE_NONE;
            let instrument = 0;
            // Stored plus one, so 0 means no volume
            let volume = 0;
            let effect = 0;
            let param = 0;
            if (mask & 1) {
                lastNote[channel] = binary[position++];
            }
            if (mask & 2) {
                lastInstrument[channel] = binary[position++];
            }
            if (mask & 4) {
                lastVolume[channel] = binary[position++];
            }
            if (mask & 8) {
                lastEffect[channel] = binary[position++];
                lastParam[channel] = binary[position++];
            }
            if (mask & 0x11) {
                const value = lastNote[channel];
                if (value < NOTE_MAX) {
                    note = value + 1;
                } else if (value === 255) {
                    note = NOTE_OFF;
                } else if (value === 254) {
                    note = NOTE_CUT;
                } else {
                    note = NOTE_FADE;
                }
            }
            if (mask & 0x22) {
                instrument = lastInstrument[channel];
            }
            if (mask & 0x44) {
                volume = lastVolume[channel] + 1;
            }
            if (mask & 0x88) {
                effect = lastEffect[channel];
                param = lastParam[channel];
                if (
                    effect === ImpulseTrackerEffects.extended &&
                    param >> 4 === ImpulseTrackerExtendedEffects.highOffset &&
                    trackerVersion < 0x2_00
                ) {
                    // Impulse Tracker 1.xx has no high offset
                    effect = 0;
                } else if (
                    effect === ImpulseTrackerEffects.globalVolume &&
                    param > 0x80 &&
                    trackerVersion >= 0x10_00 &&
                    trackerVersion <= 0x10_50
                ) {
                    // Old Schism Tracker versions saved these differently
                    param = 0x80;
                }
            }
            usedChannels[channel] = true;
            pattern.setCell(
                row,
                channel,
                note,
                instrument,
                volume,
                effect,
                param
            );
        }
    }

    /**
     * Reads an instrument.
     * @param binary The file data.
     * @param offset The instrument header offset.
     * @param compatibleVersion The compatible tracker version of the module.
     */
    private readInstrument(
        binary: IndexedByteArray,
        offset: number,
        compatibleVersion: number
    ) {
        const instrument: ImpulseTrackerInstrument = {
            name: readBinaryString(binary, 26, offset + 0x20),
            sampleMap: new Int16Array(NOTE_MAX).fill(-1),
            noteMap: new Uint8Array(NOTE_MAX),
            volumeEnvelope: emptyEnvelope(),
            panningEnvelope: emptyEnvelope(),
            pitchEnvelope: emptyEnvelope(),
            filterEnvelope: false,
            fadeout: 0,
            newNoteAction: NoteActions.cut,
            duplicateCheckType: 0,
            duplicateCheckAction: NoteActions.cut,
            globalVolume: 64,
            panning: -1,
            volumeSwing: 0,
            panningSwing: 0,
            cutoffSwing: 0,
            resonanceSwing: 0,
            pitchPanSeparation: 0,
            pitchPanCenter: 60,
            cutoff: -1,
            resonance: -1
        };
        for (let n = 0; n < NOTE_MAX; n++) {
            const note = binary[offset + 0x40 + n * 2];
            const sample = binary[offset + 0x41 + n * 2];
            instrument.noteMap[n] = note < NOTE_MAX ? note : n;
            instrument.sampleMap[n] = sample > 0 ? sample - 1 : -1;
        }
        if (readBinaryString(binary, 4, offset) !== "IMPI") {
            return instrument;
        }

        if (compatibleVersion >= 0x2_00) {
            instrument.newNoteAction = binary[offset + 0x11] & 3;
            instrument.duplicateCheckType = binary[offset + 0x12] & 3;
            instrument.duplicateCheckAction = binary[offset + 0x13] % 3;
            // The fadeout is subtracted from 65,536 twice every tick
            instrument.fadeout =
                readLittleEndian(binary, 2, offset + 0x14) << 5;
            instrument.pitchPanSeparation = (binary[offset + 0x16] << 24) >> 24;
            instrument.pitchPanCenter = Math.min(119, binary[offset + 0x17]);
            instrument.globalVolume = Math.min(64, binary[offset + 0x18] >> 1);
            const panning = binary[offset + 0x19];
            // Bit 7 set means the default panning is not used
            if ((panning & 0x80) === 0) {
                instrument.panning = panning * 4;
                if (instrument.panning > 256) {
                    instrument.panning = 128;
                }
            }
            instrument.volumeSwing = Math.min(100, binary[offset + 0x1a]);
            instrument.panningSwing = Math.min(64, binary[offset + 0x1b]);
            const cutoff = binary[offset + 0x3a];
            const resonance = binary[offset + 0x3b];
            if (cutoff & 0x80) {
                instrument.cutoff = cutoff & 0x7f;
            }
            if (resonance & 0x80) {
                instrument.resonance = resonance & 0x7f;
            }
            instrument.volumeEnvelope = readEnvelope(
                binary,
                offset + 0x1_30,
                false
            );
            instrument.panningEnvelope = readEnvelope(
                binary,
                offset + 0x1_82,
                true
            );
            instrument.pitchEnvelope = readEnvelope(
                binary,
                offset + 0x1_d4,
                true
            );
            instrument.filterEnvelope = (binary[offset + 0x1_d4] & 0x80) !== 0;
            return instrument;
        }

        // Old format (Impulse Tracker 1.xx) with a volume envelope only
        instrument.fadeout = readLittleEndian(binary, 2, offset + 0x18) << 6;
        instrument.newNoteAction = binary[offset + 0x1a] & 3;
        instrument.duplicateCheckType = binary[offset + 0x1b] ? 1 : 0;
        const points = new Array<TrackerEnvelopePoint>();
        for (let p = 0; p < MAX_ENVELOPE_POINTS; p++) {
            const tick = binary[offset + 0x1_f8 + p * 2];
            if (tick === 0xff) {
                break;
            }
            points.push({
                tick,
                value: Math.min(64, binary[offset + 0x1_f9 + p * 2])
            });
        }
        const flags = binary[offset + 0x11];
        const loop = [binary[offset + 0x12], binary[offset + 0x13]];
        const sustain = [binary[offset + 0x14], binary[offset + 0x15]];
        // Old instruments drop loops that point beyond the envelope
        instrument.volumeEnvelope = createEnvelope(
            points,
            (flags & 1) |
                (Math.max(loop[0], loop[1]) < points.length ? flags & 2 : 0) |
                (Math.max(sustain[0], sustain[1]) < points.length
                    ? flags & 4
                    : 0),
            loop[0],
            loop[1],
            sustain[0],
            sustain[1]
        );
        return instrument;
    }

    /**
     * A 7-bit random number, deterministic.
     */
    private random7() {
        return this.randomByte() & 0x7f;
    }

    /**
     * A signed 8-bit random number, deterministic.
     */
    private randomInt8() {
        return (this.randomByte() << 24) >> 24;
    }

    private randomByte() {
        // Xorshift
        let x = this.randomState;
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        this.randomState = x >>> 0;
        return (this.randomState >>> 8) & 0xff;
    }

    /**
     * Gets the value of a vibrato, tremolo or panbrello waveform.
     * @param waveform The waveform (0 sine, 1 ramp down, 2 square, 3 random).
     * @param position The position (0-255).
     * @returns The value (-64 to 64).
     */
    private getWaveform(waveform: number, position: number) {
        position &= 0xff;
        switch (waveform & 3) {
            default: {
                return SINE_TABLE[position];
            }

            case 1: {
                return 64 - Math.trunc((position + 1) / 2);
            }

            case 2: {
                return position < 128 ? 64 : 0;
            }

            case 3: {
                return this.random7() - 0x40;
            }
        }
    }

    /**
     * Gets the sample index of a note of an instrument (or of a sample number in sample mode).
     * @param note The one-based note.
     * @param instrument The one-based instrument number.
     * @returns The sample index, -1 if none.
     */
    private getSampleIndex(note: number, instrument: number) {
        if (!this.instrumentMode) {
            return instrument - 1;
        }
        if (!isNote(note)) {
            return -1;
        }
        return this.itInstruments[instrument - 1]?.sampleMap[note - 1] ?? -1;
    }

    /**
     * Gets a sample by its index, the empty sample for an index that does not exist.
     * @param index The sample index.
     */
    private getSample(index: number) {
        return this.itSamples[index] ?? EMPTY_SAMPLE;
    }

    /**
     * Combines an effect parameter with the extended parameters (#xx) on the following rows.
     * @param channel The channel.
     * @param param The effect parameter.
     * @param rows The maximum number of extended parameter rows.
     * @returns The combined value and the number of extended parameter rows.
     */
    private getExtendedParameter(
        channel: ImpulseTrackerChannel,
        param: number,
        rows: number
    ) {
        const pattern = this.currentPattern;
        let value = param;
        let count = 0;
        for (
            let row = this.currentRow + 1;
            row < pattern.rows && count < rows;
            row++
        ) {
            const offset = pattern.getCellOffset(row, channel.index);
            if (
                pattern.getEffect(offset) !==
                ImpulseTrackerEffects.extendedParameter
            ) {
                break;
            }
            value = value * 256 + pattern.getParam(offset);
            count++;
        }
        return { value, count };
    }

    /**
     * Processes the row data and the effects of a channel for the current tick.
     * Follows the effect processing of OpenMPT in its Impulse Tracker compatible mode.
     * @param ch The channel.
     */
    private processEffects(ch: ImpulseTrackerChannel) {
        const rowTick = this.rowTick;
        const firstTick = this.tick === 0;
        const rowLength = this.speed + this.frameDelay;
        const tickCount = rowTick % rowLength;
        if (rowTick === 0) {
            ch.vibratoActive = false;
            ch.tremoloActive = false;
            ch.command = 0;
        }
        let instrumentNumber = ch.rowInstrument;
        let note = ch.rowNote;
        const [volumeCommand, volumeColumn] = decodeVolume(ch.rowVolume);
        let volumeParam = volumeColumn;
        const effect = ch.rowEffect;
        let param = ch.rowParam;
        const porta =
            effect === ImpulseTrackerEffects.tonePortamento ||
            effect === ImpulseTrackerEffects.tonePortamentoVolumeSlide ||
            volumeCommand === VolumeCommands.tonePortamento;
        let startTick = 0;
        ch.isFirstTick = firstTick;

        // A note and instrument that map to no sample make Impulse Tracker ignore the whole cell
        if (this.instrumentMode && instrumentNumber > 0) {
            const instrument = this.itInstruments[instrumentNumber - 1];
            const mapNote = note === NOTE_NONE ? ch.newNote : note;
            if (
                instrument &&
                isNote(mapNote) &&
                instrument.sampleMap[mapNote - 1] < 0
            ) {
                ch.newNote = mapNote;
                ch.lastNote = mapNote;
                ch.newInstrument = instrumentNumber;
                ch.rowNote = NOTE_NONE;
                ch.rowInstrument = 0;
                ch.rowVolume = 0;
                ch.rowEffect = 0;
                ch.rowParam = 0;
                return;
            }
        }

        // Note delay, note cut and row delay
        if (effect === ImpulseTrackerEffects.delayCut) {
            startTick = param >> 4;
            this.noteCut(ch, startTick + (param & 0x0f));
        } else if (effect === ImpulseTrackerEffects.extended) {
            if (param) {
                ch.oldExtended = param;
            } else {
                param = ch.oldExtended;
            }
            if (param >> 4 === ImpulseTrackerExtendedEffects.noteDelay) {
                startTick = param & 0x0f || 1;
                if (startTick >= rowLength) {
                    // A delay beyond the row ignores the cell
                    if (instrumentNumber) {
                        ch.newInstrument = instrumentNumber;
                    }
                    return;
                }
            } else if (
                firstTick &&
                param >> 4 === ImpulseTrackerExtendedEffects.rowDelay
            ) {
                // Only the first row delay on the row counts, even SE0
                this.setRowDelay(param & 0x0f);
            }
        }

        let triggerNote = rowTick === startTick;
        if (startTick > 0 && tickCount === startTick) {
            // Delayed notes are triggered again by a row delay
            triggerNote = true;
        }
        ch.isFirstTick = tickCount === startTick;
        ch.triggered = false;

        if (triggerNote) {
            if (instrumentNumber) {
                ch.newInstrument = instrumentNumber;
            }
            if (this.instrumentMode && (note === NOTE_NONE || isNote(note))) {
                // Invalid instrument numbers do nothing, but they are remembered
                const check = instrumentNumber || ch.oldInstrument;
                if (check && !this.itInstruments[check - 1]) {
                    note = NOTE_NONE;
                    instrumentNumber = 0;
                }
            }
            const retriggerEnvelopes =
                note === NOTE_NONE && instrumentNumber !== 0;
            // Instrument numbers reset the envelopes depending on Old Effects and Compatible Gxx
            if (
                this.instrumentMode &&
                instrumentNumber &&
                !isNote(note) &&
                ((porta && this.compatibleGxx) || (!porta && this.oldEffects))
            ) {
                ch.resetEnvelopes();
                ch.fadeout = 65_536;
            }
            if (retriggerEnvelopes) {
                // An instrument number without a note retriggers the note
                // When the instrument changes or the sample has ended
                const ended = !ch.active;
                if (this.instrumentMode) {
                    if (
                        ch.instrument !==
                            this.itInstruments[instrumentNumber - 1] ||
                        ended
                    ) {
                        note = ch.note;
                    }
                } else if (
                    ch.sample !== this.getSample(instrumentNumber - 1) ||
                    ended
                ) {
                    note = ch.note;
                }
            }
            if (note >= NOTE_FADE) {
                // The default volume of the sample is recalled next to a note off
                if (instrumentNumber) {
                    const sample = this.getSampleIndex(
                        ch.lastNote,
                        instrumentNumber
                    );
                    if (sample >= 0) {
                        ch.volume = this.getSample(sample).volume;
                    }
                }
                if (!this.oldEffects) {
                    instrumentNumber = 0;
                }
            }
            const previousNewNote = ch.newNote;
            if (isNote(note)) {
                ch.newNote = note;
                ch.lastNote = note;
                if (!porta) {
                    this.checkNNA(ch, instrumentNumber, note, false);
                }
                this.restorePanningAndFilter(ch);
            }
            if (instrumentNumber) {
                const oldSample = ch.sample;
                this.instrumentChange(ch, instrumentNumber, porta, true, true);
                if (isNote(note)) {
                    ch.newInstrument = 0;
                    if (oldSample !== ch.sample && porta && ch.playing) {
                        // A sample swap during a portamento restarts the new sample
                        this.retrigger(ch, 0);
                    }
                }
            }
            if (note !== NOTE_NONE) {
                if (!instrumentNumber && ch.newInstrument && isNote(note)) {
                    // Change to the remembered instrument based on the previous note
                    if (isNote(previousNewNote)) {
                        ch.newNote = previousNewNote;
                    }
                    this.instrumentChange(
                        ch,
                        ch.newInstrument,
                        porta,
                        !ch.sample && !ch.instrument,
                        true
                    );
                    ch.newNote = note;
                    ch.newInstrument = 0;
                }
                this.noteChange(ch, note, porta, true);
            }
            if (volumeCommand === VolumeCommands.volume) {
                ch.volume = Math.min(64, volumeParam);
            } else if (volumeCommand === VolumeCommands.panning) {
                this.setPanning(ch, Math.min(64, volumeParam) * 4);
            }
        }

        // Effect memory of the portamentos is initialized in a specific order
        if (ch.isFirstTick) {
            const effectTonePorta =
                effect === ImpulseTrackerEffects.tonePortamento ||
                effect === ImpulseTrackerEffects.tonePortamentoVolumeSlide;
            if (effectTonePorta) {
                this.initTonePortamento(
                    ch,
                    effect === ImpulseTrackerEffects.tonePortamentoVolumeSlide
                        ? 0
                        : param
                );
            }
            if (volumeCommand === VolumeCommands.tonePortamento) {
                this.initTonePortamento(
                    ch,
                    VOLUME_COLUMN_PORTAMENTO[volumeParam & 0x0f]
                );
            }
            if (
                volumeParam &&
                (volumeCommand === VolumeCommands.portamentoUp ||
                    volumeCommand === VolumeCommands.portamentoDown)
            ) {
                ch.oldPortamento = volumeParam << 2;
                if (!effectTonePorta && !this.compatibleGxx) {
                    ch.portamentoSlide = volumeParam << 2;
                }
            }
            if (
                param &&
                (effect === ImpulseTrackerEffects.portamentoUp ||
                    effect === ImpulseTrackerEffects.portamentoDown)
            ) {
                ch.oldPortamento = param;
                if (!this.compatibleGxx) {
                    ch.portamentoSlide = param;
                }
            }
        }

        // Volume column effects
        if (volumeCommand > VolumeCommands.panning && rowTick >= startTick) {
            switch (volumeCommand) {
                default: {
                    break;
                }

                case VolumeCommands.tonePortamento: {
                    this.tonePortamento(
                        ch,
                        VOLUME_COLUMN_PORTAMENTO[volumeParam & 0x0f]
                    );
                    break;
                }

                case VolumeCommands.volumeSlideUp:
                case VolumeCommands.volumeSlideDown: {
                    // The volume column has its own memory
                    if (volumeParam === 0) {
                        volumeParam = ch.oldVolumeColumn;
                        if (volumeParam === 0) {
                            break;
                        }
                    } else {
                        ch.oldVolumeColumn = volumeParam;
                    }
                    this.volumeSlide(
                        ch,
                        volumeCommand === VolumeCommands.volumeSlideUp
                            ? volumeParam << 4
                            : volumeParam,
                        true
                    );
                    break;
                }

                case VolumeCommands.fineVolumeUp: {
                    // Not repeated by a row delay
                    if (rowTick === startTick) {
                        this.fineVolume(ch, volumeParam, 1, true);
                    }
                    break;
                }

                case VolumeCommands.fineVolumeDown: {
                    if (rowTick === startTick) {
                        this.fineVolume(ch, volumeParam, -1, true);
                    }
                    break;
                }

                case VolumeCommands.vibratoDepth: {
                    this.setVibrato(ch, volumeParam, 4);
                    break;
                }

                case VolumeCommands.portamentoUp: {
                    this.portamento(ch, volumeParam << 2, 1, true);
                    break;
                }

                case VolumeCommands.portamentoDown: {
                    this.portamento(ch, volumeParam << 2, -1, true);
                    break;
                }
            }
        }

        switch (effect) {
            default: {
                break;
            }

            case ImpulseTrackerEffects.speed: {
                if (firstTick) {
                    this.setSpeed(param);
                }
                break;
            }

            case ImpulseTrackerEffects.positionJump: {
                // The next row is decided on the first tick
                if (firstTick) {
                    this.setPositionJump(
                        this.getExtendedParameter(ch, param, 1).value
                    );
                }
                break;
            }

            case ImpulseTrackerEffects.patternBreak: {
                if (firstTick) {
                    this.patternBreak(
                        this.getExtendedParameter(ch, param, 1).value,
                        false
                    );
                }
                break;
            }

            case ImpulseTrackerEffects.volumeSlide: {
                this.volumeSlide(ch, param, false);
                break;
            }

            case ImpulseTrackerEffects.portamentoDown: {
                this.portamento(ch, param, -1, false);
                break;
            }

            case ImpulseTrackerEffects.portamentoUp: {
                this.portamento(ch, param, 1, false);
                break;
            }

            case ImpulseTrackerEffects.tonePortamento: {
                this.tonePortamento(ch, param);
                break;
            }

            case ImpulseTrackerEffects.tonePortamentoVolumeSlide: {
                this.volumeSlide(ch, param, false);
                this.tonePortamento(ch, 0);
                break;
            }

            case ImpulseTrackerEffects.vibrato: {
                this.setVibrato(ch, param, 4);
                break;
            }

            case ImpulseTrackerEffects.vibratoVolumeSlide: {
                this.volumeSlide(ch, param, false);
                this.setVibrato(ch, 0, 4);
                break;
            }

            case ImpulseTrackerEffects.fineVibrato: {
                this.setVibrato(ch, param, 1);
                break;
            }

            case ImpulseTrackerEffects.tremor: {
                if (!firstTick) {
                    break;
                }
                if (param && !this.oldEffects) {
                    if (param & 0xf0) {
                        param -= 0x10;
                    }
                    if (param & 0x0f) {
                        param -= 0x01;
                    }
                }
                ch.tremorCount |= 0x80;
                ch.command = ImpulseTrackerEffects.tremor;
                if (param) {
                    ch.tremorParam = param;
                }
                break;
            }

            case ImpulseTrackerEffects.arpeggio: {
                if (rowTick) {
                    break;
                }
                ch.command = ImpulseTrackerEffects.arpeggio;
                if (param) {
                    ch.arpeggioParam = param;
                }
                break;
            }

            case ImpulseTrackerEffects.channelVolume: {
                if (firstTick && param <= 64) {
                    ch.channelVolume = param;
                }
                break;
            }

            case ImpulseTrackerEffects.channelVolumeSlide: {
                if (param) {
                    ch.oldChannelVolumeSlide = param;
                }
                ch.channelVolume = Math.min(
                    64,
                    Math.max(
                        0,
                        ch.channelVolume +
                            this.getSlideAmount(
                                ch.oldChannelVolumeSlide,
                                firstTick
                            )
                    )
                );
                break;
            }

            case ImpulseTrackerEffects.sampleOffset: {
                if (triggerNote) {
                    this.sampleOffset(ch, param);
                }
                break;
            }

            case ImpulseTrackerEffects.panningSlide: {
                if (param) {
                    ch.oldPanningSlide = param;
                }
                const slide = -this.getSlideAmount(
                    ch.oldPanningSlide,
                    firstTick
                );
                if (slide) {
                    ch.panning = Math.min(
                        256,
                        Math.max(0, ch.panning + slide * 4)
                    );
                    ch.restorePanning = 0;
                }
                break;
            }

            case ImpulseTrackerEffects.retrigger: {
                if (param) {
                    ch.retriggerParam = param;
                }
                this.retriggerNote(ch, ch.retriggerParam);
                break;
            }

            case ImpulseTrackerEffects.tremolo: {
                if (param & 0x0f) {
                    ch.tremoloDepth = (param & 0x0f) << 2;
                }
                if (param & 0xf0) {
                    ch.tremoloSpeed = param >> 4;
                }
                ch.tremoloActive = true;
                break;
            }

            case ImpulseTrackerEffects.extended: {
                this.extendedEffect(ch, param);
                break;
            }

            case ImpulseTrackerEffects.tempo: {
                param = this.getExtendedParameter(ch, param, 1).value;
                if (param) {
                    ch.oldTempo = param;
                } else {
                    param = ch.oldTempo;
                }
                if (param >= 0x20) {
                    if (firstTick) {
                        this.tempo = Math.min(255, param);
                    }
                } else if (!firstTick) {
                    // Tempo slide
                    const change = param & 0x0f;
                    this.tempo = Math.min(
                        255,
                        Math.max(
                            32,
                            this.tempo +
                                ((param & 0xf0) === 0x10 ? change : -change)
                        )
                    );
                }
                break;
            }

            case ImpulseTrackerEffects.globalVolume: {
                if (firstTick && param <= 0x80) {
                    this.globalVolume = param / 2;
                }
                break;
            }

            case ImpulseTrackerEffects.globalVolumeSlide: {
                if (param) {
                    ch.oldGlobalVolumeSlide = param;
                }
                // The global volume is stored halved
                this.globalVolume = Math.min(
                    64,
                    Math.max(
                        0,
                        this.globalVolume +
                            this.getSlideAmount(
                                ch.oldGlobalVolumeSlide,
                                firstTick
                            ) /
                                2
                    )
                );
                break;
            }

            case ImpulseTrackerEffects.panning: {
                if (firstTick) {
                    this.setPanning(ch, param);
                }
                break;
            }

            case ImpulseTrackerEffects.panbrello: {
                if (param & 0x0f) {
                    ch.panbrelloDepth = param & 0x0f;
                }
                if (param & 0xf0) {
                    ch.panbrelloSpeed = param >> 4;
                }
                break;
            }
        }
        if (ch.rowInstrument) {
            ch.oldInstrument = ch.rowInstrument;
        }
    }

    /**
     * Gets the amount of a Dxy style slide (volume, channel volume, panning and global volume slides).
     * @param param The effect parameter. The high nibble slides up, the low nibble slides down.
     * F in the other nibble is a fine slide, which only applies on the first tick.
     * @param firstTick If this is the first tick of the row.
     * @returns The amount to add on this tick.
     */
    private getSlideAmount(param: number, firstTick: boolean) {
        const up = param >> 4;
        const down = param & 0x0f;
        if (down === 0x0f && up) {
            return firstTick ? up : 0;
        }
        if (up === 0x0f && down) {
            return firstTick ? -down : 0;
        }
        if (firstTick) {
            return 0;
        }
        if (up === 0) {
            return -down;
        }
        // Impulse Tracker ignores slides with both nibbles set
        return down === 0 ? up : 0;
    }

    /**
     * Processes a volume slide (Dxy and the volume column slides).
     * @param ch The channel.
     * @param param The parameter, zero uses the memory (for the effect column).
     * @param volumeColumn If the slide comes from the volume column, which has its own memory.
     */
    private volumeSlide(
        ch: ImpulseTrackerChannel,
        param: number,
        volumeColumn: boolean
    ) {
        if (!volumeColumn) {
            if (param) {
                ch.oldVolumeSlide = param;
            } else {
                param = ch.oldVolumeSlide;
            }
        }
        let volume = ch.volume;
        if ((param & 0x0f) === 0x0f) {
            if (param & 0xf0) {
                this.fineVolume(ch, param >> 4, 1, false);
                return;
            } else if (ch.isFirstTick) {
                volume -= 0x0f;
            }
        } else if ((param & 0xf0) === 0xf0) {
            if (param & 0x0f) {
                this.fineVolume(ch, param & 0x0f, -1, false);
                return;
            } else if (ch.isFirstTick) {
                volume += 0x0f;
            }
        }
        if (!ch.isFirstTick) {
            if (param & 0x0f) {
                if ((param & 0xf0) === 0) {
                    volume -= param & 0x0f;
                }
            } else {
                volume += param >> 4;
            }
        }
        ch.volume = Math.min(64, Math.max(0, volume));
    }

    /**
     * Processes a fine volume slide, only on the first tick.
     * @param ch The channel.
     * @param param The amount, zero uses the memory.
     * @param direction 1 for up, -1 for down.
     * @param volumeColumn If the slide comes from the volume column, which has its own memory.
     */
    private fineVolume(
        ch: ImpulseTrackerChannel,
        param: number,
        direction: number,
        volumeColumn: boolean
    ) {
        if (volumeColumn) {
            if (param) {
                ch.oldVolumeColumn = param;
            } else {
                param = ch.oldVolumeColumn;
            }
        } else if (param) {
            ch.oldFineVolume = param;
        } else {
            param = ch.oldFineVolume;
        }
        if (ch.isFirstTick) {
            ch.volume = Math.min(
                64,
                Math.max(0, ch.volume + direction * param)
            );
        }
    }

    /**
     * Sets the panning, cancelling surround, panning variation and panbrello.
     * @param ch The channel.
     * @param panning The panning (0-256).
     */
    private setPanning(ch: ImpulseTrackerChannel, panning: number) {
        ch.surround = false;
        ch.panning = panning;
        ch.restorePanning = 0;
        ch.panningSwing = 0;
        ch.panbrelloOffset = 0;
    }

    /**
     * Sets the vibrato speed and depth, keeping the previous values for zero nibbles.
     * @param ch The channel.
     * @param param The speed (high nibble) and the depth (low nibble).
     * @param depthScale The multiplier of the depth (4 for regular, 1 for fine vibrato).
     */
    private setVibrato(
        ch: ImpulseTrackerChannel,
        param: number,
        depthScale: number
    ) {
        if (param & 0x0f) {
            ch.vibratoDepth = (param & 0x0f) * depthScale;
        }
        if (param & 0xf0) {
            ch.vibratoSpeed = param >> 4;
        }
        ch.vibratoActive = true;
    }

    /**
     * Applies the vibrato to a frequency.
     * @param ch The channel.
     * @param frequency The frequency.
     * @param firstTick If this is the first tick of the row.
     * @returns The frequency with the vibrato.
     */
    private applyVibrato(
        ch: ImpulseTrackerChannel,
        frequency: number,
        firstTick: boolean
    ) {
        if (!ch.vibratoActive) {
            return frequency;
        }
        if (!firstTick || !this.oldEffects) {
            ch.vibratoPos = (ch.vibratoPos + 4 * ch.vibratoSpeed) & 0xff;
        }
        let delta = this.getWaveform(ch.vibratoType, ch.vibratoPos);
        let shift = 5;
        if (!this.oldEffects) {
            // Old effects have twice the depth and the opposite direction
            shift = 6;
            delta = -delta;
        }
        delta = Math.trunc((-delta * ch.vibratoDepth) / (1 << shift));
        return this.slideFrequency(ch, frequency, delta);
    }

    /**
     * Slides a frequency in Impulse Tracker units (1/64 semitone for linear slides).
     * @param ch The channel.
     * @param frequency The frequency.
     * @param amount The slide amount, positive slides up.
     * @param tonePortamento If the slide is a tone portamento.
     * @returns The new frequency.
     */
    private slideFrequency(
        ch: ImpulseTrackerChannel,
        frequency: number,
        amount: number,
        tonePortamento = false
    ) {
        if (!frequency || !amount) {
            return frequency;
        }
        if (this.linearSlides) {
            let absolute = Math.abs(amount);
            if (absolute >= 16) {
                // Impulse Tracker uses either the fine or the regular table
                absolute = Math.trunc(absolute / 4) * 4;
            }
            frequency *= Math.pow(2, (Math.sign(amount) * absolute) / 768);
        } else if (amount < 0) {
            frequency =
                (AMIGA_CONSTANT * frequency) /
                (frequency * -amount + AMIGA_CONSTANT);
        } else {
            const divisor = AMIGA_CONSTANT - frequency * amount;
            if (divisor <= 0) {
                if (tonePortamento) {
                    return 0x7f_ff_ff_ff;
                }
                // Sliding beyond the highest frequency stops the note
                ch.fadeout = 0;
                ch.noteFade = true;
                return 0;
            }
            frequency = (AMIGA_CONSTANT * frequency) / divisor;
        }
        return Math.max(1, frequency);
    }

    /**
     * Processes the portamento up and down, including the fine (xFx) and extra fine (xEx) variants.
     * @param ch The channel.
     * @param param The effect parameter, the memory is used instead.
     * @param direction 1 for up, -1 for down.
     * @param regularOnly True for the volume column, which has no fine slides.
     */
    private portamento(
        ch: ImpulseTrackerChannel,
        param: number,
        direction: number,
        regularOnly: boolean
    ) {
        void param;
        param = ch.oldPortamento;
        if (!regularOnly && param >= 0xe0) {
            if (param & 0x0f && ch.isFirstTick && ch.period) {
                const fine = param & 0x0f;
                ch.period = this.slideFrequency(
                    ch,
                    ch.period,
                    direction * ((param & 0xf0) === 0xf0 ? fine * 4 : fine)
                );
            }
            return;
        }
        if (!ch.isFirstTick) {
            ch.period = this.slideFrequency(
                ch,
                ch.period,
                direction * param * 4
            );
        }
    }

    /**
     * Initializes the tone portamento memory.
     * @param ch The channel.
     * @param param The speed, zero uses the memory.
     */
    private initTonePortamento(ch: ImpulseTrackerChannel, param: number) {
        if (!this.compatibleGxx) {
            // Shared with the portamento up and down
            if (param === 0) {
                param = ch.oldPortamento;
            }
            ch.oldPortamento = param;
        }
        if (param) {
            ch.portamentoSlide = param;
        }
    }

    /**
     * Processes the tone portamento.
     * @param ch The channel.
     * @param param The parameter, the memory was initialized with it already.
     */
    private tonePortamento(ch: ImpulseTrackerChannel, param: number) {
        void param;
        ch.portamentoActive = true;
        const delta = ch.portamentoSlide * 4;
        if (ch.period && ch.portamentoTarget && !ch.isFirstTick) {
            if (
                !delta &&
                ch.rowEffect === ImpulseTrackerEffects.tonePortamentoVolumeSlide
            ) {
                // Lxx without a speed always goes down
                if (ch.period > 1 && this.linearSlides) {
                    ch.period--;
                }
                if (ch.period < ch.portamentoTarget) {
                    ch.period = ch.portamentoTarget;
                }
            } else if (ch.period < ch.portamentoTarget) {
                ch.period = Math.min(
                    ch.portamentoTarget,
                    this.slideFrequency(ch, ch.period, delta, true)
                );
            } else if (ch.period > ch.portamentoTarget) {
                ch.period = Math.max(
                    ch.portamentoTarget,
                    this.slideFrequency(ch, ch.period, -delta, true)
                );
            }
        }
        if (ch.period === ch.portamentoTarget) {
            ch.portamentoTarget = 0;
        }
    }

    /**
     * Processes a sample offset (Oxx, with SAx and extended parameters).
     * @param ch The channel.
     * @param param The effect parameter.
     */
    private sampleOffset(ch: ImpulseTrackerChannel, param: number) {
        const extended = this.getExtendedParameter(ch, param, 2);
        let offset: number;
        if (extended.count) {
            offset = extended.value;
        } else {
            offset = param << 8;
            if (offset) {
                ch.oldOffset = offset;
            } else {
                offset = ch.oldOffset;
            }
            offset += ch.oldHighOffset * 65_536;
        }
        const note = ch.rowInstrument ? ch.newNote : ch.rowNote;
        if (!isNote(note) || !ch.sample) {
            return;
        }
        if (ch.instrument && ch.instrument.sampleMap[note - 1] < 0) {
            return;
        }
        const sample = ch.sample;
        const loopEnd = ch.sustainLoop
            ? (sample.sustainLoopEnd ?? 0)
            : sample.loopEnd;
        const looped =
            (ch.sustainLoop ? sample.sustainLoopType : sample.loopType) !==
            TrackerLoopTypes.none;
        if (offset >= sample.data.length || (looped && offset >= loopEnd)) {
            // Old effects clip the offset to the end, otherwise it restarts the sample
            offset = this.oldEffects ? sample.data.length : 0;
        }
        this.setSamplePosition(ch, offset);
    }

    /**
     * Sets the playback position of the channel's sample and restarts it there.
     * @param ch The channel.
     * @param position The position in the sample.
     */
    private setSamplePosition(ch: ImpulseTrackerChannel, position: number) {
        if (!ch.sample) {
            return;
        }
        const offset =
            position >= ch.sample.data.length
                ? Infinity
                : this.sampleBank.fromSource(ch.preset, position, ch.reverse);
        ch.sampleOffset = offset;
        if (!ch.trigger && ch.playing) {
            // Jump within the playing note (an offset next to a portamento)
            ch.trigger = true;
        }
        if (ch.trigger) {
            ch.samplePosition = offset === Infinity ? 0 : offset;
        }
    }

    /**
     * Restarts the playing sample from a position, keeping the pitch and the volume.
     * @param ch The channel.
     * @param position The position in the sample.
     */
    private retrigger(ch: ImpulseTrackerChannel, position: number) {
        ch.trigger = true;
        ch.samplePosition = 0;
        this.setSamplePosition(ch, position);
    }

    /**
     * Gets the sound bank variant a channel's sample should play with.
     * @param ch The channel.
     */
    private getVariant(ch: ImpulseTrackerChannel): TrackerSampleVariant {
        if (ch.reverse) {
            return TrackerSampleVariants.reverse;
        }
        const sample = ch.sample;
        if (
            sample?.sustainLoopType !== undefined &&
            sample.sustainLoopType !== TrackerLoopTypes.none &&
            !ch.sustainLoop
        ) {
            return TrackerSampleVariants.release;
        }
        return TrackerSampleVariants.normal;
    }

    /**
     * Switches the playing sample to the variant the channel's state needs, continuing from the same position.
     * @param ch The channel.
     */
    private updateVariant(ch: ImpulseTrackerChannel) {
        if (ch.sampleIndex < 0 || !ch.sample || ch.sample === EMPTY_SAMPLE) {
            return;
        }
        const preset = this.sampleBank.getPreset(
            ch.sampleIndex,
            this.getVariant(ch)
        );
        if (preset === ch.preset) {
            return;
        }
        if (!ch.playing || ch.trigger) {
            ch.preset = preset;
            return;
        }
        const source = this.sampleBank.toSource(ch.preset, ch.samplePosition);
        ch.preset = preset;
        ch.sampleOffset = this.sampleBank.fromSource(
            preset,
            source.position,
            ch.reverse
        );
        ch.samplePosition = ch.sampleOffset;
        ch.trigger = true;
    }

    /**
     * Releases the key of a channel (note off).
     * @param ch The channel.
     */
    private keyOff(ch: ImpulseTrackerChannel) {
        const keyWasOn = !ch.keyOff;
        ch.keyOff = true;
        if (ch.instrument && !ch.volumeEnvelopeState.enabled) {
            ch.noteFade = true;
        }
        if (!ch.playing) {
            return;
        }
        if (ch.sustainLoop && ch.sample && keyWasOn) {
            // The sample continues with its regular loop
            ch.sustainLoop = false;
            if (ch.sample.loopType !== TrackerLoopTypes.pingPong) {
                ch.reverse = false;
            }
            this.updateVariant(ch);
        }
        const instrument = ch.instrument;
        if (
            instrument &&
            instrument.volumeEnvelope.loopEnd >= 0 &&
            instrument.fadeout
        ) {
            ch.noteFade = true;
        }
    }

    /**
     * Cuts the note on a tick (SCx).
     * @param ch The channel.
     * @param tick The tick to cut the note on.
     */
    private noteCut(ch: ImpulseTrackerChannel, tick: number) {
        let tickCount = this.rowTick;
        if (isNote(ch.rowNote) && this.isTonePortamento(ch)) {
            // A note cut next to a tone portamento only applies in the repetitions of a row delay
            const rowLength = this.speed + this.frameDelay;
            if (tickCount < rowLength) {
                return;
            }
            tickCount %= rowLength;
        }
        if (tickCount === tick) {
            this.stopSample(ch);
            ch.active = false;
            ch.period = 0;
            ch.fadeout = 0;
            ch.noteFade = true;
        }
    }

    /**
     * Checks if the row of a channel has a tone portamento.
     * @param ch The channel.
     */
    private isTonePortamento(ch: ImpulseTrackerChannel) {
        return (
            ch.rowEffect === ImpulseTrackerEffects.tonePortamento ||
            ch.rowEffect === ImpulseTrackerEffects.tonePortamentoVolumeSlide ||
            decodeVolume(ch.rowVolume)[0] === VolumeCommands.tonePortamento
        );
    }

    /**
     * Stops the sample of a channel.
     * @param ch The channel.
     */
    private stopSample(ch: ImpulseTrackerChannel) {
        if (ch.playing || ch.trigger) {
            ch.stop = true;
        }
        ch.trigger = false;
        ch.samplePosition = Infinity;
    }

    /**
     * Restores the panning and filter changed by the previous note (instrument panning, random variation).
     * @param ch The channel.
     */
    private restorePanningAndFilter(ch: ImpulseTrackerChannel) {
        if (ch.restorePanning > 0) {
            ch.panning = (ch.restorePanning & 0x7f_ff) - 1;
            if (ch.restorePanning & 0x80_00) {
                ch.surround = true;
            }
            ch.restorePanning = 0;
        }
        if (ch.restoreResonance > 0) {
            ch.resonance = ch.restoreResonance - 1;
            ch.restoreResonance = 0;
        }
        if (ch.restoreCutoff > 0) {
            ch.cutoff = ch.restoreCutoff - 1;
            ch.restoreCutoff = 0;
        }
    }

    /**
     * Applies the default panning of the instrument and the sample, for this note only.
     * @param ch The channel.
     * @param instrument The instrument.
     * @param sample The sample.
     */
    private applyInstrumentPanning(
        ch: ImpulseTrackerChannel,
        instrument: ImpulseTrackerInstrument | undefined,
        sample: ImpulseTrackerSample | undefined
    ) {
        let panning = instrument?.panning ?? -1;
        if (sample && sample.panning >= 0) {
            panning = sample.panning;
        }
        if (panning < 0) {
            return;
        }
        // Instrument and sample panning do not override the channel panning
        ch.restorePanning = (ch.panning + 1) | (ch.surround ? 0x80_00 : 0);
        ch.panning = panning;
        ch.surround = false;
    }

    /**
     * Changes the instrument of a channel. A port of OpenMPT's InstrumentChange for Impulse Tracker.
     * @param ch The channel.
     * @param instrumentNumber The one-based instrument (or sample) number.
     * @param porta If there is a tone portamento.
     * @param updateVolume If the volume is reset to the sample's default.
     * @param resetEnvelopes If the envelopes may be reset.
     */
    private instrumentChange(
        ch: ImpulseTrackerChannel,
        instrumentNumber: number,
        porta: boolean,
        updateVolume: boolean,
        resetEnvelopes: boolean
    ) {
        const instrument = this.instrumentMode
            ? this.itInstruments[instrumentNumber - 1]
            : undefined;
        let sampleIndex = this.instrumentMode ? -1 : instrumentNumber - 1;
        let sample: ImpulseTrackerSample | undefined = this.instrumentMode
            ? undefined
            : this.getSample(sampleIndex);
        const oldInstrumentVolume = ch.instrumentVolume;
        const note = ch.newNote;
        if (note === NOTE_NONE) {
            return;
        }
        if (instrument && isNote(note)) {
            if (instrument.sampleMap[note - 1] < 0) {
                // Impulse Tracker ignores empty slots
                ch.instrument = instrument;
                ch.instrumentIndex = instrumentNumber - 1;
                return;
            }
            sampleIndex = instrument.sampleMap[note - 1];
            sample = this.getSample(sampleIndex);
        } else if (this.instrumentMode) {
            if (note >= NOTE_FADE) {
                return;
            }
            ch.instrument = undefined;
            ch.instrumentIndex = -1;
            ch.newInstrument = 0;
            return;
        }

        let instrumentChanged = instrument !== ch.instrument;
        const sampleChanged = ch.sample !== undefined && sample !== ch.sample;
        let returnAfterVolume = false;
        if (sampleChanged && porta) {
            // No sample change during a portamento with Compatible Gxx
            if (this.compatibleGxx && ch.active) {
                sample = ch.sample;
                sampleIndex = ch.sampleIndex;
            }
            if (!this.instrumentMode) {
                // Resets the filter
                ch.triggered = true;
            }
        }
        if (
            this.instrumentMode &&
            !instrumentChanged &&
            sampleChanged &&
            ch.sample &&
            !isNote(ch.rowNote)
        ) {
            // A lone instrument number keeps the sample but takes the properties of the new one
            returnAfterVolume = true;
        }
        if (!ch.active) {
            // Envelopes are picked up again after a note cut
            instrumentChanged = true;
        }
        ch.instrument = instrument;
        ch.instrumentIndex = instrument ? instrumentNumber - 1 : -1;

        if (updateVolume) {
            ch.volume = sample ? sample.volume : 0;
        }
        if (returnAfterVolume) {
            return;
        }
        ch.newInstrument = 0;
        if (instrument && instrumentChanged) {
            ch.newNoteAction = instrument.newNoteAction;
        }
        ch.instrumentVolume = Math.trunc(
            ((sample ? sample.globalVolume : 64) *
                (instrument?.globalVolume ?? 64)) /
                64
        );

        if (resetEnvelopes) {
            const hasNumber = instrumentNumber !== 0;
            const reset =
                !ch.playing ||
                (hasNumber && porta && this.compatibleGxx) ||
                (hasNumber &&
                    !porta &&
                    (ch.noteFade || ch.keyOff) &&
                    this.oldEffects);
            const resetAlways =
                !ch.fadeout || instrumentChanged || !isNote(ch.rowNote);
            if (reset) {
                if (instrument) {
                    if (resetAlways) {
                        ch.resetEnvelopes();
                    } else {
                        // Envelope carry
                        const carryReset = porta && this.compatibleGxx;
                        const last = this.lastMovedVoice;
                        const resetEnvelope = (
                            envelope: TrackerEnvelope,
                            state: ImpulseTrackerEnvelopeState,
                            lastState?: ImpulseTrackerEnvelopeState
                        ) => {
                            if (!envelope.carry) {
                                state.position = 0;
                            } else if (carryReset) {
                                state.position = lastState?.position ?? 0;
                            }
                        };
                        resetEnvelope(
                            instrument.volumeEnvelope,
                            ch.volumeEnvelopeState,
                            last?.volumeEnvelopeState
                        );
                        resetEnvelope(
                            instrument.panningEnvelope,
                            ch.panningEnvelopeState,
                            last?.panningEnvelopeState
                        );
                        resetEnvelope(
                            instrument.pitchEnvelope,
                            ch.pitchEnvelopeState,
                            last?.pitchEnvelopeState
                        );
                    }
                }
            } else if (instrument && !instrument.volumeEnvelope.enabled) {
                ch.volumeEnvelopeState.position = 0;
            }
        }

        if (!sample) {
            ch.sample = undefined;
            ch.sampleIndex = -1;
            ch.instrumentVolume = 0;
            return;
        }

        const wasKeyOff = ch.keyOff;
        if (porta && sample === ch.sample) {
            if (instrumentChanged && instrument) {
                ch.keyOff = false;
                ch.noteFade = false;
            }
            if (ch.playing) {
                return;
            }
            ch.keyOff = false;
            ch.noteFade = false;
        } else {
            ch.keyOff = false;
            ch.noteFade = false;
            if (sample !== ch.sample || instrumentChanged) {
                ch.reverse = false;
            }
            if (instrument) {
                ch.volumeEnvelopeState.enabled =
                    instrument.volumeEnvelope.enabled;
                ch.panningEnvelopeState.enabled =
                    instrument.panningEnvelope.enabled;
                ch.pitchEnvelopeState.enabled =
                    instrument.pitchEnvelope.enabled;
                if (instrument.cutoff >= 0) {
                    ch.cutoff = instrument.cutoff;
                }
                if (instrument.resonance >= 0) {
                    ch.resonance = instrument.resonance;
                }
            }
        }

        if (ch.rowNote === NOTE_OFF && this.oldEffects && sampleChanged) {
            // A note off with an instrument number keeps the previous sample playing
            ch.instrumentVolume = oldInstrumentVolume;
            ch.volume = sample.volume;
            if (sample.panning >= 0) {
                ch.restorePanning = ch.panning + 1;
                ch.panning = sample.panning;
            }
            return;
        }

        const changed = sample !== ch.sample;
        ch.sample = sample;
        ch.sampleIndex = sample === EMPTY_SAMPLE ? -1 : sampleIndex;
        // The sustain loop is not restarted by a portamento after a key off
        ch.sustainLoop =
            sample.sustainLoopType !== undefined &&
            sample.sustainLoopType !== TrackerLoopTypes.none &&
            (!porta || (instrument !== undefined && !wasKeyOff));
        ch.autoVibratoDepth = 0;
        ch.autoVibratoPos = 0;
        ch.finetune = sample.middleCRate;
        ch.portamentoTarget = 0;
        if (changed && ch.playing && !ch.trigger) {
            // The new sample continues at the position of the old one
            ch.preset = this.sampleBank.getPreset(
                ch.sampleIndex,
                this.getVariant(ch)
            );
            this.retrigger(
                ch,
                this.sampleBank.toSource(ch.preset, ch.samplePosition).position
            );
        } else {
            this.updateVariant(ch);
        }
    }

    /**
     * Starts a note (or changes the portamento target). A port of OpenMPT's NoteChange for Impulse Tracker.
     * @param ch The channel.
     * @param note The one-based note or a special note.
     * @param porta If there is a tone portamento.
     * @param resetEnvelopes If the envelopes and the random variations are reset.
     */
    private noteChange(
        ch: ImpulseTrackerChannel,
        note: number,
        porta: boolean,
        resetEnvelopes: boolean
    ) {
        if (note === NOTE_NONE) {
            return;
        }
        const patternNote = note;
        let sample = ch.sample;
        let sampleIndex = ch.sampleIndex;
        const instrument = ch.instrument;
        if (instrument && isNote(note)) {
            const mapped = instrument.sampleMap[note - 1];
            if (mapped < 0) {
                // Impulse Tracker ignores empty slots
                return;
            }
            sampleIndex = mapped;
            sample = this.getSample(mapped);
            note = instrument.noteMap[note - 1] + 1;
        }

        if (!isNote(note)) {
            if (note === NOTE_OFF) {
                this.keyOff(ch);
                // A note off with an instrument releases the sustain loop but not the envelopes
                if (!porta && this.oldEffects && ch.rowInstrument) {
                    ch.noteFade = false;
                    ch.keyOff = false;
                }
            } else if (this.instrumentMode) {
                ch.noteFade = true;
            }
            if (note === NOTE_CUT) {
                ch.noteFade = true;
                ch.fadeout = 0;
                this.stopSample(ch);
                ch.active = false;
            }
            ch.note = NOTE_NONE;
            ch.newNote = NOTE_NONE;
            return;
        }

        if (!porta && sample) {
            ch.finetune = sample.middleCRate;
        }
        if (porta && !ch.active) {
            // A portamento without a playing note starts the note
            porta = false;
        }
        ch.note = patternNote;
        ch.newInstrument = 0;
        const frequency = this.noteToPeriod(note, ch);
        ch.panbrelloOffset = 0;
        this.applyInstrumentPanning(ch, instrument, sample);
        if (instrument?.pitchPanSeparation) {
            if (!ch.restorePanning) {
                ch.restorePanning = ch.panning + 1;
            }
            ch.panning = Math.min(
                256,
                Math.max(
                    0,
                    ch.panning +
                        Math.trunc(
                            ((patternNote - 1 - instrument.pitchPanCenter) *
                                instrument.pitchPanSeparation) /
                                2
                        )
                )
            );
        }
        if (resetEnvelopes && !porta) {
            ch.volumeSwing = 0;
            ch.panningSwing = 0;
            ch.cutoffSwing = 0;
            ch.resonanceSwing = 0;
            if (instrument) {
                ch.newNoteAction = instrument.newNoteAction;
                if (!instrument.volumeEnvelope.carry) {
                    ch.volumeEnvelopeState.position = 0;
                }
                if (!instrument.panningEnvelope.carry) {
                    ch.panningEnvelopeState.position = 0;
                }
                if (!instrument.pitchEnvelope.carry) {
                    ch.pitchEnvelopeState.position = 0;
                }
                if (instrument.volumeSwing) {
                    ch.volumeSwing = Math.trunc(
                        ((Math.trunc(
                            (this.randomInt8() * instrument.volumeSwing) / 64
                        ) +
                            1) *
                            ch.instrumentVolume) /
                            199
                    );
                }
                if (instrument.panningSwing) {
                    ch.panningSwing = Math.trunc(
                        (this.randomInt8() * instrument.panningSwing * 4) / 128
                    );
                }
                if (instrument.cutoffSwing) {
                    const d = Math.trunc(
                        (instrument.cutoffSwing * (this.randomInt8() + 1)) / 128
                    );
                    ch.cutoffSwing = Math.trunc((d * ch.cutoff + 1) / 128);
                    ch.restoreCutoff = ch.cutoff + 1;
                }
                if (instrument.resonanceSwing) {
                    const d = Math.trunc(
                        (instrument.resonanceSwing * (this.randomInt8() + 1)) /
                            128
                    );
                    ch.resonanceSwing = Math.trunc(
                        (d * ch.resonance + 1) / 128
                    );
                    ch.restoreResonance = ch.resonance + 1;
                }
            }
        }
        if (!sample) {
            return;
        }

        if (!porta || !ch.period) {
            ch.period = frequency;
        }
        ch.portamentoTarget = porta ? frequency : 0;
        if (!porta || !ch.playing) {
            ch.sample = sample;
            ch.sampleIndex = sample === EMPTY_SAMPLE ? -1 : sampleIndex;
            ch.sustainLoop =
                sample.sustainLoopType !== undefined &&
                sample.sustainLoopType !== TrackerLoopTypes.none;
            ch.portamentoActive = false;
            if (ch.vibratoType < 4) {
                ch.vibratoPos = 0;
            }
            ch.preset =
                ch.sampleIndex < 0
                    ? -1
                    : this.sampleBank.getPreset(
                          ch.sampleIndex,
                          this.getVariant(ch)
                      );
            ch.trigger = true;
            ch.stop = false;
            ch.samplePosition = 0;
            // Reversed playback starts from the end
            this.setSamplePosition(
                ch,
                ch.reverse ? Math.max(0, sample.data.length - 1) : 0
            );
        }

        if (
            !porta ||
            (ch.noteFade && !ch.fadeout) ||
            (this.compatibleGxx && ch.rowInstrument)
        ) {
            if (ch.noteFade && !ch.fadeout) {
                ch.resetEnvelopes();
                ch.noteFade = false;
                ch.fadeout = 65_536;
            }
            if (!porta || !this.compatibleGxx || ch.rowInstrument) {
                ch.noteFade = false;
                ch.fadeout = 65_536;
            }
        }
        // Portamentos only reset the key off with Compatible Gxx and an instrument number
        if (!porta || (this.compatibleGxx && ch.rowInstrument)) {
            ch.keyOff = false;
        }
        if (!porta) {
            ch.triggered = true;
            ch.filterEnabled = false;
            if (resetEnvelopes) {
                ch.autoVibratoDepth = 0;
                ch.autoVibratoPos = 0;
            }
        }
    }

    /**
     * Applies the duplicate checks and the new note action before a new note.
     * A port of OpenMPT's CheckNNA for Impulse Tracker.
     * @param ch The channel.
     * @param instrumentNumber The one-based instrument number of the new note, 0 if none.
     * @param note The one-based note.
     * @param forceCut If the previous note is always cut (retrigger).
     */
    private checkNNA(
        ch: ImpulseTrackerChannel,
        instrumentNumber: number,
        note: number,
        forceCut: boolean
    ) {
        if (!isNote(note)) {
            return;
        }
        if (!this.instrumentMode || forceCut) {
            if (ch.playing) {
                this.stopSample(ch);
            }
            return;
        }
        let instrument = ch.instrument;
        if (instrumentNumber > 0) {
            instrument = this.itInstruments[instrumentNumber - 1];
        }
        let sample = ch.sample;
        if (instrument) {
            const mapped = instrument.sampleMap[note - 1];
            if (mapped < 0) {
                // Impulse Tracker ignores empty slots
                return;
            }
            sample = this.getSample(mapped);
        }

        // Duplicate checks, on this channel and its background voices
        const voices = [
            ch,
            ...this.backgroundVoices.filter((v) => v.index === ch.index)
        ] as ImpulseTrackerChannel[];
        for (const voice of voices) {
            const voiceInstrument = voice.instrument;
            if (!voiceInstrument) {
                continue;
            }
            let duplicate = false;
            switch (voiceInstrument.duplicateCheckType) {
                default: {
                    break;
                }

                case 1: {
                    duplicate =
                        voice.note === note && instrument === voiceInstrument;
                    break;
                }

                case 2: {
                    duplicate =
                        sample !== undefined &&
                        sample === voice.sample &&
                        instrument === voiceInstrument;
                    break;
                }

                case 3: {
                    duplicate = instrument === voiceInstrument;
                    break;
                }
            }
            if (!duplicate) {
                continue;
            }
            switch (voiceInstrument.duplicateCheckAction) {
                default: {
                    this.keyOff(voice);
                    voice.volume = 0;
                    break;
                }

                case 1: {
                    this.keyOff(voice);
                    break;
                }

                case 2: {
                    voice.noteFade = true;
                    break;
                }
            }
            if (!voice.volume) {
                voice.fadeout = 0;
                voice.noteFade = true;
            }
        }

        if (!ch.active) {
            return;
        }
        if (ch.newNoteAction === NoteActions.cut) {
            this.stopSample(ch);
            return;
        }
        const voice = this.moveToBackground(ch) as
            ImpulseTrackerChannel | undefined;
        ch.samplePosition = Infinity;
        if (!voice) {
            return;
        }
        voice.vibratoActive = false;
        voice.tremoloActive = false;
        voice.portamentoActive = false;
        voice.panbrelloOffset = 0;
        voice.command = 0;
        voice.triggered = false;
        if (ch.instrument === instrument) {
            this.lastMovedVoice = voice;
        }
        switch (ch.newNoteAction) {
            default: {
                break;
            }

            case NoteActions.noteOff: {
                this.keyOff(voice);
                break;
            }

            case NoteActions.noteFade: {
                voice.noteFade = true;
                break;
            }
        }
        if (!voice.volume) {
            voice.fadeout = 0;
            voice.noteFade = true;
        }
    }

    /**
     * Processes the retrigger effect (Qxy).
     * @param ch The channel.
     * @param param The parameter (volume change in the high nibble, interval in the low nibble).
     */
    private retriggerNote(ch: ImpulseTrackerChannel, param: number) {
        let doRetrigger = false;
        if (this.rowTick === 0 && ch.rowNote) {
            ch.retriggerCount = param & 0x0f;
        } else if (!ch.retriggerCount || !--ch.retriggerCount) {
            ch.retriggerCount = param & 0x0f;
            doRetrigger = true;
        }
        if ((!ch.playing && !this.retriggerStoppedSamples) || !doRetrigger) {
            return;
        }
        const change = param >> 4;
        let volume = ch.volume * 4;
        if (change) {
            volume = RETRIGGER_MULTIPLIERS[change]
                ? Math.trunc((volume * RETRIGGER_MULTIPLIERS[change]) / 16)
                : volume + RETRIGGER_OFFSETS[change] * 4;
            volume = Math.min(256, Math.max(0, volume));
        }
        const note = ch.newNote;
        const oldPeriod = ch.period;
        if (isNote(note)) {
            this.checkNNA(ch, 0, note, true);
        }
        this.noteChange(ch, note, true, false);
        ch.volume = volume / 4;
        if (this.instrumentMode) {
            // The retriggered note counts as a note on this row
            ch.rowNote = note;
        } else if (ch.rowNote === NOTE_NONE && oldPeriod) {
            ch.period = oldPeriod;
        }
        this.retrigger(ch, 0);
    }

    /**
     * Processes an extended effect (Sxy).
     * @param ch The channel.
     * @param param The effect parameter, with the memory applied.
     */
    private extendedEffect(ch: ImpulseTrackerChannel, param: number) {
        const value = param & 0x0f;
        const firstTick = this.tick === 0;
        switch (param >> 4) {
            default: {
                break;
            }

            case ImpulseTrackerExtendedEffects.glissando: {
                ch.glissando = value !== 0;
                break;
            }

            case ImpulseTrackerExtendedEffects.finetune: {
                if (firstTick) {
                    ch.finetune = FINETUNE_RATES[value];
                    if (ch.period && isNote(ch.note)) {
                        const mapped = ch.instrument
                            ? ch.instrument.noteMap[ch.note - 1] + 1
                            : ch.note;
                        ch.period = this.noteToPeriod(mapped, ch);
                    }
                }
                break;
            }

            case ImpulseTrackerExtendedEffects.vibratoWaveform: {
                ch.vibratoType = value < 4 ? value : 0;
                break;
            }

            case ImpulseTrackerExtendedEffects.tremoloWaveform: {
                ch.tremoloType = value < 4 ? value : 0;
                break;
            }

            case ImpulseTrackerExtendedEffects.panbrelloWaveform: {
                ch.panbrelloType = value < 4 ? value : 0;
                ch.panbrelloPos = 0;
                break;
            }

            case ImpulseTrackerExtendedEffects.fineRowDelay: {
                // Tick delays of all channels are added up
                if (firstTick && this.rowTick === 0) {
                    this.frameDelay += value;
                }
                break;
            }

            case ImpulseTrackerExtendedEffects.instrumentControl: {
                if (firstTick) {
                    this.instrumentControl(ch, value);
                }
                break;
            }

            case ImpulseTrackerExtendedEffects.panning: {
                if (firstTick) {
                    this.setPanning(ch, Math.trunc((value * 256 + 8) / 15));
                }
                break;
            }

            case ImpulseTrackerExtendedEffects.soundControl: {
                if (firstTick) {
                    this.soundControl(ch, value);
                }
                break;
            }

            case ImpulseTrackerExtendedEffects.highOffset: {
                if (firstTick) {
                    ch.oldHighOffset = value;
                }
                break;
            }

            case ImpulseTrackerExtendedEffects.patternLoop: {
                if (firstTick) {
                    this.patternLoopIT(ch, value);
                }
                break;
            }

            case ImpulseTrackerExtendedEffects.noteCut: {
                // SC0 behaves like SC1
                this.noteCut(ch, value || 1);
                break;
            }

            case ImpulseTrackerExtendedEffects.activeMacro: {
                ch.activeMacro = value;
                break;
            }
        }
    }

    /**
     * Processes a pattern loop (SBx), following Impulse Tracker.
     * @param ch The channel.
     * @param count Zero sets the loop start, other values loop that many times.
     */
    private patternLoopIT(ch: ImpulseTrackerChannel, count: number) {
        if (count === 0) {
            ch.patternLoopRow = this.currentRow;
            return;
        }
        if (ch.patternLoopCount) {
            if (--ch.patternLoopCount === 0) {
                // The next loop starts after this row
                ch.patternLoopRow = this.currentRow + 1;
                return;
            }
        } else {
            ch.patternLoopCount = count;
        }
        this.setPatternLoopTarget(ch.patternLoopRow);
        this.clearPositionJump();
    }

    /**
     * Processes the past note actions, new note action overrides and envelope toggles (S7x).
     * @param ch The channel.
     * @param value The effect value.
     */
    private instrumentControl(ch: ImpulseTrackerChannel, value: number) {
        switch (value) {
            case 0:
            case 1:
            case 2: {
                // Past note actions on the background voices of this channel
                for (const voice of this
                    .backgroundVoices as ImpulseTrackerChannel[]) {
                    if (voice.index !== ch.index) {
                        continue;
                    }
                    if (value === 1) {
                        this.keyOff(voice);
                    } else {
                        voice.noteFade = true;
                        if (value === 0) {
                            voice.fadeout = 0;
                        }
                    }
                }
                break;
            }

            case 3: {
                ch.newNoteAction = NoteActions.cut;
                break;
            }

            case 4: {
                ch.newNoteAction = NoteActions.continue;
                break;
            }

            case 5: {
                ch.newNoteAction = NoteActions.noteOff;
                break;
            }

            case 6: {
                ch.newNoteAction = NoteActions.noteFade;
                break;
            }

            case 7: {
                ch.volumeEnvelopeState.enabled = false;
                break;
            }

            case 8: {
                ch.volumeEnvelopeState.enabled = true;
                break;
            }

            case 9: {
                ch.panningEnvelopeState.enabled = false;
                break;
            }

            case 0xa: {
                ch.panningEnvelopeState.enabled = true;
                break;
            }

            case 0xb: {
                ch.pitchEnvelopeState.enabled = false;
                break;
            }

            case 0xc: {
                ch.pitchEnvelopeState.enabled = true;
                break;
            }

            default: {
                break;
            }
        }
    }

    /**
     * Processes the sound control effects (S9x).
     * @param ch The channel.
     * @param value The effect value.
     */
    private soundControl(ch: ImpulseTrackerChannel, value: number) {
        switch (value) {
            case 0x0: {
                ch.surround = false;
                break;
            }

            case 0x1: {
                ch.surround = true;
                ch.panning = 128;
                break;
            }

            case 0xc: {
                this.openMPTFilterMode = false;
                break;
            }

            case 0xd: {
                this.openMPTFilterMode = true;
                break;
            }

            case 0xe: {
                // Play forwards
                if (ch.reverse) {
                    ch.reverse = false;
                    this.updateVariant(ch);
                }
                break;
            }

            case 0xf: {
                // Play backwards, from the end if the sample just started
                if (ch.reverse || !ch.sample) {
                    break;
                }
                const sample = ch.sample;
                const looped =
                    (ch.sustainLoop
                        ? sample.sustainLoopType
                        : sample.loopType) !== TrackerLoopTypes.none;
                const atStart = ch.trigger
                    ? ch.sampleOffset === 0
                    : ch.samplePosition === 0;
                ch.reverse = true;
                if (atStart && (isNote(ch.rowNote) || !looped)) {
                    ch.preset = this.sampleBank.getPreset(
                        ch.sampleIndex,
                        TrackerSampleVariants.reverse
                    );
                    this.retrigger(ch, Math.max(0, sample.data.length - 1));
                } else {
                    this.updateVariant(ch);
                }
                break;
            }

            default: {
                break;
            }
        }
    }

    /**
     * Advances the position of an envelope by one tick, following the Impulse Tracker loop rules.
     * @param ch The channel.
     * @param state The envelope state.
     * @param envelope The instrument envelope.
     * @param isVolume If this is the volume envelope, which starts the fadeout at its end.
     */
    private incrementEnvelope(
        ch: ImpulseTrackerChannel,
        state: ImpulseTrackerEnvelopeState,
        envelope: TrackerEnvelope,
        isVolume: boolean
    ) {
        const points = envelope.points;
        if (!state.enabled || points.length === 0) {
            return;
        }
        let position = state.position;
        let start: number;
        let end: number;
        let endReached = false;
        // The key off of the previous tick is used
        if (envelope.sustainPoint >= 0 && !ch.previousKeyOff) {
            start = points[envelope.sustainStart].tick;
            end = points[envelope.sustainPoint].tick + 1;
        } else if (envelope.loopEnd >= 0) {
            start = points[envelope.loopStart].tick;
            end = points[envelope.loopEnd].tick + 1;
        } else {
            start = end = points[points.length - 1].tick;
            if (position > end) {
                endReached = true;
            }
        }
        if (position >= end) {
            position = start;
        }
        if (isVolume && endReached) {
            // The end of the volume envelope starts the fadeout, a silent end stops the note
            ch.noteFade = true;
            if (points[points.length - 1].value === 0) {
                ch.fadeout = 0;
            }
        }
        state.position = position + 1;
    }

    /**
     * Sets up the resonant filter of a channel. A port of OpenMPT's SetupChannelFilter.
     * @param ch The channel.
     * @param envelopeModifier The filter envelope value (-256 to 256), 256 without the envelope.
     */
    private setupFilter(ch: ImpulseTrackerChannel, envelopeModifier: number) {
        const cutoff = Math.min(127, Math.max(0, ch.cutoff + ch.cutoffSwing));
        const resonance = Math.min(
            127,
            Math.max(0, ch.resonance + ch.resonanceSwing)
        );
        ch.cutoff = cutoff;
        ch.resonance = resonance;
        ch.cutoffSwing = 0;
        ch.resonanceSwing = 0;
        const computed = Math.trunc((cutoff * (envelopeModifier + 256)) / 256);
        // Impulse Tracker only filters if the cutoff is not full or there is resonance
        if (resonance === 0 && computed >= 254) {
            if (ch.triggered) {
                ch.filterEnabled = false;
            }
            return;
        }
        ch.filterEnabled = true;
        ch.filterCutoffValue = (cutoff * (envelopeModifier + 256)) / 512;
    }

    /**
     * Gets the value of a MIDI macro variable.
     * @param ch The channel.
     * @param variable The variable letter.
     * @param param The Zxx parameter.
     */
    private getMacroVariable(
        ch: ImpulseTrackerChannel,
        variable: string,
        param: number
    ) {
        // The channel volume, global volume and instrument volume of OpenMPT (0-256, 0-256, 0-64, 0-64)
        const volumes =
            this.globalVolume * 4 * ch.channelVolume * ch.instrumentVolume;
        switch (variable) {
            default: {
                return 0;
            }

            case "z": {
                return param;
            }

            case "n": {
                // The last note
                return isNote(ch.lastNote) ? ch.lastNote - 1 : 0;
            }

            case "v": {
                // Velocity
                const volume =
                    ((ch.volume * 4 + ch.volumeSwing) * volumes) / (1 << 20);
                return Math.min(127, Math.max(1, Math.trunc(volume / 2)));
            }

            case "u": {
                // The volume with the envelopes
                const volume =
                    ((ch.volume + ch.volumeDelta) *
                        4 *
                        ch.envelopeVolume *
                        ch.fadeoutVolume *
                        volumes) /
                    (1 << 20);
                return Math.min(127, Math.max(1, Math.trunc(volume / 2)));
            }

            case "x": {
                return Math.min(127, Math.trunc(ch.panning / 2));
            }

            case "y": {
                const panning =
                    ch.outputPanning >= 0 ? ch.outputPanning : ch.panning;
                return Math.min(127, Math.trunc(panning / 2));
            }

            case "o": {
                return (ch.oldOffset >> 8) & 0xff;
            }

            case "h": {
                return ch.index & 0x7f;
            }

            case "m": {
                return ch.reverse ? 1 : 0;
            }
        }
    }

    /**
     * Processes the Zxx and \xx MIDI macros of a channel. Only the internal filter macros have an effect.
     * @param ch The channel.
     */
    private processMacro(ch: ImpulseTrackerChannel) {
        const effect = ch.rowEffect;
        const smooth = effect === ImpulseTrackerEffects.smoothMidiMacro;
        if (!(
            (effect === ImpulseTrackerEffects.midiMacro && this.tick === 0) ||
            smooth
        )) {
            return;
        }
        const param = ch.rowParam;
        const macro =
            param < 0x80
                ? this.parameteredMacros[ch.activeMacro]
                : this.fixedMacros[param & 0x7f];
        // Parse the macro into bytes
        const bytes = new Array<number>();
        let firstNibble = true;
        for (const char of macro) {
            let data: number;
            let isNibble = true;
            if (char >= "0" && char <= "9") {
                data = char.charCodeAt(0) - 48;
            } else if (char >= "A" && char <= "F") {
                data = char.charCodeAt(0) - 55;
            } else if (char === "c") {
                // The MIDI channel, instruments here have none
                data = 0;
            } else if ("znvuxyohmabp".includes(char)) {
                data = this.getMacroVariable(ch, char, param);
                isNibble = false;
            } else {
                continue;
            }
            if (isNibble) {
                if (firstNibble) {
                    bytes.push(data);
                } else {
                    bytes[bytes.length - 1] =
                        (bytes[bytes.length - 1] << 4) | data;
                }
                firstNibble = !firstNibble;
            } else {
                bytes.push(data);
                firstNibble = true;
            }
        }
        for (let i = 0; i < bytes.length; i++) {
            const byte = bytes[i];
            if (byte === 0xfa || byte === 0xfc || byte === 0xff) {
                // Song start, song stop and reset the filters
                for (const channel of this
                    .channels as ImpulseTrackerChannel[]) {
                    channel.cutoff = 0x7f;
                    channel.resonance = 0;
                }
                continue;
            }
            if (
                byte !== 0xf0 ||
                bytes[i + 1] !== 0xf0 ||
                i + 3 >= bytes.length
            ) {
                continue;
            }
            const code = bytes[i + 2];
            const value = bytes[i + 3];
            i += 3;
            if (value >= 0x80 || code > 1) {
                continue;
            }
            const current = code === 0 ? ch.cutoff : ch.resonance;
            let target = value;
            if (smooth) {
                const ticksLeft = this.rowTicks - this.rowTick;
                if (ticksLeft > 1) {
                    target = Math.round(
                        current + (value - current) / ticksLeft
                    );
                }
            }
            if (code === 0) {
                ch.cutoff = target;
                ch.restoreCutoff = 0;
            } else {
                ch.resonance = target;
                ch.restoreResonance = 0;
            }
            this.setupFilter(ch, 256);
        }
    }
}

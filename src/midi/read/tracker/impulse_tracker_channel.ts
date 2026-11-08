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

import { TrackerChannel } from "./tracker_channel";
import type { ImpulseTrackerInstrument, ImpulseTrackerSample } from "./types";

/**
 * The playback position and state of one instrument envelope on a channel.
 */
export interface ImpulseTrackerEnvelopeState {
    /**
     * The position plus one, zero right after the note starts (the Impulse Tracker convention).
     */
    position: number;
    /**
     * If the envelope is enabled (the instrument flag, toggled with S77-S7C).
     */
    enabled: boolean;
}

/**
 * The playback state of an Impulse Tracker channel or background voice.
 * Follows the channel model of OpenMPT, with volumes scaled to 0-64.
 */
export class ImpulseTrackerChannel extends TrackerChannel {
    declare public instrument?: ImpulseTrackerInstrument;
    declare public sample?: ImpulseTrackerSample;

    // Volumes

    /**
     * The channel volume (0-64), set with Mxx.
     */
    public channelVolume: number;
    /**
     * The sample global volume multiplied by the instrument global volume (0-64).
     */
    public instrumentVolume = 64;
    public volumeSwing = 0;
    public panningSwing = 0;
    public cutoffSwing = 0;
    public resonanceSwing = 0;
    /**
     * The fadeout volume (0-65,536).
     */
    public fadeout = 0;

    // Note state

    /**
     * The pattern note used for pitch-pan separation and duplicate checks, 0 if none.
     * Starts at C-0, so a lone instrument number at the start plays that note.
     */
    public note = 1;
    /**
     * The last note of the pattern, used by note-less instrument numbers.
     */
    public newNote = 1;
    public lastNote = 0;
    /**
     * The one-based instrument to change to on the next note, 0 if none.
     */
    public newInstrument = 0;
    /**
     * The last instrument number of the pattern.
     */
    public oldInstrument = 0;
    public keyOff = true;
    public noteFade = true;
    /**
     * If the sample's sustain loop is active.
     */
    public sustainLoop = false;
    /**
     * If the sample plays backwards (S9F).
     */
    public reverse = false;
    public surround = false;
    /**
     * If the sample was playing on the previous tick (OpenMPT's IsSamplePlaying).
     * Unlike {@link playing}, a stopped sample counts as playing until the next tick, except after a note cut.
     */
    public active = false;
    /**
     * Set when a note starts on this tick (OpenMPT's triggerNote).
     */
    public triggered = false;
    /**
     * If this tick is the first one of the row's effects, which moves with a note delay.
     */
    public isFirstTick = false;
    public newNoteAction = 0;
    public volumeEnvelopeState: ImpulseTrackerEnvelopeState = {
        position: 0,
        enabled: false
    };
    public panningEnvelopeState: ImpulseTrackerEnvelopeState = {
        position: 0,
        enabled: false
    };
    public pitchEnvelopeState: ImpulseTrackerEnvelopeState = {
        position: 0,
        enabled: false
    };
    /**
     * The key off flag of the previous tick, used by the envelope sustain loops.
     */
    public previousKeyOff = false;
    /**
     * The panning to restore on the next note after pitch-pan separation, plus one (0 if none).
     */
    public restorePanning = 0;
    public restoreCutoff = 0;
    public restoreResonance = 0;

    // Pitch

    /**
     * The tone portamento target frequency, 0 if none.
     */
    public portamentoTarget = 0;
    /**
     * The tone portamento speed.
     */
    public portamentoSlide = 0;
    public portamentoActive = false;
    public glissando = false;
    public autoVibratoDepth = 0;
    public autoVibratoPos = 0;
    /**
     * The final playback rate in Hertz, with every pitch effect applied.
     */
    public outputFrequency = 0;

    // Effects

    public vibratoActive = false;
    public tremoloActive = false;
    public vibratoType = 0;
    public vibratoPos = 0;
    public tremoloType = 0;
    public tremoloPos = 0;
    public panbrelloType = 0;
    public panbrelloPos = 0;
    public panbrelloSpeed = 0;
    public panbrelloDepth = 0;
    /**
     * The panbrello offset that stays until the next note or panning command.
     */
    public panbrelloOffset = 0;
    public panbrelloRandom = 0;
    public arpeggioParam = 0;
    /**
     * The effect active on this row (arpeggio and tremor are only processed while set).
     */
    public command = 0;
    public tremorParam = 0;
    public tremorCount = 0;
    public retriggerParam = 1;
    public retriggerCount = 0;

    // Filter

    public cutoff = 0x7f;
    public resonance = 0;
    public filterEnabled = false;
    /**
     * The cutoff with the filter envelope applied (0-127), used while the filter is enabled.
     */
    public filterCutoffValue = 127;
    public activeMacro = 0;

    // Effect memory

    public oldVolumeSlide = 0;
    public oldFineVolume = 0;
    public oldPortamento = 0;
    public oldVolumeColumn = 0;
    public oldChannelVolumeSlide = 0;
    public oldPanningSlide = 0;
    public oldGlobalVolumeSlide = 0;
    public oldOffset = 0;
    public oldHighOffset = 0;
    public oldTempo = 0;
    public oldExtended = 0;

    /**
     * The index of the playing instrument, -1 if none.
     */
    public instrumentIndex = -1;

    public constructor(index: number, panning: number, channelVolume: number) {
        super(index, panning);
        this.channelVolume = channelVolume;
        // Notes without an instrument number stay silent until one sets the volume
        this.volume = 0;
    }

    /**
     * If a sample is assigned and has not stopped (OpenMPT's nonzero sample length).
     * Impulse Tracker stops channels when a sample without a loop ends, after note cuts,
     * new note actions and when the fadeout has reached zero.
     */
    public get playing() {
        return this.sample !== undefined && this.samplePosition !== Infinity;
    }

    /**
     * Resets the envelope positions.
     */
    public resetEnvelopes() {
        this.volumeEnvelopeState.position = 0;
        this.panningEnvelopeState.position = 0;
        this.pitchEnvelopeState.position = 0;
    }

    /**
     * Creates a copy of this channel with its own envelope states.
     */
    public override clone() {
        const copy = super.clone();
        copy.volumeEnvelopeState = { ...this.volumeEnvelopeState };
        copy.panningEnvelopeState = { ...this.panningEnvelopeState };
        copy.pitchEnvelopeState = { ...this.pitchEnvelopeState };
        return copy;
    }
}

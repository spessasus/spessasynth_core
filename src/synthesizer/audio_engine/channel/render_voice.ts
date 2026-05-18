import { absCentsToHz, cbAttenuationToGain } from "../voice/unit_converter";
import type { Voice } from "../voice/voice";
import type { MIDIChannel } from "./midi_channel";
import { GeneratorTypes } from "../../../soundbank/basic_soundbank/generator_types";
import { MIDIControllers } from "../../../midi/enums";
import { LowpassFilter } from "../voice/lowpass_filter";

const HALF_PI = Math.PI / 2;

const MIN_PAN = -500;
const MAX_PAN = 500;
const PAN_RESOLUTION = MAX_PAN - MIN_PAN;

// Initialize pan lookup tables
const panTableLeft = new Float32Array(PAN_RESOLUTION + 1);
const panTableRight = new Float32Array(PAN_RESOLUTION + 1);
for (let pan = MIN_PAN; pan <= MAX_PAN; pan++) {
    // Clamp to 0-1
    const realPan = (pan - MIN_PAN) / PAN_RESOLUTION;
    const tableIndex = pan - MIN_PAN;
    panTableLeft[tableIndex] = Math.cos(HALF_PI * realPan);
    panTableRight[tableIndex] = Math.sin(HALF_PI * realPan);
}

/**
 * Renders a voice to the stereo output buffer
 * @param voice the voice to render
 * @param timeNow current time in seconds
 * @param outputL the left output buffer
 * @param outputR the right output buffer
 * @param startIndex
 * @param sampleCount
 */
export function renderVoice(
    this: MIDIChannel,
    voice: Voice,
    timeNow: number,
    outputL: Float32Array,
    outputR: Float32Array,
    startIndex: number,
    sampleCount: number
) {
    // Check if release
    if (
        !voice.isInRelease && // If not in release, check if the release time is
        timeNow >= voice.releaseStartTime
    ) {
        // Release the voice here
        voice.isInRelease = true;
        voice.volEnv.startRelease(voice);
        voice.modEnv.startRelease(voice);

        // Looping mode 3
        if (voice.loopingMode === 3) {
            voice.wavetable.isLooping = false;
        }
    }
    voice.hasRendered = true;

    // Important sanity check, as we may disable the voice now
    // Testcase: mono mode with chords
    if (!voice.isActive) return;

    const core = this.synthCore;
    const sampleRate = core.sampleRate;
    const modulated = voice.modulatedGenerators;

    // CALCULATION START
    // TUNING
    let targetKey = voice.targetKey;
    // Calculate tuning
    let cents =
        voice.pitchOffset + // Voice pitch offset
        modulated[GeneratorTypes.fineTune] + // Soundfont fine tune
        this.octaveTuning[targetKey] + // MTS octave tuning
        this.currentTuning; // Channel tuning
    let semitones = modulated[GeneratorTypes.coarseTune]; // Soundfont coarse tuning

    // MIDI Tuning Standard
    // Use `midiNote` here since it was used for selecting the preset if tuning was active
    const tuning = core.tunings[this.preset!.program * 128 + voice.midiNote];
    if (tuning !== -1) {
        // Tuning is encoded as float
        // For example: 60.56 means key 60 and 56 cents (or 0.56 semitones)
        // Override key
        targetKey = Math.trunc(tuning);
        // Add microtonal tuning
        semitones += tuning - targetKey;
    }

    // Portamento
    if (voice.portamentoFromKey > -1) {
        // 0 to 1
        const elapsed = Math.min(
            (timeNow - voice.startTime) / voice.portamentoDuration,
            1
        );
        const diff = targetKey - voice.portamentoFromKey;
        // Zero progress means the pitch being in fromKey, full progress means the normal pitch
        semitones -= diff * (1 - elapsed);
    }

    // Calculate tuning by key using soundfont's scale tuning
    cents +=
        (targetKey - voice.rootKey) * modulated[GeneratorTypes.scaleTuning];

    // Low pass excursion with LFO and mod envelope
    let lowpassExcursion = 0;
    let volumeExcursionCentibels = 0;
    let voiceGain =
        voice.gainModifier * (1 + modulated[GeneratorTypes.amplitude] / 1000);

    // Vibrato LFO
    if (timeNow >= voice.vibLfoStartTime) {
        const vibPitchDepth = modulated[GeneratorTypes.vibLfoToPitch];
        const vibFilterDepth = modulated[GeneratorTypes.vibLfoToFilterFc];
        const vibAmplitudeDepth =
            modulated[GeneratorTypes.vibLfoAmplitudeDepth];
        if (
            vibPitchDepth !== 0 ||
            vibFilterDepth !== 0 ||
            vibAmplitudeDepth !== 0
        ) {
            const vibFreqHz = Math.max(
                0,
                absCentsToHz(modulated[GeneratorTypes.freqVibLFO]) +
                    modulated[GeneratorTypes.vibLfoRate] / 100
            );
            const rateInc = (vibFreqHz * sampleCount) / sampleRate;
            const vibLfoValue = 1 - 4 * Math.abs(voice.vibLfoPhase - 0.5);
            if ((voice.vibLfoPhase += rateInc) >= 1) voice.vibLfoPhase -= 1;
            cents += vibLfoValue * vibPitchDepth;
            // Low pass frequency
            lowpassExcursion += vibLfoValue * vibFilterDepth;

            // Amplitude depth
            voiceGain *=
                1 - ((vibLfoValue + 1) / 2) * (vibAmplitudeDepth / 1000);
        }
    }

    // Mod LFO
    if (timeNow >= voice.modLfoStartTime) {
        const modPitchDepth = modulated[GeneratorTypes.modLfoToPitch];
        const modVolDepth = modulated[GeneratorTypes.modLfoToVolume];
        const modFilterDepth = modulated[GeneratorTypes.modLfoToFilterFc];
        const modAmplitudeDepth =
            modulated[GeneratorTypes.modLfoAmplitudeDepth];
        // Don't compute mod lfo unless necessary
        if (
            modPitchDepth !== 0 ||
            modFilterDepth !== 0 ||
            modVolDepth !== 0 ||
            modAmplitudeDepth !== 0
        ) {
            const modFreqHz = Math.max(
                0,
                absCentsToHz(modulated[GeneratorTypes.freqModLFO]) +
                    modulated[GeneratorTypes.modLfoRate] / 100
            );
            const rateInc = (modFreqHz * sampleCount) / sampleRate;
            const modLfoValue = 1 - 4 * Math.abs(voice.modLfoPhase - 0.5);
            if ((voice.modLfoPhase += rateInc) >= 1) voice.modLfoPhase -= 1;
            cents += modLfoValue * modPitchDepth;
            // Vol env volume offset
            // Negate the lfo value because audigy starts with increase rather than decrease
            volumeExcursionCentibels += -modLfoValue * modVolDepth;
            // Low pass frequency
            lowpassExcursion += modLfoValue * modFilterDepth;

            // Amplitude depth
            voiceGain *=
                1 - ((modLfoValue + 1) / 2) * (modAmplitudeDepth / 1000);
        }
    }

    // TODO: Implement proper GS vibrato. Custom vibrato used to be here.

    // Mod env
    const modEnvPitchDepth = modulated[GeneratorTypes.modEnvToPitch];
    const modEnvFilterDepth = modulated[GeneratorTypes.modEnvToFilterFc];
    // Don't compute mod env unless necessary
    if (modEnvFilterDepth !== 0 || modEnvPitchDepth !== 0) {
        const modEnv = voice.modEnv.process(voice, timeNow);
        // Apply values
        lowpassExcursion += modEnv * modEnvFilterDepth;
        cents += modEnv * modEnvPitchDepth;
    }

    // Default resonant modulator: it does not affect the filter gain (neither XG nor GS did that)
    volumeExcursionCentibels -= voice.resonanceOffset;

    // Finally, calculate the playback rate
    const centsTotal = cents + semitones * 100;
    const centsRounded = centsTotal | 0;
    // Round for testing if equal,
    // But let's allow sub-microtonal tunings, because why not? :-)
    if (centsRounded !== voice.tuningCents) {
        voice.tuningCents = centsRounded;
        voice.tuningRatio = Math.pow(2, centsTotal / 1200);
    }

    // Gain target
    const gainTarget =
        cbAttenuationToGain(modulated[GeneratorTypes.initialAttenuation]) *
        cbAttenuationToGain(volumeExcursionCentibels);

    // Looping mode 2: start on release. process only volEnv
    if (voice.loopingMode === 2 && !voice.isInRelease) {
        voice.isActive = voice.volEnv.process(sampleCount, gainTarget);
        return;
    }

    // SYNTHESIS
    const buffer = core.voiceBuffer;
    // Wave table oscillator
    voice.isActive = voice.wavetable.process(
        sampleCount,
        voice.tuningRatio,
        buffer
    );

    // Vol env (output gain calculation)
    // Get the previous value
    let gain = voice.volEnv.outputGain;
    // Compute the new value
    const envActive = voice.volEnv.process(sampleCount, gainTarget);
    // Calculate increase
    const gainInc = (voice.volEnv.outputGain - gain) / sampleCount;

    // Low pass filter (inlined for performance, confirmed with node.js)
    {
        const f = voice.filter;
        const initialFc = modulated[GeneratorTypes.initialFilterFc];

        if (f.initialized) {
            /* Note:
             * We only smooth out the initialFc part,
             * the modulation envelope and LFO excursions are not smoothed.
             */
            f.currentInitialFc +=
                (initialFc - f.currentInitialFc) *
                LowpassFilter.smoothingConstant;
        } else {
            // Filter initialization, set the current fc to target
            f.initialized = true;
            f.currentInitialFc = initialFc;
        }

        // The final cutoff for this calculation
        const targetCutoff = f.currentInitialFc + lowpassExcursion;
        const modulatedResonance = modulated[GeneratorTypes.initialFilterQ];
        /* Note:
         * the check for initialFC is because of the filter optimization
         * (if cents are the maximum then the filter is open)
         * filter cannot use this optimization if it's dynamic (see #53), and
         * the filter can only be dynamic if the initial filter is not open
         */
        if (
            f.currentInitialFc > 13_499 &&
            targetCutoff > 13_499 &&
            modulatedResonance === 0
        ) {
            f.currentInitialFc = 13_500;
            // Filter is open, apply gain
            for (let i = 0; i < sampleCount; i++) {
                buffer[i] *= gain;
                gain += gainInc;
            }
        } else {
            // Check if the frequency has changed. if so, calculate new coefficients
            if (
                Math.abs(f.lastTargetCutoff - targetCutoff) > 1 ||
                f.resonanceCb !== modulatedResonance
            ) {
                f.lastTargetCutoff = targetCutoff;
                f.resonanceCb = modulatedResonance;
                f.calculateCoefficients(targetCutoff);
            }

            // Filter the input
            // Initial filtering code was ported from meltysynth created by sinshu.
            const { a0, a1, a2, a3, a4 } = f;
            let { x1, x2, y1, y2 } = f;
            for (let i = 0; i < sampleCount; i++) {
                const input = buffer[i];
                const filtered =
                    a0 * input + a1 * x1 + a2 * x2 - a3 * y1 - y2 * a4;

                // Set buffer
                x2 = x1;
                x1 = input;
                y2 = y1;
                y1 = filtered;

                // Apply filter and THEN gain
                // Per SF2 spec apply order, also see
                // https://github.com/FluidSynth/fluidsynth/issues/1427
                buffer[i] = filtered * gain;
                gain += gainInc;
            }
            f.x1 = x1;
            f.x2 = x2;
            f.y1 = y1;
            f.y2 = y2;
        }
    }

    // Note, we do not use &&= as it short-circuits!
    // And we don't do = either as wavetable might've marked it as inactive (end of sample)
    voice.isActive = voice.isActive && envActive;

    // Pan and mix down the data
    let pan: number;
    if (voice.overridePan) {
        pan = voice.overridePan;
    } else {
        // Smooth out pan to prevent clicking
        voice.currentPan +=
            (modulated[GeneratorTypes.pan] - voice.currentPan) *
            core.panSmoothingFactor;
        pan = voice.currentPan;
    }

    const { systemParameters } = core;

    const outputGain = this.currentGain * voiceGain;
    const index =
        (Math.min(Math.max(-500, pan + this.currentPan), 500) + 500) | 0;
    // Get voice's gain levels for each channel
    const gainLeft = panTableLeft[index] * outputGain;
    const gainRight = panTableRight[index] * outputGain;

    if (this._midiParameters.efxAssign) {
        // Straight into the insertion EFX!
        const insertionL = core.insertionInputL;
        const insertionR = core.insertionInputR;
        for (let i = 0; i < sampleCount; i++) {
            const s = buffer[i];
            insertionL[i] += gainLeft * s;
            insertionR[i] += gainRight * s;
        }
        return;
    }

    // Mix down the audio data
    for (let i = 0; i < sampleCount; i++) {
        const s = buffer[i];
        const idx = i + startIndex;
        outputL[idx] += gainLeft * s;
        outputR[idx] += gainRight * s;
    }
    if (!systemParameters.effectsEnabled) {
        return;
    }

    // Disable reverb and chorus if necessary
    const reverbSend =
        modulated[GeneratorTypes.reverbEffectsSend] * voice.reverbSend;
    if (reverbSend > 0) {
        const reverbGain =
            systemParameters.reverbGain * outputGain * (reverbSend / 1000);

        const reverb = core.reverbInput;
        for (let i = 0; i < sampleCount; i++) {
            reverb[i] += reverbGain * buffer[i];
        }
    }

    const chorusSend =
        modulated[GeneratorTypes.chorusEffectsSend] * voice.chorusSend;
    if (chorusSend > 0) {
        const chorusGain =
            systemParameters.chorusGain * (chorusSend / 1000) * outputGain;
        const chorus = core.chorusInput;
        for (let i = 0; i < sampleCount; i++) {
            chorus[i] += chorusGain * buffer[i];
        }
    }

    if (core.delayActive) {
        const delaySend =
            this._midiControllers[MIDIControllers.variationDepth] *
            voice.delaySend;
        if (delaySend > 0) {
            const delayGain =
                outputGain *
                systemParameters.delayGain *
                ((delaySend >> 7) / 127);
            const delay = core.delayInput;
            for (let i = 0; i < sampleCount; i++) {
                delay[i] += delayGain * buffer[i];
            }
        }
    }
}

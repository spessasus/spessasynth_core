import {
    absCentsToHz,
    cbAttenuationToGain,
    timecentsToSeconds
} from "../unit_converter";
import { getLFOValue } from "./lfo";
import type { Voice } from "../voice";
import type { MIDIChannel } from "../midi_channel";
import { generatorTypes } from "../../../../soundbank/basic_soundbank/generator_types";
import { customControllers } from "../../../enums";
import { midiControllers } from "../../../../midi/enums";
import { SpessaSynthWarn } from "../../../../utils/loggin"; // Optimized for spessasynth_lib's effects

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

    // TUNING
    let targetKey = voice.targetKey;

    // Calculate tuning
    let cents =
        voice.modulatedGenerators[generatorTypes.fineTune] + // Soundfont fine tune
        this.channelOctaveTuning[voice.midiNote] + // MTS octave tuning
        this.channelTuningCents; // Channel tuning
    let semitones = voice.modulatedGenerators[generatorTypes.coarseTune]; // Soundfont coarse tuning

    // MIDI tuning standard
    const tuning =
        this.synthCore.tunings[this.preset!.program * 128 + voice.realKey];
    if (tuning !== -1) {
        // Tuning is encoded as float
        // For example: 60.56 means key 60 and 56 cents
        // Override key
        targetKey = Math.trunc(tuning);
        // Add microtonal tuning
        cents += (tuning - targetKey) * 100;
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
        (targetKey - voice.rootKey) *
        voice.modulatedGenerators[generatorTypes.scaleTuning];

    // Low pass excursion with LFO and mod envelope
    let lowpassExcursion = 0;
    let volumeExcursionCentibels = 0;

    // Vibrato LFO
    const vibPitchDepth =
        voice.modulatedGenerators[generatorTypes.vibLfoToPitch];
    const vibVolDepth =
        voice.modulatedGenerators[generatorTypes.vibLfoToVolume];
    const vibFilterDepth =
        voice.modulatedGenerators[generatorTypes.vibLfoToFilterFc];
    if (vibPitchDepth !== 0 || vibVolDepth !== 0 || vibFilterDepth !== 0) {
        // Calculate start time and lfo value
        const vibStart =
            voice.startTime +
            timecentsToSeconds(
                voice.modulatedGenerators[generatorTypes.delayVibLFO]
            );
        const vibFreqHz = absCentsToHz(
            voice.modulatedGenerators[generatorTypes.freqVibLFO]
        );
        const vibLfoValue = getLFOValue(vibStart, vibFreqHz, timeNow);
        // Use modulation multiplier (RPN modulation depth)
        cents +=
            vibLfoValue *
            (vibPitchDepth *
                this.customControllers[customControllers.modulationMultiplier]);
        // Vol env volume offset
        // Negate the lfo value because audigy starts with increase rather than decrease
        volumeExcursionCentibels += -vibLfoValue * vibVolDepth;
        // Low pass frequency
        lowpassExcursion += vibLfoValue * vibFilterDepth;
    }

    // Mod LFO
    const modPitchDepth =
        voice.modulatedGenerators[generatorTypes.modLfoToPitch];
    const modVolDepth =
        voice.modulatedGenerators[generatorTypes.modLfoToVolume];
    const modFilterDepth =
        voice.modulatedGenerators[generatorTypes.modLfoToFilterFc];
    // Don't compute mod lfo unless necessary
    if (modPitchDepth !== 0 || modFilterDepth !== 0 || modVolDepth !== 0) {
        // Calculate start time and lfo value
        const modStart =
            voice.startTime +
            timecentsToSeconds(
                voice.modulatedGenerators[generatorTypes.delayModLFO]
            );
        const modFreqHz = absCentsToHz(
            voice.modulatedGenerators[generatorTypes.freqModLFO]
        );
        const modLfoValue = getLFOValue(modStart, modFreqHz, timeNow);
        // Use modulation multiplier (RPN modulation depth)
        cents +=
            modLfoValue *
            (modPitchDepth *
                this.customControllers[customControllers.modulationMultiplier]);
        // Vol env volume offset
        // Negate the lfo value because audigy starts with increase rather than decrease
        volumeExcursionCentibels += -modLfoValue * modVolDepth;
        // Low pass frequency
        lowpassExcursion += modLfoValue * modFilterDepth;
    }

    // Channel vibrato (GS NRPN)
    if (
        // Only enabled when modulation wheel is disabled (to prevent overlap)
        this.midiControllers[midiControllers.modulationWheel] == 0 &&
        this.channelVibrato.depth > 0
    ) {
        // Same as others
        cents +=
            getLFOValue(
                voice.startTime + this.channelVibrato.delay,
                this.channelVibrato.rate,
                timeNow
            ) * this.channelVibrato.depth;
    }

    // Mod env
    const modEnvPitchDepth =
        voice.modulatedGenerators[generatorTypes.modEnvToPitch];
    const modEnvFilterDepth =
        voice.modulatedGenerators[generatorTypes.modEnvToFilterFc];
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
    const centsTotal = (cents + semitones * 100) | 0;
    if (centsTotal !== voice.tuningCents) {
        voice.tuningCents = centsTotal;
        voice.tuningRatio = Math.pow(2, centsTotal / 1200);
    }

    // Gain target
    const gainTarget = cbAttenuationToGain(
        voice.modulatedGenerators[generatorTypes.initialAttenuation]
    );

    // SYNTHESIS
    // Does the buffer need to grow?
    // Never shrink though, as we only render sample count into it.
    // A valid use case for shrinking buffer size is rendering a specific count in 128-long chunks + a smaller one to align
    if (voice.buffer.length < sampleCount) {
        SpessaSynthWarn(`Buffer size has changed from ${voice.buffer.length} to ${sampleCount}! 
        This will cause a memory allocation!`);
        voice.buffer = new Float32Array(sampleCount);
    }
    const buffer = voice.buffer;

    // Looping mode 2: start on release. process only volEnv
    if (voice.loopingMode === 2 && !voice.isInRelease) {
        voice.isActive = voice.volEnv.process(
            sampleCount,
            buffer,
            gainTarget,
            volumeExcursionCentibels
        );
        return;
    }

    // Wave table oscillator
    voice.isActive = voice.wavetable.process(
        sampleCount,
        voice.tuningRatio,
        buffer
    );

    // Low pass filter
    voice.filter.process(sampleCount, voice, buffer, lowpassExcursion);

    // Vol env
    const envActive = voice.volEnv.process(
        sampleCount,
        buffer,
        gainTarget,
        volumeExcursionCentibels
    );

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
            (voice.modulatedGenerators[generatorTypes.pan] - voice.currentPan) *
            this.synthCore.panSmoothingFactor;
        pan = voice.currentPan;
    }

    const gain =
        this.synthCore.masterParameters.masterGain *
        this.synthCore.midiVolume *
        voice.gainModifier;
    const index = (pan + 500) | 0;
    // Get voice's gain levels for each channel
    const gainLeft = panTableLeft[index] * gain * this.synthCore.panLeft;
    const gainRight = panTableRight[index] * gain * this.synthCore.panRight;

    // Mix down the audio data
    for (let i = 0; i < sampleCount; i++) {
        const s = buffer[i];
        const idx = i + startIndex;
        outputL[idx] += gainLeft * s;
        outputR[idx] += gainRight * s;
    }
    if (!this.synthCore.enableEffects) {
        return;
    }

    // Disable reverb and chorus if necessary
    const reverbSend =
        voice.modulatedGenerators[generatorTypes.reverbEffectsSend];
    if (reverbSend > 0) {
        const reverbGain =
            this.synthCore.masterParameters.reverbGain *
            gain *
            (reverbSend / 1000);

        const reverb = this.synthCore.reverbInput;
        for (let i = 0; i < sampleCount; i++) {
            reverb[i] += reverbGain * buffer[i];
        }
    }

    const chorusSend =
        voice.modulatedGenerators[generatorTypes.chorusEffectsSend];
    if (chorusSend > 0) {
        const chorusGain =
            this.synthCore.masterParameters.chorusGain *
            (chorusSend / 1000) *
            gain;
        const chorus = this.synthCore.chorusInput;
        for (let i = 0; i < sampleCount; i++) {
            chorus[i] += chorusGain * buffer[i];
        }
    }
}

import type { MIDIChannel } from "./midi_channel";
import type { Voice } from "./voice";
import { generatorTypes } from "../../../soundbank/basic_soundbank/generator_types";

/**
 * stereo_panner.js
 * purpose: pans a given voice out to the stereo output and to the effects' outputs
 */

export const PAN_SMOOTHING_FACTOR = 0.05;

// optimized for spessasynth_lib's effects
export const REVERB_DIVIDER = 3070;
export const CHORUS_DIVIDER = 2000;
const HALF_PI = Math.PI / 2;

const MIN_PAN = -500;
const MAX_PAN = 500;
const PAN_RESOLUTION = MAX_PAN - MIN_PAN;

// initialize pan lookup tables
const panTableLeft = new Float32Array(PAN_RESOLUTION + 1);
const panTableRight = new Float32Array(PAN_RESOLUTION + 1);
for (let pan = MIN_PAN; pan <= MAX_PAN; pan++) {
    // clamp to 0-1
    const realPan = (pan - MIN_PAN) / PAN_RESOLUTION;
    const tableIndex = pan - MIN_PAN;
    panTableLeft[tableIndex] = Math.cos(HALF_PI * realPan);
    panTableRight[tableIndex] = Math.sin(HALF_PI * realPan);
}

/**
 * Pans the voice to the given output buffers
 * @param voice The voice to pan.
 * @param inputBuffer The input buffer containing the audio data for the voice (mono).
 * @param outputLeft The left output buffer to mix the voice into.
 * @param outputRight The right output buffer to mix the voice into.
 * @param reverbLeft The left reverb output buffer.
 * @param reverbRight The right reverb output buffer.
 * @param chorusLeft The left chorus output buffer.
 * @param chorusRight The right chorus output buffer.
 * @param startIndex The start index offset in the output buffers where the voice's audio data should be mixed in.
 */
export function panAndMixVoice(
    this: MIDIChannel,
    voice: Voice,
    inputBuffer: Float32Array,
    outputLeft: Float32Array,
    outputRight: Float32Array,
    reverbLeft: Float32Array,
    reverbRight: Float32Array,
    chorusLeft: Float32Array,
    chorusRight: Float32Array,
    startIndex: number
) {
    if (isNaN(inputBuffer[0])) {
        return;
    }
    /**
     * clamp -500 to 500
     */
    let pan: number;
    if (voice.overridePan) {
        pan = voice.overridePan;
    } else {
        // smooth out pan to prevent clicking
        voice.currentPan +=
            (voice.modulatedGenerators[generatorTypes.pan] - voice.currentPan) *
            this.synthProps.panSmoothingFactor;
        pan = voice.currentPan;
    }

    const gain =
        this.synthProps.masterParameters.masterGain *
        this.synthProps.midiVolume *
        voice.gain;
    const index = ~~(pan + 500);
    // get voice's gain levels for each channel
    const gainLeft = panTableLeft[index] * gain * this.synthProps.panLeft;
    const gainRight = panTableRight[index] * gain * this.synthProps.panRight;

    // disable reverb and chorus if necessary
    if (this.synth.effectsEnabled) {
        const reverbSend =
            voice.modulatedGenerators[generatorTypes.reverbEffectsSend];
        if (reverbSend > 0) {
            // reverb is mono so we need to multiply by gain
            const reverbGain =
                this.synthProps.masterParameters.reverbGain *
                this.synthProps.reverbSend *
                gain *
                (reverbSend / REVERB_DIVIDER);
            for (let i = 0; i < inputBuffer.length; i++) {
                const idx = i + startIndex;
                reverbLeft[idx] += reverbGain * inputBuffer[i];
                reverbRight[idx] += reverbGain * inputBuffer[i];
            }
        }

        const chorusSend =
            voice.modulatedGenerators[generatorTypes.chorusEffectsSend];
        if (chorusSend > 0) {
            // chorus is stereo so we do not need to
            const chorusGain =
                this.synthProps.masterParameters.chorusGain *
                this.synthProps.chorusSend *
                (chorusSend / CHORUS_DIVIDER);
            const chorusLeftGain = gainLeft * chorusGain;
            const chorusRightGain = gainRight * chorusGain;
            for (let i = 0; i < inputBuffer.length; i++) {
                const idx = i + startIndex;
                chorusLeft[idx] += chorusLeftGain * inputBuffer[i];
                chorusRight[idx] += chorusRightGain * inputBuffer[i];
            }
        }
    }

    // mix down the audio data
    if (gainLeft > 0) {
        for (let i = 0; i < inputBuffer.length; i++) {
            outputLeft[i + startIndex] += gainLeft * inputBuffer[i];
        }
    }
    if (gainRight > 0) {
        for (let i = 0; i < inputBuffer.length; i++) {
            outputRight[i + startIndex] += gainRight * inputBuffer[i];
        }
    }
}

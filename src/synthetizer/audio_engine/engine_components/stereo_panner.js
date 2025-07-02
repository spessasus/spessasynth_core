import { generatorTypes } from "../../../soundfont/basic_soundfont/generator_types.js";

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
for (let pan = MIN_PAN; pan <= MAX_PAN; pan++)
{
    // clamp to 0-1
    const realPan = (pan - MIN_PAN) / PAN_RESOLUTION;
    const tableIndex = pan - MIN_PAN;
    panTableLeft[tableIndex] = Math.cos(HALF_PI * realPan);
    panTableRight[tableIndex] = Math.sin(HALF_PI * realPan);
}

/**
 * Pans the voice to the given output buffers
 * @param voice {Voice} the voice to pan
 * @param inputBuffer {Float32Array} the input buffer in mono
 * @param outputLeft {Float32Array} left output buffer
 * @param outputRight {Float32Array} right output buffer
 * @param reverbLeft {Float32Array} left reverb input
 * @param reverbRight {Float32Array} right reverb input
 * @param chorusLeft {Float32Array} left chorus buffer
 * @param chorusRight {Float32Array} right chorus buffer
 * @param startIndex {number}
 * @this {MidiAudioChannel}
 */
export function panAndMixVoice(voice,
                               inputBuffer,
                               outputLeft, outputRight,
                               reverbLeft, reverbRight,
                               chorusLeft, chorusRight,
                               startIndex)
{
    if (isNaN(inputBuffer[0]))
    {
        return;
    }
    /**
     * clamp -500 to 500
     * @type {number}
     */
    let pan;
    if (voice.overridePan)
    {
        pan = voice.overridePan;
    }
    else
    {
        // smooth out pan to prevent clicking
        voice.currentPan += (voice.modulatedGenerators[generatorTypes.pan] - voice.currentPan) * this.synth.panSmoothingFactor;
        pan = voice.currentPan;
    }
    
    const gain = this.synth.currentGain * voice.gain;
    const index = ~~(pan + 500);
    // get voice's gain levels for each channel
    const gainLeft = panTableLeft[index] * gain * this.synth.panLeft;
    const gainRight = panTableRight[index] * gain * this.synth.panRight;
    
    // disable reverb and chorus if necessary
    if (this.synth.effectsEnabled)
    {
        const reverbSend = voice.modulatedGenerators[generatorTypes.reverbEffectsSend];
        if (reverbSend > 0)
        {
            // reverb is mono so we need to multiply by gain
            const reverbGain = this.synth.reverbGain * this.synth.reverbSend * gain * (reverbSend / REVERB_DIVIDER);
            for (let i = 0; i < inputBuffer.length; i++)
            {
                const idx = i + startIndex;
                reverbLeft[idx] += reverbGain * inputBuffer[i];
                reverbRight[idx] += reverbGain * inputBuffer[i];
            }
        }
        
        const chorusSend = voice.modulatedGenerators[generatorTypes.chorusEffectsSend];
        if (chorusSend > 0)
        {
            // chorus is stereo so we do not need to
            const chorusGain = this.synth.chorusGain * this.synth.chorusSend * (chorusSend / CHORUS_DIVIDER);
            const chorusLeftGain = gainLeft * chorusGain;
            const chorusRightGain = gainRight * chorusGain;
            for (let i = 0; i < inputBuffer.length; i++)
            {
                const idx = i + startIndex;
                chorusLeft[idx] += chorusLeftGain * inputBuffer[i];
                chorusRight[idx] += chorusRightGain * inputBuffer[i];
            }
        }
    }
    
    // mix down the audio data
    if (gainLeft > 0)
    {
        for (let i = 0; i < inputBuffer.length; i++)
        {
            outputLeft[i + startIndex] += gainLeft * inputBuffer[i];
        }
    }
    if (gainRight > 0)
    {
        for (let i = 0; i < inputBuffer.length; i++)
        {
            outputRight[i + startIndex] += gainRight * inputBuffer[i];
        }
    }
}
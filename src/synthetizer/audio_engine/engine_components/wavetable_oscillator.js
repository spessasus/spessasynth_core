import { interpolationTypes } from "./enums.js";

/**
 * wavetable_oscillator.js
 * purpose: plays back raw audio data at an arbitrary playback rate
 */


export class WavetableOscillator
{
    /**
     * Fills the output buffer with raw sample data using a given interpolation
     * @param voice {Voice} the voice we're working on
     * @param outputBuffer {Float32Array} the output buffer to write to
     * @param interpolation {interpolationTypes} the interpolation type
     */
    static getSample(voice, outputBuffer, interpolation)
    {
        switch (interpolation)
        {
            case interpolationTypes.fourthOrder:
                this.getSampleCubic(voice, outputBuffer);
                return;
            
            case interpolationTypes.linear:
            default:
                this.getSampleLinear(voice, outputBuffer);
                return;
            
            case interpolationTypes.nearestNeighbor:
                WavetableOscillator.getSampleNearest(voice, outputBuffer);
                return;
        }
    }
    
    /**
     * Fills the output buffer with raw sample data using linear interpolation
     * @param voice {Voice} the voice we're working on
     * @param outputBuffer {Float32Array} the output buffer to write to
     */
    static getSampleLinear(voice, outputBuffer)
    {
        const sample = voice.sample;
        let cur = sample.cursor;
        const sampleData = sample.sampleData;
        
        if (sample.isLooping)
        {
            const loopLength = sample.loopEnd - sample.loopStart;
            for (let i = 0; i < outputBuffer.length; i++)
            {
                // check for loop
                while (cur >= sample.loopEnd)
                {
                    cur -= loopLength;
                }
                
                // grab the 2 nearest points
                const floor = ~~cur;
                let ceil = floor + 1;
                
                while (ceil >= sample.loopEnd)
                {
                    ceil -= loopLength;
                }
                
                const fraction = cur - floor;
                
                // grab the samples and interpolate
                const upper = sampleData[ceil];
                const lower = sampleData[floor];
                outputBuffer[i] = (lower + (upper - lower) * fraction);
                
                cur += sample.playbackStep * voice.currentTuningCalculated;
            }
        }
        else
        {
            if (sample.loopingMode === 2 && !voice.isInRelease)
            {
                return;
            }
            for (let i = 0; i < outputBuffer.length; i++)
            {
                
                // linear interpolation
                const floor = ~~cur;
                const ceil = floor + 1;
                
                // flag the voice as finished if needed
                if (ceil >= sample.end)
                {
                    voice.finished = true;
                    return;
                }
                
                const fraction = cur - floor;
                
                // grab the samples and interpolate
                const upper = sampleData[ceil];
                const lower = sampleData[floor];
                outputBuffer[i] = (lower + (upper - lower) * fraction);
                
                cur += sample.playbackStep * voice.currentTuningCalculated;
            }
        }
        voice.sample.cursor = cur;
    }
    
    /**
     * Fills the output buffer with raw sample data using no interpolation (nearest neighbor)
     * @param voice {Voice} the voice we're working on
     * @param outputBuffer {Float32Array} the output buffer to write to
     */
    static getSampleNearest(voice, outputBuffer)
    {
        const sample = voice.sample;
        let cur = sample.cursor;
        const loopLength = sample.loopEnd - sample.loopStart;
        const sampleData = sample.sampleData;
        if (voice.sample.isLooping)
        {
            for (let i = 0; i < outputBuffer.length; i++)
            {
                // check for loop
                while (cur >= sample.loopEnd)
                {
                    cur -= loopLength;
                }
                
                // grab the nearest neighbor
                let ceil = ~~cur + 1;
                
                while (ceil >= sample.loopEnd)
                {
                    ceil -= loopLength;
                }
                
                outputBuffer[i] = sampleData[ceil];
                cur += sample.playbackStep * voice.currentTuningCalculated;
            }
        }
        else
        {
            if (sample.loopingMode === 2 && !voice.isInRelease)
            {
                return;
            }
            for (let i = 0; i < outputBuffer.length; i++)
            {
                
                // nearest neighbor
                const ceil = ~~cur + 1;
                
                // flag the voice as finished if needed
                if (ceil >= sample.end)
                {
                    voice.finished = true;
                    return;
                }
                
                //nearest neighbor (uncomment to use)
                outputBuffer[i] = sampleData[ceil];
                cur += sample.playbackStep * voice.currentTuningCalculated;
            }
        }
        sample.cursor = cur;
    }
    
    
    /**
     * Fills the output buffer with raw sample data using cubic interpolation
     * @param voice {Voice} the voice we're working on
     * @param outputBuffer {Float32Array} the output buffer to write to
     */
    static getSampleCubic(voice, outputBuffer)
    {
        const sample = voice.sample;
        let cur = sample.cursor;
        const sampleData = sample.sampleData;
        
        if (sample.isLooping)
        {
            const loopLength = sample.loopEnd - sample.loopStart;
            for (let i = 0; i < outputBuffer.length; i++)
            {
                // check for loop
                while (cur >= sample.loopEnd)
                {
                    cur -= loopLength;
                }
                
                // grab the 4 points
                const y0 = ~~cur;   // point before the cursor. twice bitwise-not is just a faster Math.floor
                let y1 = y0 + 1;    // point after the cursor
                let y2 = y0 + 2;    // point 1 after the cursor
                let y3 = y0 + 3;    // point 2 after the cursor
                const t = cur - y0; // the distance from y0 to cursor [0;1]
                // y0 is not handled here
                // as it's math.floor of cur which is handled above
                if (y1 >= sample.loopEnd)
                {
                    y1 -= loopLength;
                }
                if (y2 >= sample.loopEnd)
                {
                    y2 -= loopLength;
                }
                if (y3 >= sample.loopEnd)
                {
                    y3 -= loopLength;
                }
                
                // grab the samples
                const xm1 = sampleData[y0];
                const x0 = sampleData[y1];
                const x1 = sampleData[y2];
                const x2 = sampleData[y3];
                
                // interpolate
                // https://www.musicdsp.org/en/latest/Other/93-hermite-interpollation.html
                const c = (x1 - xm1) * 0.5;
                const v = x0 - x1;
                const w = c + v;
                const a = w + v + (x2 - x0) * 0.5;
                const b = w + a;
                outputBuffer[i] = ((((a * t) - b) * t + c) * t + x0);
                
                
                cur += sample.playbackStep * voice.currentTuningCalculated;
            }
        }
        else
        {
            if (sample.loopingMode === 2 && !voice.isInRelease)
            {
                return;
            }
            for (let i = 0; i < outputBuffer.length; i++)
            {
                // grab the 4 points
                const y0 = ~~cur;   // point before the cursor. twice bitwise not is just a faster Math.floor
                let y1 = y0 + 1;    // point after the cursor
                let y2 = y1 + 1;    // point 1 after the cursor
                let y3 = y2 + 1;    // point 2 after the cursor
                const t = cur - y0; // distance from y0 to cursor [0;1]
                
                // flag as finished if needed
                if (y1 >= sample.end ||
                    y2 >= sample.end ||
                    y3 >= sample.end)
                {
                    voice.finished = true;
                    return;
                }
                
                // grab the samples
                const xm1 = sampleData[y0];
                const x0 = sampleData[y1];
                const x1 = sampleData[y2];
                const x2 = sampleData[y3];
                
                // interpolate
                // https://www.musicdsp.org/en/latest/Other/93-hermite-interpollation.html
                const c = (x1 - xm1) * 0.5;
                const v = x0 - x1;
                const w = c + v;
                const a = w + v + (x2 - x0) * 0.5;
                const b = w + a;
                outputBuffer[i] = ((((a * t) - b) * t + c) * t + x0);
                
                cur += sample.playbackStep * voice.currentTuningCalculated;
            }
        }
        voice.sample.cursor = cur;
    }
}
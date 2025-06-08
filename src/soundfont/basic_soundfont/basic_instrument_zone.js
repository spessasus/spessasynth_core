import { BasicZone } from "./basic_zone.js";

export class BasicInstrumentZone extends BasicZone
{
    /**
     * Zone's sample.
     * @type {BasicSample}
     */
    sample;
    
    /**
     * For tracking on the individual zone level, since multiple presets can refer to the same instrument
     * @type {number}
     */
    useCount = 0;
    
    /**
     * @param sample {BasicSample}
     */
    setSample(sample)
    {
        this.sample = sample;
        this.sample.useCount++;
    }
    
    deleteZone()
    {
        this.sample.useCount--;
    }
    
    hasSample()
    {
        return !!this.sample;
    }
}
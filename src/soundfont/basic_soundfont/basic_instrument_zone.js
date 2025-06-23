import { BasicZone } from "./basic_zone.js";

export class BasicInstrumentZone extends BasicZone
{
    /**
     * The parent instrument.
     * @type {BasicInstrument}
     */
    parentInstrument;
    
    /**
     * Zone's sample.
     * @type {BasicSample}
     */
    sample;
    /**
     * For tracking on the individual zone level, since multiple presets can refer to the same instrument.
     * @type {number}
     */
    useCount;
    
    /**
     * @param instrument {BasicInstrument}
     */
    constructor(instrument)
    {
        super();
        this.parentInstrument = instrument;
        this.useCount = instrument.useCount;
    }
    
    /**
     * @param sample {BasicSample}
     */
    setSample(sample)
    {
        this.sample = sample;
        sample.linkTo(this.parentInstrument);
    }
    
    deleteZone()
    {
        this.sample.unlinkFrom(this.parentInstrument);
    }
}
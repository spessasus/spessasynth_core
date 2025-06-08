import { BasicZone } from "./basic_zone.js";

export class BasicPresetZone extends BasicZone
{
    /**
     * Zone's instrument
     * @type {BasicInstrument}
     */
    instrument;
    
    deleteZone()
    {
        this.instrument.removeUseCount();
    }
    
    /**
     * @param instrument {BasicInstrument}
     */
    setInstrument(instrument)
    {
        this.instrument = instrument;
        this.instrument.addUseCount();
    }
    
    
    hasInstrument()
    {
        return !!this.instrument;
    }
}
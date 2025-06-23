import { BasicZone } from "./basic_zone.js";

export class BasicPresetZone extends BasicZone
{
    /**
     * The parent preset.
     * @type {BasicPreset}
     */
    parentPreset;
    
    /**
     * Zone's instrument.
     * @type {BasicInstrument}
     */
    instrument;
    
    /**
     * @param preset {BasicPreset}
     */
    constructor(preset)
    {
        super();
        this.parentPreset = preset;
    }
    
    deleteZone()
    {
        this.instrument.unlinkFrom(this.parentPreset);
    }
    
    /**
     * @param instrument {BasicInstrument}
     */
    setInstrument(instrument)
    {
        this.instrument = instrument;
        this.instrument.linkTo(this.parentPreset);
    }
}
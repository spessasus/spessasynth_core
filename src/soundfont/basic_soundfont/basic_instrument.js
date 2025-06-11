import { BasicGlobalZone } from "./basic_global_zone.js";
import { BasicInstrumentZone } from "./basic_instrument_zone.js";

export class BasicInstrument
{
    /**
     * The instrument's name
     * @type {string}
     */
    instrumentName = "";
    
    /**
     * The instrument's zones
     * @type {BasicInstrumentZone[]}
     * @readonly
     */
    instrumentZones = [];
    
    /**
     * Instrument's global zone
     * @type {BasicGlobalZone}
     */
    globalZone = new BasicGlobalZone();
    
    /**
     * Instrument's linked presets (the presets that use it)
     * note that duplicates are allowed since one preset can use the same instrument multople times
     * @type {BasicPreset[]}
     */
    linkedPresets = [];
    
    /**
     * @returns {number}
     */
    get useCount()
    {
        return this.linkedPresets.length;
    }
    
    /**
     * @returns {BasicInstrumentZone}
     */
    createZone()
    {
        const zone = new BasicInstrumentZone(this);
        this.instrumentZones.push(zone);
        return zone;
    }
    
    /**
     * @param preset {BasicPreset}
     */
    linkTo(preset)
    {
        this.linkedPresets.push(preset);
        this.instrumentZones.forEach(z => z.useCount = this.linkedPresets.length);
    }
    
    /**
     * @param preset {BasicPreset}
     */
    unlinkFrom(preset)
    {
        const index = this.linkedPresets.indexOf(preset);
        if (index < 0)
        {
            throw new Error(`Cannot unlink ${preset.presetName} from ${this.instrumentName}: not linked.`);
        }
        this.linkedPresets.splice(index, 1);
    }
    
    deleteAllZones()
    {
        this.instrumentZones.forEach(z => z.deleteZone());
        this.instrumentZones.length = 0;
    }
    
    /**
     * @param index {number}
     * @returns {boolean} if deleted
     */
    deleteZone(index)
    {
        const zone = this.instrumentZones[index];
        if (zone.useCount < 1)
        {
            zone.deleteZone();
            this.instrumentZones.splice(index, 1);
            return true;
        }
        return false;
    }
}
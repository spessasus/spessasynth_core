import { BasicGlobalZone } from "./basic_global_zone.js";
import { BasicInstrumentZone } from "./basic_instrument_zone.js";
import { SpessaSynthWarn } from "../../utils/loggin.js";

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
        this.instrumentZones.forEach(z => z.useCount++);
    }
    
    /**
     * @param preset {BasicPreset}
     */
    unlinkFrom(preset)
    {
        const index = this.linkedPresets.indexOf(preset);
        if (index < 0)
        {
            SpessaSynthWarn(`Cannot unlink ${preset.presetName} from ${this.instrumentName}: not linked.`);
            return;
        }
        this.linkedPresets.splice(index, 1);
        this.instrumentZones.forEach(z => z.useCount--);
    }
    
    deleteUnusedZones()
    {
        this.instrumentZones = this.instrumentZones.filter(z =>
        {
            const stays = z.useCount > 0;
            if (!stays)
            {
                z.deleteZone();
            }
            return stays;
        });
    }
    
    // unlinks everything from this instrument
    deleteInstrument()
    {
        if (this.useCount > 0)
        {
            throw new Error(`Cannot delete an instrument that is used by: ${this.linkedPresets.map(p => p.presetName)}.`);
        }
        this.instrumentZones.forEach(z => z.deleteZone());
    }
    
    /**
     * @param index {number}
     * @returns {boolean} if deleted
     */
    deleteZone(index)
    {
        const zone = this.instrumentZones[index];
        zone.useCount -= 1;
        if (zone.useCount < 1)
        {
            zone.deleteZone();
            this.instrumentZones.splice(index, 1);
            return true;
        }
        return false;
    }
}
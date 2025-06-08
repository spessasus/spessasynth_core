import { BasicGlobalZone } from "./basic_global_zone.js";

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
     * Instrument's use count, used for trimming
     * @type {number}
     * @private
     */
    _useCount = 0;
    
    /**
     * @returns {number}
     */
    get useCount()
    {
        return this._useCount;
    }
    
    /**
     * @param zones {BasicInstrumentZone}
     */
    addZones(...zones)
    {
        zones.forEach(z => z.useCount++);
        this.instrumentZones.push(...zones);
    }
    
    addUseCount()
    {
        this._useCount++;
        this.instrumentZones.forEach(z => z.useCount++);
    }
    
    removeUseCount()
    {
        this._useCount--;
        this.instrumentZones.forEach(z => z.useCount--);
    }
    
    deleteZones()
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
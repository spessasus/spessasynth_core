import { BasicInstrument } from "../basic_soundfont/basic_instrument.js";
import { DLSZone } from "./dls_zone.js";

export class DLSInstrument extends BasicInstrument
{
    constructor()
    {
        super();
    }
    
    /**
     * @returns {DLSZone}
     */
    createZone()
    {
        const z = new DLSZone(this);
        this.instrumentZones.push(z);
        return z;
    }
}
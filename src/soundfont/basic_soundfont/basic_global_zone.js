import { BasicZone } from "./basic_zone.js";

export class BasicGlobalZone extends BasicZone
{
    
    /**
     * @param zone {BasicZone}
     */
    copyFrom(zone)
    {
        this.keyRange = { ...zone.keyRange };
        this.velRange = { ...zone.velRange };
        this.generators = [...zone.generators];
        this.modulators = [...zone.modulators];
    }
}
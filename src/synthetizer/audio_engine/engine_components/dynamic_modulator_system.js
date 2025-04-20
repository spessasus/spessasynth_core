import { getModSourceEnum, Modulator, modulatorCurveTypes } from "../../../soundfont/basic_soundfont/modulator.js";
import { NON_CC_INDEX_OFFSET } from "./controller_tables.js";

/**
 * A class for dynamic modulators
 * that are assigned for more complex system exclusive messages
 */
export class DynamicModulatorSystem
{
    /**
     * the current dynamic modulator list
     * @type {{mod: Modulator, id: string}[]}
     */
    modulatorList = [];
    
    resetModulators()
    {
        this.modulatorList = [];
    }
    
    /**
     * @returns {Modulator[]}
     */
    getModulators()
    {
        return this.modulatorList.map(m => m.mod);
    }
    
    /**
     * @param source {number}
     * @param destination {generatorTypes}
     * @param isBipolar {boolean}
     * @param isNegative {boolean}
     */
    _getModulatorId(source, destination, isBipolar, isNegative)
    {
        return `${source}-${destination}-${isBipolar}-${isNegative}`;
    }
    
    /**
     * @param id {string}
     * @private
     */
    _deleteModulator(id)
    {
        this.modulatorList = this.modulatorList.filter(m => m.id !== id);
    }
    
    /**
     * @param source {number} like in midiControllers: values below NON_CC_INDEX_OFFSET are CCs,
     * above are regular modulator sources
     * @param destination {generatorTypes}
     * @param amount {number}
     * @param isBipolar {boolean}
     * @param isNegative {boolean}
     */
    setModulator(source, destination, amount, isBipolar = false, isNegative = false)
    {
        const id = this._getModulatorId(source, destination, isBipolar, isNegative);
        if (amount === 0)
        {
            this._deleteModulator(id);
        }
        const mod = this.modulatorList.find(m => m.id === id);
        if (mod)
        {
            mod.mod.transformAmount = amount;
        }
        else
        {
            let srcNum, isCC;
            if (source >= NON_CC_INDEX_OFFSET)
            {
                srcNum = source - NON_CC_INDEX_OFFSET;
                isCC = false;
            }
            else
            {
                srcNum = source;
                isCC = true;
            }
            const modulator = new Modulator(
                getModSourceEnum(modulatorCurveTypes.linear, isBipolar, 0, isCC, srcNum),
                0x0, // linear no controller
                destination,
                amount,
                0
            );
            this.modulatorList.push({
                mod: modulator,
                id: id
            });
        }
    }
}
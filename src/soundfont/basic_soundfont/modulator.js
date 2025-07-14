import { midiControllers } from "../../midi/midi_message.js";
import { generatorTypes, MAX_GENERATOR } from "./generator_types.js";

/**
 * modulators.js
 * purpose: parses soundfont modulators and the source enums, also includes the default modulators list
 **/

export const MOD_BYTE_SIZE = 10;

/**
 * @enum {number}
 */
export const modulatorSources = {
    noController: 0,
    noteOnVelocity: 2,
    noteOnKeyNum: 3,
    polyPressure: 10,
    channelPressure: 13,
    pitchWheel: 14,
    pitchWheelRange: 16,
    link: 127
    
};

/**
 *
 * @enum {number}
 */
export const modulatorCurveTypes = {
    linear: 0,
    concave: 1,
    convex: 2,
    switch: 3
};


export function getModSourceEnum(curveType, polarity, direction, isCC, index)
{
    return (curveType << 10) | (polarity << 9) | (direction << 8) | (isCC << 7) | index;
}

const defaultResonantModSource = getModSourceEnum(
    modulatorCurveTypes.linear,
    1,
    0,
    1,
    midiControllers.filterResonance
); // linear forwards bipolar cc 74

export class Modulator
{
    /**
     * The current computed value of this modulator. Only used in the synthesis engine for local voices
     * @type {number}
     */
    currentValue = 0;
    
    /**
     * The generator destination of this modulator
     * @type {generatorTypes}
     */
    modulatorDestination;
    
    /**
     * The transform amount for this modulator
     * @type {number}
     */
    transformAmount;
    
    /**
     * The transform type for this modulator
     * @type {0|2}
     */
    transformType;
    
    /**
     * Indicates if the given modulator is chorus or reverb effects modulator.
     * This is done to simulate BASSMIDI effects behavior:
     * - defaults to 1000 transform amount rather than 200
     * - values can be changed, but anything above 200 is 1000
     * (except for values above 1000, they are copied directly)
     * - all values below are multiplied by 5 (200 * 5 = 1000)
     * - still can be disabled if the soundfont has its own modulator curve
     * - this fixes the very low amount of reverb by default and doesn't break soundfonts
     * @type {boolean}
     * @readonly
     */
    isEffectModulator = false;
    
    /**
     * The default resonant modulator does not affect the filter gain.
     * Neither XG nor GS responded to cc #74 in that way.
     * @type {boolean}
     * @readonly
     */
    isDefaultResonantModulator = false;
    
    /**
     * 1 if the source is bipolar (min is -1, max is 1)
     * otherwise min is 0 and max is 1
     * @type {0|1}
     */
    sourcePolarity;
    
    /**
     * 1 if the source is negative (from 1 to 0)
     * @type {0|1}
     */
    sourceDirection;
    
    /**
     * 1 if the source uses a MIDI CC
     * @type {0|1}
     */
    sourceUsesCC;
    
    /**
     * source index/CC number
     * @type {modulatorSources|midiControllers}
     */
    sourceIndex;
    
    /**
     * source curve type
     * @type {modulatorCurveTypes}
     */
    sourceCurveType;
    
    /**
     * 1 if the source is bipolar (min is -1, max is 1)
     * otherwise min is 0 and max is 1
     * @type {0|1}
     */
    secSrcPolarity;
    
    /**
     * 1 if the source is negative (from 1 to 0)
     * @type {0|1}
     */
    secSrcDirection;
    
    /**
     * 1 if the source uses a MIDI CC
     * @type {0|1}
     */
    secSrcUsesCC;
    
    /**
     * source index/CC number
     * @type {modulatorSources|midiControllers}
     */
    secSrcIndex;
    
    /**
     * source curve type
     * @type {modulatorCurveTypes}
     */
    secSrcCurveType;
    
    /**
     * Creates a new SF2 Modulator
     * @param sourceIndex {modulatorSources|midiControllers}
     * @param sourceCurveType {modulatorCurveTypes}
     * @param sourceUsesCC {0|1}
     * @param sourcePolarity {0|1}
     * @param sourceDirection {0|1}
     * @param secSrcIndex {modulatorSources|midiControllers}
     * @param secSrcCurveType {modulatorCurveTypes}
     * @param secSrcUsesCC {0|1}
     * @param secSrcPolarity {0|1}
     * @param secSrcDirection {0|1}
     * @param destination {generatorTypes}
     * @param amount {number}
     * @param transformType {0|2}
     * @param isEffectModulator {boolean}
     * @param isDefaultResonantModulator {boolean}
     */
    constructor(sourceIndex,
                sourceCurveType,
                sourceUsesCC,
                sourcePolarity,
                sourceDirection,
                secSrcIndex,
                secSrcCurveType,
                secSrcUsesCC,
                secSrcPolarity,
                secSrcDirection,
                destination,
                amount,
                transformType,
                isEffectModulator = false,
                isDefaultResonantModulator = false)
    {
        this.sourcePolarity = sourcePolarity;
        this.sourceDirection = sourceDirection;
        this.sourceUsesCC = sourceUsesCC;
        this.sourceIndex = sourceIndex;
        this.sourceCurveType = sourceCurveType;
        
        this.secSrcPolarity = secSrcPolarity;
        this.secSrcDirection = secSrcDirection;
        this.secSrcUsesCC = secSrcUsesCC;
        this.secSrcIndex = secSrcIndex;
        this.secSrcCurveType = secSrcCurveType;
        
        this.modulatorDestination = destination;
        this.transformAmount = amount;
        this.transformType = transformType;
        this.isEffectModulator = isEffectModulator;
        this.isDefaultResonantModulator = isDefaultResonantModulator;
        
        
        if (this.modulatorDestination > MAX_GENERATOR)
        {
            this.modulatorDestination = generatorTypes.INVALID; // flag as invalid (for linked ones)
        }
        
    }
    
    /**
     * @param modulator {Modulator}
     * @returns {Modulator}
     */
    static copy(modulator)
    {
        return new Modulator(
            modulator.sourceIndex,
            modulator.sourceCurveType,
            modulator.sourceUsesCC,
            modulator.sourcePolarity,
            modulator.sourceDirection,
            modulator.secSrcIndex,
            modulator.secSrcCurveType,
            modulator.secSrcUsesCC,
            modulator.secSrcPolarity,
            modulator.secSrcDirection,
            modulator.modulatorDestination,
            modulator.transformAmount,
            modulator.transformType,
            modulator.isEffectModulator,
            modulator.isDefaultResonantModulator
        );
    }
    
    /**
     * @param mod1 {Modulator}
     * @param mod2 {Modulator}
     * @param checkAmount {boolean}
     * @returns {boolean}
     */
    static isIdentical(mod1, mod2, checkAmount = false)
    {
        return (mod1.sourceIndex === mod2.sourceIndex)
            && (mod1.sourceUsesCC === mod2.sourceUsesCC)
            && (mod1.sourcePolarity === mod2.sourcePolarity)
            && (mod1.sourceDirection === mod2.sourceDirection)
            && (mod1.sourceCurveType === mod2.sourceCurveType)
            
            && (mod1.secSrcIndex === mod2.secSrcIndex)
            && (mod1.secSrcUsesCC === mod2.secSrcUsesCC)
            && (mod1.secSrcPolarity === mod2.secSrcPolarity)
            && (mod1.secSrcDirection === mod2.secSrcDirection)
            && (mod1.secSrcCurveType === mod2.secSrcCurveType)
            
            && (mod1.modulatorDestination === mod2.modulatorDestination)
            && (mod1.transformType === mod2.transformType)
            && (!checkAmount || (mod1.transformAmount === mod2.transformAmount));
    }
    
    /**
     * @param mod {Modulator}
     * @returns {string}
     */
    static debugString(mod)
    {
        function getKeyByValue(object, value)
        {
            return Object.keys(object).find(key => object[key] === value);
        }
        
        let sourceString = getKeyByValue(modulatorCurveTypes, mod.sourceCurveType);
        sourceString += mod.sourcePolarity === 0 ? " unipolar " : " bipolar ";
        sourceString += mod.sourceDirection === 0 ? "forwards " : "backwards ";
        if (mod.sourceUsesCC)
        {
            sourceString += getKeyByValue(midiControllers, mod.sourceIndex);
        }
        else
        {
            sourceString += getKeyByValue(modulatorSources, mod.sourceIndex);
        }
        
        let secSrcString = getKeyByValue(modulatorCurveTypes, mod.secSrcCurveType);
        secSrcString += mod.secSrcPolarity === 0 ? " unipolar " : " bipolar ";
        secSrcString += mod.secSrcDirection === 0 ? "forwards " : "backwards ";
        if (mod.secSrcUsesCC)
        {
            secSrcString += getKeyByValue(midiControllers, mod.secSrcIndex);
        }
        else
        {
            secSrcString += getKeyByValue(modulatorSources, mod.secSrcIndex);
        }
        return `Modulator:
        Source: ${sourceString}
        Secondary source: ${secSrcString}
        Destination: ${getKeyByValue(generatorTypes, mod.modulatorDestination)}
        Trasform amount: ${mod.transformAmount}
        Transform type: ${mod.transformType}
        \n\n`;
    }
    
    getSourceEnum()
    {
        return getModSourceEnum(
            this.sourceCurveType,
            this.sourcePolarity,
            this.sourceDirection,
            this.sourceUsesCC,
            this.sourceIndex
        );
    }
    
    getSecSrcEnum()
    {
        return getModSourceEnum(
            this.secSrcCurveType,
            this.secSrcPolarity,
            this.secSrcDirection,
            this.secSrcUsesCC,
            this.secSrcIndex
        );
    }
    
    /**
     * Sum transform and create a NEW modulator
     * @param modulator {Modulator}
     * @returns {Modulator}
     */
    sumTransform(modulator)
    {
        return new Modulator(
            this.sourceIndex,
            this.sourceCurveType,
            this.sourceUsesCC,
            this.sourcePolarity,
            this.sourceDirection,
            this.secSrcIndex,
            this.secSrcCurveType,
            this.secSrcUsesCC,
            this.secSrcPolarity,
            this.secSrcDirection,
            this.modulatorDestination,
            this.transformAmount + modulator.transformAmount,
            this.transformType,
            this.isEffectModulator,
            this.isDefaultResonantModulator
        );
    }
}

export class DecodedModulator extends Modulator
{
    /**
     * reads an SF2 modulator
     * @param sourceEnum {number} SF2 source enum
     * @param secondarySourceEnum {number} SF2 secondary source enum
     * @param destination {generatorTypes|number} destination
     * @param amount {number} amount
     * @param transformType {number} transform type
     */
    constructor(sourceEnum, secondarySourceEnum, destination, amount, transformType)
    {
        // decode the source
        const sourcePolarity = sourceEnum >> 9 & 1;
        const sourceDirection = sourceEnum >> 8 & 1;
        const sourceUsesCC = sourceEnum >> 7 & 1;
        const sourceIndex = /** @type {modulatorSources} **/ sourceEnum & 127;
        const sourceCurveType = /** @type {modulatorCurveTypes} **/ sourceEnum >> 10 & 3;
        
        // decode the secondary source
        const secSrcPolarity = secondarySourceEnum >> 9 & 1;
        const secSrcDirection = secondarySourceEnum >> 8 & 1;
        const secSrcUsesCC = secondarySourceEnum >> 7 & 1;
        const secSrcIndex = /** @type {modulatorSources} **/ secondarySourceEnum & 127;
        const secSrcCurveType = /** @type {modulatorCurveTypes} **/ secondarySourceEnum >> 10 & 3;
        
        super(
            sourceIndex,
            sourceCurveType,
            sourceUsesCC,
            sourcePolarity,
            sourceDirection,
            secSrcIndex,
            secSrcCurveType,
            secSrcUsesCC,
            secSrcPolarity,
            secSrcDirection,
            destination,
            amount,
            transformType
        );
        
        
        this.isEffectModulator =
            (
                sourceEnum === 0x00DB
                || sourceEnum === 0x00DD
            )
            && secondarySourceEnum === 0x0
            && (
                this.modulatorDestination === generatorTypes.reverbEffectsSend
                || this.modulatorDestination === generatorTypes.chorusEffectsSend
            );
        
        
        this.isDefaultResonantModulator = (
            sourceEnum === defaultResonantModSource
            && secondarySourceEnum === 0x0
            && this.modulatorDestination === generatorTypes.initialFilterQ
        );
    }
}

export const DEFAULT_ATTENUATION_MOD_AMOUNT = 960;
export const DEFAULT_ATTENUATION_MOD_CURVE_TYPE = modulatorCurveTypes.concave;


const soundFontModulators = [
    // vel to attenuation
    new DecodedModulator(
        getModSourceEnum(
            DEFAULT_ATTENUATION_MOD_CURVE_TYPE,
            0,
            1,
            0,
            modulatorSources.noteOnVelocity
        ),
        0x0,
        generatorTypes.initialAttenuation,
        DEFAULT_ATTENUATION_MOD_AMOUNT,
        0
    ),
    
    // mod wheel to vibrato
    new DecodedModulator(0x0081, 0x0, generatorTypes.vibLfoToPitch, 50, 0),
    
    // vol to attenuation
    new DecodedModulator(
        getModSourceEnum(
            DEFAULT_ATTENUATION_MOD_CURVE_TYPE,
            0,
            1,
            1,
            midiControllers.mainVolume
        ),
        0x0,
        generatorTypes.initialAttenuation,
        DEFAULT_ATTENUATION_MOD_AMOUNT,
        0
    ),
    
    // channel pressure to vibrato
    new DecodedModulator(0x000D, 0x0, generatorTypes.vibLfoToPitch, 50, 0),
    
    // pitch wheel to tuning
    new DecodedModulator(0x020E, 0x0010, generatorTypes.fineTune, 12700, 0),
    
    // pan to uhh, pan
    // amount is 500 instead of 1000, see #59
    new DecodedModulator(0x028A, 0x0, generatorTypes.pan, 500, 0),
    
    // expression to attenuation
    new DecodedModulator(
        getModSourceEnum(
            DEFAULT_ATTENUATION_MOD_CURVE_TYPE,
            0,
            1,
            1,
            midiControllers.expressionController
        ),
        0x0,
        generatorTypes.initialAttenuation,
        DEFAULT_ATTENUATION_MOD_AMOUNT,
        0
    ),
    
    // reverb effects to send
    new DecodedModulator(0x00DB, 0x0, generatorTypes.reverbEffectsSend, 200, 0),
    
    // chorus effects to send
    new DecodedModulator(0x00DD, 0x0, generatorTypes.chorusEffectsSend, 200, 0)
];

const customModulators = [
    // custom modulators heck yeah
    // poly pressure to vibrato
    new DecodedModulator(
        getModSourceEnum(modulatorCurveTypes.linear, 0, 0, 0, modulatorSources.polyPressure),
        0x0,
        generatorTypes.vibLfoToPitch,
        50,
        0
    ),
    
    // cc 92 (tremolo) to modLFO volume
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            0,
            0,
            1,
            midiControllers.tremoloDepth
        ), /*linear forward unipolar cc 92 */
        0x0, // no controller
        generatorTypes.modLfoToVolume,
        24,
        0
    ),
    
    // cc 73 (attack time) to volEnv attack
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.convex,
            1,
            0,
            1,
            midiControllers.attackTime
        ), // linear forward bipolar cc 72
        0x0, // no controller
        generatorTypes.attackVolEnv,
        6000,
        0
    ),
    
    // cc 72 (release time) to volEnv release
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            1,
            0,
            1,
            midiControllers.releaseTime
        ), // linear forward bipolar cc 72
        0x0, // no controller
        generatorTypes.releaseVolEnv,
        3600,
        0
    ),
    
    // cc 74 (brightness) to filterFc
    new DecodedModulator(
        getModSourceEnum(
            modulatorCurveTypes.linear,
            1,
            0,
            1,
            midiControllers.brightness
        ), // linear forwards bipolar cc 74
        0x0, // no controller
        generatorTypes.initialFilterFc,
        6000,
        0
    ),
    
    // cc 71 (filter Q) to filter Q (default resonant modulator)
    new DecodedModulator(
        defaultResonantModSource,
        0x0, // no controller
        generatorTypes.initialFilterQ,
        250,
        0
    )

];

/**
 * @type {Modulator[]}
 */
export const defaultModulators = soundFontModulators.concat(customModulators);
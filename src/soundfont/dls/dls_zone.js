import { Generator } from "../basic_soundfont/generator.js";
import { generatorTypes } from "../basic_soundfont/generator_types.js";
import { BasicInstrumentZone } from "../basic_soundfont/basic_instrument_zone.js";

export class DLSZone extends BasicInstrumentZone
{
    /**
     * @param keyRange {SoundFontRange}
     * @param velRange {SoundFontRange}
     */
    constructor(keyRange, velRange)
    {
        super();
        this.keyRange = keyRange;
        this.velRange = velRange;
    }
    
    /**
     * @param attenuationCb {number} with EMU correction
     * @param loopingMode {number} the sfont one
     * @param loop {{start: number, end: number}}
     * @param sampleKey {number}
     * @param sample {BasicSample}
     * @param sampleID {number}
     * @param samplePitchCorrection {number} cents
     */
    setWavesample(
        attenuationCb,
        loopingMode,
        loop,
        sampleKey,
        sample,
        sampleID,
        samplePitchCorrection
    )
    {
        if (loopingMode !== 0)
        {
            this.addGenerators(new Generator(generatorTypes.sampleModes, loopingMode));
        }
        this.addGenerators(new Generator(generatorTypes.initialAttenuation, attenuationCb));
        
        // correct tuning if needed
        samplePitchCorrection -= sample.samplePitchCorrection;
        const coarseTune = Math.trunc(samplePitchCorrection / 100);
        if (coarseTune !== 0)
        {
            this.addGenerators(new Generator(generatorTypes.coarseTune, coarseTune));
        }
        const fineTune = samplePitchCorrection - (coarseTune * 100);
        if (fineTune !== 0)
        {
            this.addGenerators(new Generator(generatorTypes.fineTune, fineTune));
        }
        
        // correct loop if needed
        if (loopingMode !== 0)
        {
            const diffStart = loop.start - sample.sampleLoopStartIndex;
            const diffEnd = loop.end - sample.sampleLoopEndIndex;
            if (diffStart !== 0)
            {
                const fine = diffStart % 32768;
                this.addGenerators(new Generator(generatorTypes.startloopAddrsOffset, fine));
                // coarse generator uses 32768 samples per step
                const coarse = Math.trunc(diffStart / 32768);
                if (coarse !== 0)
                {
                    this.addGenerators(new Generator(generatorTypes.startloopAddrsCoarseOffset, coarse));
                }
            }
            if (diffEnd !== 0)
            {
                const fine = diffEnd % 32768;
                this.addGenerators(new Generator(generatorTypes.endloopAddrsOffset, fine));
                // coarse generator uses 32768 samples per step
                const coarse = Math.trunc(diffEnd / 32768);
                if (coarse !== 0)
                {
                    this.addGenerators(new Generator(generatorTypes.endloopAddrsCoarseOffset, coarse));
                }
            }
        }
        // correct the key if needed
        if (sampleKey !== sample.samplePitch)
        {
            this.addGenerators(new Generator(generatorTypes.overridingRootKey, sampleKey));
        }
        // add sample ID
        this.setSample(sample);
    }
}
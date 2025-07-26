import { Generator } from "../basic_soundbank/generator.js";
import { generatorTypes } from "../basic_soundbank/generator_types.js";
import { BasicInstrumentZone } from "../basic_soundbank/basic_instrument_zone.js";
import type { BasicInstrument } from "../basic_soundbank/basic_instrument.ts";
import type { BasicSample } from "../basic_soundbank/basic_sample.ts";

export class DLSZone extends BasicInstrumentZone {
    constructor(inst: BasicInstrument) {
        super(inst);
    }

    /**
     * @param attenuationCb with EMU correction
     * @param loopingMode the soundfont one
     * @param loop
     * @param sampleKey
     * @param sample
     * @param samplePitchCorrection cents
     */
    setWavesample(
        attenuationCb: number,
        loopingMode: number,
        loop: { start: number; end: number },
        sampleKey: number,
        sample: BasicSample,
        samplePitchCorrection: number
    ) {
        if (loopingMode !== 0) {
            this.addGenerators(
                new Generator(generatorTypes.sampleModes, loopingMode)
            );
        }
        this.addGenerators(
            new Generator(generatorTypes.initialAttenuation, attenuationCb)
        );

        // correct tuning if needed
        samplePitchCorrection -= sample.samplePitchCorrection;
        const coarseTune = Math.trunc(samplePitchCorrection / 100);
        if (coarseTune !== 0) {
            this.addGenerators(
                new Generator(generatorTypes.coarseTune, coarseTune)
            );
        }
        const fineTune = samplePitchCorrection - coarseTune * 100;
        if (fineTune !== 0) {
            this.addGenerators(
                new Generator(generatorTypes.fineTune, fineTune)
            );
        }

        // correct loop if needed
        if (loopingMode !== 0) {
            const diffStart = loop.start - sample.sampleLoopStartIndex;
            const diffEnd = loop.end - sample.sampleLoopEndIndex;
            if (diffStart !== 0) {
                const fine = diffStart % 32768;
                this.addGenerators(
                    new Generator(generatorTypes.startloopAddrsOffset, fine)
                );
                // coarse generator uses 32768 samples per step
                const coarse = Math.trunc(diffStart / 32768);
                if (coarse !== 0) {
                    this.addGenerators(
                        new Generator(
                            generatorTypes.startloopAddrsCoarseOffset,
                            coarse
                        )
                    );
                }
            }
            if (diffEnd !== 0) {
                const fine = diffEnd % 32768;
                this.addGenerators(
                    new Generator(generatorTypes.endloopAddrsOffset, fine)
                );
                // coarse generator uses 32768 samples per step
                const coarse = Math.trunc(diffEnd / 32768);
                if (coarse !== 0) {
                    this.addGenerators(
                        new Generator(
                            generatorTypes.endloopAddrsCoarseOffset,
                            coarse
                        )
                    );
                }
            }
        }
        // correct the key if needed
        if (sampleKey !== sample.samplePitch) {
            this.addGenerators(
                new Generator(generatorTypes.overridingRootKey, sampleKey)
            );
        }
        // add sample
        this.setSample(sample);
    }
}

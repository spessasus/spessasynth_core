import { Generator } from "../basic_soundbank/generator";
import { generatorTypes } from "../basic_soundbank/generator_types";
import { BasicInstrumentZone } from "../basic_soundbank/basic_instrument_zone";
import type { BasicInstrument } from "../basic_soundbank/basic_instrument";
import type { BasicSample } from "../basic_soundbank/basic_sample";

export class DLSZone extends BasicInstrumentZone {
    constructor(inst: BasicInstrument, sample: BasicSample) {
        super(inst, sample);
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
        samplePitchCorrection -= sample.pitchCorrection;
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
            const diffStart = loop.start - sample.loopStart;
            const diffEnd = loop.end - sample.loopEnd;
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
        if (sampleKey !== sample.originalKey) {
            this.addGenerators(
                new Generator(generatorTypes.overridingRootKey, sampleKey)
            );
        }
        // sample is already added
    }
}

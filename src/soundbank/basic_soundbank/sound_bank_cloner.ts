import type { BasicSoundBank } from "./basic_soundbank";
import { BasicSample } from "./basic_sample";
import { BasicInstrument } from "./basic_instrument";
import { BasicPreset } from "./basic_preset";
import type { SoundBankCloneOptions } from "../types";
import { fillWithDefaults } from "../../utils/fill_with_defaults";

/**
 * The default clone options, matching {@link BasicSoundBank.clonePreset} and the other clone methods:
 * every element with a name already in the bank is reused, and the copies are added to the bank.
 *
 * @group Sound Banks
 */
export const DEFAULT_SOUND_BANK_CLONE_OPTIONS: SoundBankCloneOptions = {
    reuseByName: true,
    reuseChildrenByName: true,
    addToBank: true
};

// Leaves room for "-99" in a 40 character extended name
const MAX_BASE_NAME_LENGTH = 37;

/**
 * Clones presets, instruments and samples into a sound bank, as one session.
 * Elements copied once in a session are reused when something else in the session uses them again,
 * so an instrument used by two cloned presets is only copied once.
 * Stereo pairs are always cloned together.
 *
 * > **Tip**
 * >
 * > With `addToBank: false`, nothing is added to the bank. The new elements are listed in {@link created},
 * > in an order they can be added in (samples first, then instruments, then presets).
 * > Their zones still link to the children they use, like {@link BasicInstrument.createZone} does,
 * > so a reused child in the bank counts them as users.
 *
 * @group Sound Banks
 */
export class SoundBankCloner {
    /**
     * The new elements this session made, in the order they were made. Reused elements are not listed.
     */
    public readonly created = {
        samples: new Array<BasicSample>(),
        instruments: new Array<BasicInstrument>(),
        presets: new Array<BasicPreset>()
    };

    /**
     * The bank the elements are cloned into.
     */
    public readonly bank: BasicSoundBank;

    /**
     * The options of this session.
     */
    public readonly options: SoundBankCloneOptions;

    private readonly sampleClones = new Map<BasicSample, BasicSample>();

    private readonly instrumentClones = new Map<
        BasicInstrument,
        BasicInstrument
    >();

    /**
     * Creates a new clone session.
     * @param bank The bank to clone elements into.
     * @param options The options for this session.
     */
    public constructor(
        bank: BasicSoundBank,
        options: Partial<SoundBankCloneOptions> = DEFAULT_SOUND_BANK_CLONE_OPTIONS
    ) {
        this.bank = bank;
        this.options = fillWithDefaults(
            options,
            DEFAULT_SOUND_BANK_CLONE_OPTIONS
        );
    }

    /**
     * Clones a sample and its stereo partner.
     * The data is shared with the original, not copied.
     * @param sample The sample to clone.
     * @returns The clone, or the existing sample with the same name if it is reused.
     */
    public cloneSample(sample: BasicSample) {
        return this.copySample(sample, this.options.reuseByName);
    }

    /**
     * Clones an instrument and the samples it uses.
     * @param instrument The instrument to clone.
     * @returns The clone, or the existing instrument with the same name if it is reused.
     */
    public cloneInstrument(instrument: BasicInstrument) {
        return this.copyInstrument(instrument, this.options.reuseByName);
    }

    /**
     * Clones a preset and the instruments and samples it uses.
     * @param preset The preset to clone.
     * @returns The clone, or the existing preset with the same name if it is reused.
     */
    public clonePreset(preset: BasicPreset) {
        const all = [...this.bank.presets, ...this.created.presets];
        if (this.options.reuseByName) {
            const existing = all.find((p) => p.name === preset.name);
            if (existing) {
                return existing;
            }
        }
        const newPreset = new BasicPreset(this.bank);
        newPreset.name = this.getFreeName(preset.name, all);
        newPreset.bankMSB = preset.bankMSB;
        newPreset.bankLSB = preset.bankLSB;
        newPreset.isGMGSDrum = preset.isGMGSDrum;
        newPreset.program = preset.program;
        newPreset.library = preset.library;
        newPreset.genre = preset.genre;
        newPreset.morphology = preset.morphology;
        newPreset.globalZone.copyFrom(preset.globalZone);
        for (const zone of preset.zones) {
            const copiedZone = newPreset.createZone(
                this.copyInstrument(
                    zone.instrument,
                    this.options.reuseChildrenByName
                )
            );
            copiedZone.copyFrom(zone);
        }
        this.created.presets.push(newPreset);
        if (this.options.addToBank) {
            this.bank.addPresets(newPreset);
        }
        return newPreset;
    }

    private copyInstrument(instrument: BasicInstrument, reuse: boolean) {
        const cloned = this.instrumentClones.get(instrument);
        if (cloned) {
            return cloned;
        }
        const all = [...this.bank.instruments, ...this.created.instruments];
        if (reuse) {
            const existing = all.find((i) => i.name === instrument.name);
            if (existing) {
                return existing;
            }
        }
        const newInstrument = new BasicInstrument();
        newInstrument.name = this.getFreeName(instrument.name, all);
        newInstrument.globalZone.copyFrom(instrument.globalZone);
        for (const zone of instrument.zones) {
            const copiedZone = newInstrument.createZone(
                this.copySample(zone.sample, this.options.reuseChildrenByName)
            );
            copiedZone.copyFrom(zone);
        }
        this.instrumentClones.set(instrument, newInstrument);
        this.created.instruments.push(newInstrument);
        if (this.options.addToBank) {
            this.bank.addInstruments(newInstrument);
        }
        return newInstrument;
    }

    private copySample(sample: BasicSample, reuse: boolean): BasicSample {
        const cloned = this.sampleClones.get(sample);
        if (cloned) {
            return cloned;
        }
        const all = [...this.bank.samples, ...this.created.samples];
        if (reuse) {
            const existing = all.find((s) => s.name === sample.name);
            if (existing) {
                return existing;
            }
        }
        const newSample = new BasicSample(
            this.getFreeName(sample.name, all),
            sample.sampleRate,
            sample.originalKey,
            sample.pitchCorrection,
            sample.sampleType,
            sample.loopStart,
            sample.loopEnd
        );
        if (sample.hasData) {
            newSample.setStoredData(sample.getStoredData());
        } else {
            // A sample loaded without data stays without data
            const form = sample.storedForm;
            if (form) {
                newSample.setLengthWithoutData(sample.sampleLength, form);
            }
        }
        this.sampleClones.set(sample, newSample);
        this.created.samples.push(newSample);
        if (this.options.addToBank) {
            this.bank.addSamples(newSample);
        }

        const linked = sample.linkedSample;
        if (linked) {
            // The pair is always cloned together, a reused partner would be relinked
            // The second of the two does the linking
            const newLinked = this.sampleClones.get(linked);
            if (newLinked) {
                newSample.setLinkedSample(newLinked, sample.sampleType);
            } else {
                this.copySample(linked, false);
            }
        }
        return newSample;
    }

    private getFreeName(name: string, elements: { name: string }[]) {
        const taken = new Set(elements.map((e) => e.name));
        if (!taken.has(name)) {
            return name;
        }
        const base = name.slice(0, MAX_BASE_NAME_LENGTH);
        let count = 1;
        while (taken.has(`${base}-${count}`)) {
            count++;
        }
        return `${base}-${count}`;
    }
}

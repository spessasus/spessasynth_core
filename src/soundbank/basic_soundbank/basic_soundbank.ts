import { SpessaLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";
import { fillWithDefaults } from "../../utils/fill_with_defaults";
import {
    DEFAULT_SF2_WRITE_OPTIONS,
    DEFAULT_SFE_WRITE_OPTIONS,
    writeSF
} from "../soundfont/write/write";
import {
    copyDefaultModulators,
    copyWithOwnCurves,
    Modulator
} from "./modulator";
import { getSF2LossesInternal } from "../soundfont/sf2_compatibility";
import { BasicSample, EmptySample } from "./basic_sample";
import { BasicInstrument } from "./basic_instrument";
import { BasicPreset } from "./basic_preset";
import * as BankSelectHacks from "../../utils/midi_hacks";

import type {
    MIDISystem,
    PresetsWithKeyCombinations,
    SetSampleFormatOptions,
    SF2VersionTag,
    SFeWriteOptions,
    SoundBankCloneOptions,
    SoundBankInfoData,
    SoundBankWriteOptions,
    SoundFont2WriteOptions
} from "../types";
import { GeneratorTypes } from "./generator_types";
import {
    type MIDIPatch,
    type MIDIPatchFull,
    MIDIPatchTools
} from "./midi_patch";
import {
    DEFAULT_DLS_OPTIONS,
    DownloadableSounds
} from "../downloadable_sounds/downloadable_sounds";
import { Generator } from "./generator";
import { SoundBankCloner } from "./sound_bank_cloner";
import { CustomCurve } from "./custom_curve";
import { StbVorbis } from "stb-vorbis";

/**
 * This module represents a single sound bank as a [SpessaSynth SFe](../../../docs/extra/sfe-format.md) bank.
 *
 * **Specifications:**
 *
 * - [SoundFont2 Specification](https://www.synthfont.com/sfspec24.pdf)
 * - [SoundFont3 Description](https://www.fluidsynth.org/wiki/SoundFont3Format)
 * - [DLS Level 2 Specification](https://midi.org/dls)
 * - [SpessaSynth SFe](../../../docs/extra/sfe-format.md)
 *
 * > **Important**
 * >
 * > Please use {@link SoundBankLoader.fromArrayBuffer} to load a sound bank file.
 *
 * @group Sound Banks
 */
export class BasicSoundBank {
    /**
     * A Promise object indicating if the SF3/SF2Pack decoder is ready.
     * Make sure to await it if you are loading SF3/SF2Pack files.
     * It only needs to be awaited once, globally. Then all banks can be loaded synchronously.
     */
    public static ready: Promise<void> = StbVorbis.ready;

    /**
     * The custom modulator curves of the bank (SFe only), in the order they are written.
     * Like {@link samples}, every curve a modulator of this bank uses must be in this list.
     * A new bank holds the curves of its default modulators.
     */
    public customCurves: CustomCurve[] = [];

    /**
     * The metadata of this sound bank.
     */
    public soundBankInfo: SoundBankInfoData = {
        name: "Unnamed",
        creationDate: new Date(),
        software: "SpessaSynth",
        soundEngine: "E-mu 10K2",
        version: {
            major: 2,
            minor: 4
        }
    };

    /**
     * An array of all presets in the bank, ordered by program and bank number, with GM/GS drum presets last.
     */
    public presets: BasicPreset[] = [];

    /**
     * An array of all samples in the bank.
     */
    public samples: BasicSample[] = [];

    /**
     * An array of all instruments in the bank.
     */
    public instruments: BasicInstrument[] = [];
    /**
     * See {@link type}. A reader sets it once it knows how the file is read.
     */
    protected bankType: "sf2" | "dls" | "sfe";
    private storedDefaultModulators = new Array<Modulator>();
    /**
     * The default modulators without the superseded identical ones, computed on first use.
     */
    private latestDefaultModulators?: readonly Modulator[];

    /**
     * Creates an empty sound bank instance.
     * @param type The value to initialize the {@link BasicSoundBank.type} property with.
     * A new bank is an SFe bank unless told otherwise.
     * @param defaultModulators If the bank starts with its own copy of {@link SPESSASYNTH_DEFAULT_MODULATORS}
     * and their custom curves. A bank without them has no default modulators until some are assigned.
     */
    public constructor(
        type: "sf2" | "sfe" | "dls" = "sfe",
        defaultModulators = true
    ) {
        this.bankType = type;
        if (!defaultModulators) {
            return;
        }
        // The default modulators get their own copies of the curves, like any other curves of the bank
        const defaults = copyDefaultModulators();
        this.customCurves.push(...defaults.curves);
        this.defaultModulators = defaults.modulators;
    }

    /**
     * The type of the sound bank that was loaded.
     * Either `sf2` for SoundFont2/SoundFont3 or `dls` for DownLoadable Sounds or `sfe` for SF-Enhanced.
     *
     * > **Note**
     * >
     * > SF3 or SFOGG files are parsed as `sf2` files, but with compressed samples.
     * > The type is still `sf2`.
     * > An SFe file from before version 4 is read as SF2, and its type is `sf2` too.
     */
    public get type() {
        return this.bankType;
    }

    /**
     * Sound bank's default modulators.
     *
     * > **Tip**
     * >
     * > Consider reading [default modulators](../../../docs/extra/modulator-information.md#default-modulators).
     *
     * > **Warning**
     * >
     * > The envelope time modulators (CC 72, 73 and 75) use custom curves, which only SFe can store.
     * > If this list is changed and the bank is written as plain SF2, they are left out of the written list,
     * > and added back when it is loaded unless the list has another CC 72, 73 or 75 modulator.
     *
     * > **Note**
     * >
     * > Assign a new list to change it, so the custom curves it uses stay linked.
     * > A modulator can only be in one list or zone, assign copies to reuse them.
     *
     * > **Note**
     * >
     * > A bank loaded from SF2 or DLS has modulators here that are not in the file,
     * > see {@link BasicZone.modulators}.
     */
    public get defaultModulators(): readonly Modulator[] {
        return this.storedDefaultModulators;
    }

    public set defaultModulators(modulators: readonly Modulator[]) {
        // Check first, so a modulator that belongs elsewhere leaves the list as it was
        Modulator.checkAddable(modulators, this.storedDefaultModulators);
        for (const m of this.storedDefaultModulators) m.unlinkCurves();
        this.storedDefaultModulators = [...modulators];
        for (const m of this.storedDefaultModulators) m.linkCurves(this);
        this.latestDefaultModulators = undefined;
    }

    /**
     * The default modulators that apply: of identical ones, only the last (SFe 4.0, sections 7.3 and 7.4).
     * Cached, as every voice lookup needs it. The cache is cleared when the list is replaced or the bank is flushed.
     * @internal
     */
    public get effectiveDefaultModulators() {
        this.latestDefaultModulators ??= Modulator.getLatestOnly(
            this.storedDefaultModulators
        );
        return this.latestDefaultModulators;
    }

    private _isXGBank = false;

    /**
     * Checks for XG drum sets and considers if this sound bank is XG.
     */
    public get isXGBank() {
        return this._isXGBank;
    }

    /**
     * Merges sound banks with the given order.
     *
     * > **Note**
     * >
     * > The `soundBankInfo` and the default modulators are taken from the first sound bank.
     * > The input sound banks are not modified, but the merged bank shares
     * > the preset, instrument and sample objects with them.
     *
     * @param soundBanks The sound banks to merge. The first is used as a base, and the rest are
     * added on top.
     */
    public static mergeSoundBanks(
        ...soundBanks: BasicSoundBank[]
    ): BasicSoundBank {
        const mainSf = soundBanks[0];
        if (!mainSf) {
            throw new Error("No sound banks provided!");
        }
        const presets = [...mainSf.presets];
        for (const bank of soundBanks.slice(1)) {
            for (const newPreset of bank.presets) {
                if (
                    presets.every(
                        (existingPreset) => !newPreset.matches(existingPreset)
                    )
                ) {
                    presets.push(newPreset);
                }
            }
        }

        const b = new BasicSoundBank(mainSf.type, false);
        // The first bank's curves, except the ones only its default modulators use
        b.addCustomCurves(
            ...mainSf.customCurves.filter(
                (c) =>
                    c.useCount === 0 ||
                    c.linkedTo.some((user) => user !== mainSf)
            )
        );
        b.addCompletePresets(presets);
        b.soundBankInfo = { ...mainSf.soundBankInfo };
        // The defaults come from the first bank, with copies of their curves:
        // The merged bank links its own default modulators, which must not count as uses in the first bank
        const defaults = copyWithOwnCurves(mainSf.defaultModulators);
        b.addCustomCurves(...defaults.curves);
        b.defaultModulators = defaults.modulators;
        b.flush();
        return b;
    }

    /**
     * Copies a given sound bank, cloning all presets, instruments and samples.
     * The sample data is shared with the original, not copied.
     * Elements sharing a name are all copied, the repeats get a free name like `Piano-1`.
     * @param bank The sound bank to copy.
     */
    public static copyFrom(bank: BasicSoundBank) {
        // The defaults and their curves are copied from the bank
        const copied = new BasicSoundBank(bank.type, false);
        // One session, so shared instruments and samples are copied once
        // No reuse by name, same-named elements in the source are all copied
        const cloner = new SoundBankCloner(copied, {
            reuseByName: false,
            reuseChildren: "none"
        });
        // Curves first, so they keep their order (unused ones too)
        for (const c of bank.customCurves) cloner.cloneCustomCurve(c);
        for (const p of bank.presets) cloner.clonePreset(p);
        copied.soundBankInfo = { ...bank.soundBankInfo };
        const defaults = bank.defaultModulators.map((m) =>
            Modulator.copyFrom(m)
        );
        cloner.cloneCurvesOf(defaults);
        copied.defaultModulators = defaults;
        copied.flush();
        return copied;
    }

    /**
     * Creates a simple SF2 file with a single saw wave preset.
     * Useful for testing synthesizer's functionality without providing a file.
     * @returns The binary representation of the SF2 file.
     */
    public static getSampleSoundBankFile() {
        const font = new BasicSoundBank();
        const sampleData = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
            sampleData[i] = (i / 128) * 2 - 1;
        }
        const sample = new EmptySample();
        sample.name = "Saw";
        sample.originalKey = 65;
        sample.pitchCorrection = 20;
        sample.loopEnd = 128;
        sample.setAudioData(sampleData, 44_100);
        font.addSamples(sample);

        const inst = new BasicInstrument();
        inst.name = "Saw Wave";
        inst.globalZone.addGenerators(
            new Generator(GeneratorTypes.initialAttenuation, 150),
            new Generator(GeneratorTypes.releaseVolEnv, -1000),
            new Generator(GeneratorTypes.sampleModes, 1)
        );

        inst.createZone(sample);
        const zone2 = inst.createZone(sample);
        zone2.setGenerator(GeneratorTypes.fineTune, -9);

        font.addInstruments(inst);

        const preset = new BasicPreset(font);
        preset.name = "Saw Wave";
        preset.createZone(inst);

        font.addPresets(preset);

        font.soundBankInfo.name = "SpessaSynth Sample Sound Bank";
        font.flush();
        return font.writeSF2();
    }

    /**
     * Clears the cached {@link effectiveDefaultModulators}, after a default modulator was edited in place.
     * @internal
     */
    public clearDefaultModulatorCache() {
        this.latestDefaultModulators = undefined;
    }

    /**
     * Replaces the default modulators with new copies of {@link SPESSASYNTH_DEFAULT_MODULATORS}
     * and adds the custom curves they use. The curves that only the old list used are removed.
     */
    public resetDefaultModulators() {
        const oldCurves = new Array<CustomCurve>();
        collectCurves(this.defaultModulators, oldCurves);
        this.defaultModulators = [];
        this.customCurves = this.customCurves.filter(
            (c) => !oldCurves.includes(c) || c.useCount > 0
        );
        const defaults = copyDefaultModulators();
        this.addCustomCurves(...defaults.curves);
        this.defaultModulators = defaults.modulators;
    }

    /**
     * Adds complete presets along with their associated instruments and samples into this sound bank.
     * @param presets The presets to add.
     */
    public addCompletePresets(presets: BasicPreset[]) {
        this.addElements(this.presets, presets);
        const instrumentList: BasicInstrument[] = [];
        for (const preset of presets) {
            for (const zone of preset.zones) {
                if (
                    zone.instrument &&
                    !instrumentList.includes(zone.instrument)
                ) {
                    instrumentList.push(zone.instrument);
                }
            }
        }
        this.addElements(this.instruments, instrumentList);

        const sampleList: BasicSample[] = [];

        for (const instrument of instrumentList) {
            for (const zone of instrument.zones) {
                if (zone.sample && !sampleList.includes(zone.sample)) {
                    sampleList.push(zone.sample);
                }
            }
        }
        this.addElements(this.samples, sampleList);

        const curveList = new Array<CustomCurve>();
        for (const element of [...presets, ...instrumentList]) {
            collectCurves(element.globalZone.modulators, curveList);
            for (const zone of element.zones) {
                collectCurves(zone.modulators, curveList);
            }
        }
        this.addCustomCurves(...curveList);
    }

    /**
     * Adds {@link CustomCurve}s to this sound bank. Curves already in the bank are skipped.
     * @param curves The curves to add.
     */
    public addCustomCurves(...curves: CustomCurve[]) {
        for (const curve of curves) {
            if (!this.customCurves.includes(curve)) {
                this.customCurves.push(curve);
            }
        }
    }

    /**
     * Deletes a given custom curve from the sound bank.
     * @param curve The curve to delete.
     * @throws Error if a modulator still uses the curve.
     */
    public deleteCustomCurve(curve: CustomCurve) {
        const index = this.customCurves.indexOf(curve);
        if (index === -1) {
            throw new Error(
                `The curve "${curve.toString()}" does not belong to this sound bank.`
            );
        }
        if (curve.useCount > 0) {
            throw new Error(
                `The curve "${curve.toString()}" is still used by ${curve.useCount} modulator sources.`
            );
        }
        this.customCurves.splice(index, 1);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets the sound bank's sample format _in place_.
     *
     * > **Warning**
     * >
     * > Note that compressing (sample format `compressed`) usually results
     * > in permanent sample quality loss! Decompressing does not restore it.
     * > This method is memory and CPU intensive with large sound banks.
     *
     * @param options Options associated with setting the sample format.
     * @returns The samples whose sample rate or loop points changed.
     * Compressing resamples samples outside 8000 to 96000 Hz.
     * @throws Error if `rejectOnFailure` is set and one of the samples has failed to compress.
     */
    public async setSampleFormat(options: SetSampleFormatOptions) {
        const changed = new Array<BasicSample>();
        const failed = new Array<BasicSample>();
        let writtenCount = 0;
        const format = options.format;
        const progressFunc = options.progressFunction;
        // Linear async is faster here as the writing function usually uses a single WASM instance
        for (const s of this.samples) {
            switch (format) {
                default:
                case "pcm": {
                    // Uncompressed samples already write as s16le, decoding them would only waste memory
                    if (s.isCompressed) {
                        s.setAudioData(s.getAudioData(), s.sampleRate);
                    }
                    break;
                }

                case "compressed": {
                    const f = options.compressionFunction;
                    if (!f)
                        throw new Error(
                            `No compression function supplied but '${format}' was requested.`
                        );
                    const { sampleRate, loopStart, loopEnd } = s;
                    if (!(await s.compressSample(f))) {
                        failed.push(s);
                    }
                    if (
                        s.sampleRate !== sampleRate ||
                        s.loopStart !== loopStart ||
                        s.loopEnd !== loopEnd
                    ) {
                        changed.push(s);
                    }
                }
            }
            writtenCount++;
            progressFunc?.(writtenCount / this.samples.length);

            SpessaLog.info(
                `%cEncoded sample %c${writtenCount}. ${s.name}%c of %c${this.samples.length}%c. Compressed: %c${s.isCompressed}%c.`,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info,
                ConsoleColors.recognized,
                ConsoleColors.info,
                s.isCompressed
                    ? ConsoleColors.recognized
                    : ConsoleColors.unrecognized,
                ConsoleColors.info
            );
        }
        if (
            failed.length > 0 &&
            options.format === "compressed" &&
            options.rejectOnFailure
        ) {
            throw new Error(
                `Failed to compress ${failed.length} samples: ${failed.map((s) => s.name).join(", ")}`
            );
        }
        // The version is not touched: a writer decides it from what it writes
        return changed;
    }

    /**
     * Writes out a DLS Level 2 sound bank. This may not be 100% accurate.
     * Sample data is always written in the S16LE PCM encoding.
     *
     * > **Note**
     * >
     * > Consider reading about [the DLS conversion problem](../../../docs/extra/dls-conversion-problem.md).
     *
     * > **Warning**
     * >
     * > This method is memory and CPU intensive with large sound banks.
     *
     * @param options Options for writing the file.
     * @returns The binary representation of the file.
     */
    public writeDLS(
        options: Partial<SoundBankWriteOptions> = DEFAULT_DLS_OPTIONS
    ) {
        const pFunc = options.progressFunction;
        // First half (progress 0-0.5)
        const dls = DownloadableSounds.fromSF(
            this,
            pFunc ? (p: number) => pFunc(p / 2) : undefined
        );
        // Second half (progress 0.5-1)
        return dls.write({
            ...options,
            progressFunction: pFunc
                ? (p: number) => pFunc(0.5 + p / 2)
                : undefined
        });
    }

    /**
     * Writes the sound bank as an SF2 or SF3 file.
     *
     * > **Warning**
     * >
     * > This method is memory and CPU intensive with large sound banks,
     * > especially if compression is enabled.
     *
     * @param writeOptions Options for writing the file.
     * @returns The binary representation of the file.
     */
    public writeSF2(
        writeOptions: Partial<SoundFont2WriteOptions> = DEFAULT_SF2_WRITE_OPTIONS
    ) {
        const options = fillWithDefaults(
            writeOptions,
            DEFAULT_SF2_WRITE_OPTIONS
        );
        return writeSF(
            this,
            "sf2",
            options.software,
            options.writeDefaultModulators,
            options.writeExtendedLimits,
            false,
            options.progressFunction
        );
    }

    /**
     * Counts what the sound bank would lose if written as a plain SF2 file and read back:
     * the SFe generators, modulators, custom curves, alternating loops and bank LSBs.
     * What the SF2 reader recreates on its own is not counted, so an unchanged SF2 bank has no losses.
     * The one exception is an SF2 file that already has a `sampleModes` outside 0 to 3: 4 plays as an alternating loop
     * and is written as a forward loop, any other value is written as 0, and both are counted.
     * @returns The losses. All zeros means {@link writeSF2} keeps everything.
     */
    public getSF2Losses() {
        return getSF2LossesInternal(this);
    }

    /**
     * Writes the sound bank as an [SpessaSynth SFe](../../../docs/extra/sfe-format.md) file.
     * This enables features such as bank LSB and RIFF64.
     * Note that spessasynth is currently the only software that can read these files.
     * @param writeOptions Options for writing the file.
     * @returns The binary representation of the file.
     */
    public writeSFe(
        writeOptions: Partial<SFeWriteOptions> = DEFAULT_SFE_WRITE_OPTIONS
    ) {
        const options = fillWithDefaults(
            writeOptions,
            DEFAULT_SFE_WRITE_OPTIONS
        );
        return writeSF(
            this,
            "sfe",
            options.software,
            true,
            true,
            options.rf64,
            options.progressFunction
        );
    }

    /**
     * Adds {@link BasicPreset}s to this sound bank.
     * @param presets The presets to add.
     */
    public addPresets(...presets: BasicPreset[]) {
        this.addElements(this.presets, presets);
    }

    /**
     * Adds {@link BasicInstrument}s to this sound bank.
     * @param instruments The instruments to add.
     */
    public addInstruments(...instruments: BasicInstrument[]) {
        this.addElements(this.instruments, instruments);
    }

    /**
     * Adds {@link BasicSample}s to this sound bank.
     * @param samples The samples to add.
     */
    public addSamples(...samples: BasicSample[]) {
        this.addElements(this.samples, samples);
    }

    /**
     * Clones a sample into this bank, together with its stereo partner.
     *
     * > **Important**
     * >
     * > By default, if a sample with the same name already exists in the sound bank,
     * > it is returned instead and the new sample is not copied.
     * > Use the options or a {@link SoundBankCloner} to change that.
     *
     * @param sample The sample to copy.
     * @param options Options for cloning.
     * @returns The copied sample.
     */
    public cloneSample(
        sample: BasicSample,
        options?: Partial<SoundBankCloneOptions>
    ): BasicSample {
        return new SoundBankCloner(this, options).cloneSample(sample);
    }

    /**
     * Recursively clones an instrument into this sound bank, as well as its samples.
     *
     * > **Important**
     * >
     * > By default, if an instrument with the same name already exists in the sound bank,
     * > it is returned instead and the new instrument is not copied.
     * > Use the options or a {@link SoundBankCloner} to change that.
     *
     * @param instrument The instrument to copy.
     * @param options Options for cloning.
     * @returns The copied instrument.
     */
    public cloneInstrument(
        instrument: BasicInstrument,
        options?: Partial<SoundBankCloneOptions>
    ): BasicInstrument {
        return new SoundBankCloner(this, options).cloneInstrument(instrument);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Recursively clones a preset into this sound bank, as well as its instruments and samples.
     *
     * > **Important**
     * >
     * > By default, if a preset with the same name already exists in the sound bank,
     * > it is returned instead and the new preset is not copied.
     * > Use the options or a {@link SoundBankCloner} to change that.
     *
     * @param preset The preset to copy.
     * @param options Options for cloning.
     * @returns The copied preset.
     */
    public clonePreset(
        preset: BasicPreset,
        options?: Partial<SoundBankCloneOptions>
    ): BasicPreset {
        return new SoundBankCloner(this, options).clonePreset(preset);
    }

    /**
     * Updates internal values. Call after updating the preset list.
     * @param sort If the presets should be sorted. Set it to `false` to keep a custom order,
     * only the internal values (like {@link isXGBank}) are then recomputed.
     */
    public flush(sort = true) {
        // A modulator of the list may have been edited in place
        this.latestDefaultModulators = undefined;
        if (sort) {
            this.presets.sort(MIDIPatchTools.compare.bind(MIDIPatchTools));
        }
        this.parseInternal();
    }

    /**
     * Trims the sound bank _in-place_ to only contain samples in a given MIDI file.
     *
     * Absent presets will be removed from the sound bank,
     * and samples that don't get activated in the remaining presets will be removed as well.
     *
     * > **Note**
     * >
     * > This exact type is returned from {@link BasicMIDI.getUsedProgramsAndKeys}.
     * > Consider reading the page for more explanation about the parameter.
     *
     * @param presetData A `Map`: `BasicPreset` -> `Map<MIDI note, Set<velocity>>`.
     * Absent presets will be removed from the sound bank,
     * and samples that don't get activated in the remaining presets will be removed as well.
     */
    public trim<T extends MIDIPatchFull>(
        presetData: PresetsWithKeyCombinations<T>
    ) {
        const trimInstrumentZones = (
            instrument: BasicInstrument,
            keyCombos: Map<number, Set<number>>
        ): number => {
            let trimmedIZones = 0;
            for (
                let iZoneIndex = 0;
                iZoneIndex < instrument.zones.length;
                iZoneIndex++
            ) {
                const iZone = instrument.zones[iZoneIndex];
                const iKeyRange = iZone.keyRange;
                const iVelRange = iZone.velRange;
                let isIZoneUsed = false;
                for (const [key, velocities] of keyCombos) {
                    // Check if the key range matches and if any of the velocities match as well
                    if (
                        key >= iKeyRange.min &&
                        key <= iKeyRange.max &&
                        [...velocities].some(
                            (velocity) =>
                                velocity >= iVelRange.min &&
                                velocity <= iVelRange.max
                        )
                    ) {
                        isIZoneUsed = true;
                        break;
                    }
                }
                if (isIZoneUsed) {
                    continue;
                }

                SpessaLog.info(
                    `%c${iZone.sample.name}%c removed from %c${instrument.name}%c.`,
                    ConsoleColors.recognized,
                    ConsoleColors.info,
                    ConsoleColors.recognized,
                    ConsoleColors.info
                );
                if (instrument.deleteZone(iZoneIndex)) {
                    trimmedIZones++;
                    iZoneIndex--;
                    SpessaLog.info(
                        `%c${iZone.sample.name}%c deleted`,
                        ConsoleColors.recognized,
                        ConsoleColors.info
                    );
                }
                if (iZone.sample.useCount < 1) {
                    this.deleteSample(iZone.sample);
                }
            }
            return trimmedIZones;
        };

        SpessaLog.groupCollapsed(
            "%cTrimming sound bank...",
            ConsoleColors.info
        );

        SpessaLog.info("Combinations to trim for:", presetData);
        // Modify the sound bank to only include programs and samples that are used
        for (
            let presetIndex = 0;
            presetIndex < this.presets.length;
            presetIndex++
        ) {
            const p = this.presets[presetIndex];
            // T may be a virtual preset (GS user drum set) or a regular BasicPreset, ignore cast because we only care about basic presets anyway
            const keyCombos = presetData.get(p as unknown as T);
            if (keyCombos === undefined) {
                SpessaLog.info(
                    `%cDeleting preset %c${p.name}%c and its zones`,
                    ConsoleColors.info,
                    ConsoleColors.recognized,
                    ConsoleColors.info
                );
                this.deletePreset(p);
                presetIndex--;
            } else {
                SpessaLog.groupCollapsed(
                    `%cTrimming %c${p.name}`,
                    ConsoleColors.info,
                    ConsoleColors.recognized
                );
                SpessaLog.info(`Keys for ${p.name}:`, keyCombos);
                let trimmedZones = 0;
                // Clean the preset to only use zones that are used
                for (
                    let zoneIndex = 0;
                    zoneIndex < p.zones.length;
                    zoneIndex++
                ) {
                    const zone = p.zones[zoneIndex];
                    const keyRange = zone.keyRange;
                    const velRange = zone.velRange;

                    // Check if any of the combos matches the zone
                    let isZoneUsed = false;
                    for (const [key, velocities] of keyCombos) {
                        // Check if the key range matches and if any of the velocities match as well
                        if (
                            key >= keyRange.min &&
                            key <= keyRange.max &&
                            [...velocities].some(
                                (velocity) =>
                                    velocity >= velRange.min &&
                                    velocity <= velRange.max
                            )
                        ) {
                            // Zone is used, trim the instrument zones
                            isZoneUsed = true;
                            const trimmedIZones = trimInstrumentZones(
                                zone.instrument,
                                keyCombos
                            );
                            SpessaLog.info(
                                `%cTrimmed off %c${trimmedIZones}%c instrument zones from %c${zone.instrument.name}`,
                                ConsoleColors.info,
                                ConsoleColors.recognized,
                                ConsoleColors.info,
                                ConsoleColors.recognized
                            );
                            break;
                        }
                    }
                    if (isZoneUsed) {
                        continue;
                    }

                    trimmedZones++;
                    p.deleteZone(zoneIndex);
                    if (zone.instrument.useCount < 1) {
                        this.deleteInstrument(zone.instrument);
                    }
                    zoneIndex--;
                }
                SpessaLog.info(
                    `%cTrimmed off %c${trimmedZones}%c preset zones from %c${p.name}`,
                    ConsoleColors.info,
                    ConsoleColors.recognized,
                    ConsoleColors.info,
                    ConsoleColors.recognized
                );
                SpessaLog.groupEnd();
            }
        }
        this.removeUnusedElements();

        SpessaLog.info("%cSound bank modified!", ConsoleColors.recognized);
        SpessaLog.groupEnd();
    }

    /**
     * Removes all {@link BasicSample}s and {@link BasicInstrument}s not used by any {@link BasicPreset},
     * and all {@link customCurves} no modulator uses.
     */
    public removeUnusedElements() {
        this.instruments = this.instruments.filter((i) => {
            i.deleteUnusedZones();
            const deletable = i.useCount < 1;
            if (deletable) {
                i.delete();
            }
            return !deletable;
        });
        this.samples = this.samples.filter((s) => {
            const deletable = s.useCount < 1;
            if (deletable) {
                s.unlinkSample();
            }
            return !deletable;
        });
        // Counted from the modulators, not from the links, so a curve in use is never removed
        const used = new Array<CustomCurve>();
        collectCurves(this.defaultModulators, used);
        for (const element of [...this.presets, ...this.instruments]) {
            for (const zone of [element.globalZone, ...element.zones])
                collectCurves(zone.modulators, used);
        }
        const usedSet = new Set(used);
        this.customCurves = this.customCurves.filter((c) => usedSet.has(c));
    }

    /**
     * Deletes a given instrument from the sound bank.
     * @param instrument The instrument to delete.
     */
    public deleteInstrument(instrument: BasicInstrument) {
        const index = this.instruments.indexOf(instrument);
        if (index === -1) {
            throw new Error(
                `The instrument "${instrument.name}" does not belong to this sound bank.`
            );
        }
        instrument.delete();
        this.instruments.splice(index, 1);
    }

    /**
     * Deletes a given preset from the sound bank.
     * @param preset The preset to delete.
     */
    public deletePreset(preset: BasicPreset) {
        const index = this.presets.indexOf(preset);
        if (index === -1) {
            throw new Error(
                `The preset "${preset.name}" does not belong to this sound bank.`
            );
        }
        preset.delete();
        this.presets.splice(index, 1);
    }

    /**
     * Deletes a given sample from the sound bank.
     * @param sample The sample to delete.
     */
    public deleteSample(sample: BasicSample) {
        const index = this.samples.indexOf(sample);
        if (index === -1) {
            throw new Error(
                `The sample "${sample.name}" does not belong to this sound bank.`
            );
        }
        sample.unlinkSample();
        this.samples.splice(index, 1);
    }

    /**
     * Returns the matching {@link BasicPreset} instance.
     * This uses the {@link MIDIPatchTools.selectPatch} algorithm for selecting the optimal preset.
     * @param patch The patch to select.
     * @param system The MIDI system to select for. If you're unsure, pick `gs`.
     * @returns The selected preset.
     */
    public getPreset(patch: MIDIPatch, system: MIDISystem): BasicPreset {
        return MIDIPatchTools.selectPatch(this.presets, patch, system);
    }

    /**
     * Deletes everything irreversibly.
     */
    public destroySoundBank() {
        this.presets.length = 0;
        this.instruments.length = 0;
        this.samples.length = 0;
        this.defaultModulators = [];
        this.customCurves.length = 0;
    }

    protected addElements<T>(list: T[], elements: readonly T[]) {
        // We do it this way because we can have a lot of presets and spread operator is not good for that
        for (const element of elements) {
            list.push(element);
        }
    }

    protected parsingError(error: string): never {
        throw new Error(
            `SF parsing error: ${error} The file may be corrupted.`
        );
    }

    /**
     * Parses the bank after loading is done
     * @protected
     */
    protected parseInternal() {
        this._isXGBank = false;
        // Definitions for XG:
        // At least one preset with bank 127 or 120 (see isXGDrum)
        // MUST be a valid XG bank.
        // Allowed banks: (see XG specification)
        // Note: XG spec numbers the programs from 1...
        const allowedPrograms = new Set([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 24, 25, 26, 27, 28, 29, 30,
            31, 32, 33, 40, 41, 48, 56, 57, 58, 64, 65, 66, 126, 127
        ]);
        for (const preset of this.presets) {
            if (!BankSelectHacks.isXGDrum(preset.bankMSB)) {
                continue;
            }

            this._isXGBank = true;
            if (!allowedPrograms.has(preset.program)) {
                // Not valid!
                this._isXGBank = false;
                SpessaLog.info(
                    `%cThis bank is not valid XG. Preset %c${preset.toString()}%c is not a valid XG drum. XG mode will use presets on bank 128.`,
                    ConsoleColors.info,
                    ConsoleColors.value,
                    ConsoleColors.info
                );
                break;
            }
        }
    }

    protected printInfo() {
        for (const [info, value] of Object.entries(this.soundBankInfo)) {
            if (typeof value === "object" && "major" in value) {
                const v = value as SF2VersionTag;
                SpessaLog.info(
                    `%c${info}: %c"${v.major}.${v.minor}"`,
                    ConsoleColors.info,
                    ConsoleColors.recognized
                );
            } else
                SpessaLog.info(
                    `%c${info}: %c${(value as string | Date).toLocaleString()}`,
                    ConsoleColors.info,
                    ConsoleColors.recognized
                );
        }
    }
}

function collectCurves(modulators: readonly Modulator[], list: CustomCurve[]) {
    for (const m of modulators) {
        for (const curve of [m.primarySource.curve, m.secondarySource.curve]) {
            if (curve instanceof CustomCurve && !list.includes(curve)) {
                list.push(curve);
            }
        }
    }
}

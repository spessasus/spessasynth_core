import { SpessaLog } from "../../utils/loggin";
import { ConsoleColors } from "../../utils/other";
import {
    DEFAULT_SF2_WRITE_OPTIONS,
    DEFAULT_SFE_WRITE_OPTIONS,
    writeSF2Internal,
    writeSFEInternal
} from "../soundfont/write/write";
import { Modulator, SPESSASYNTH_DEFAULT_MODULATORS } from "./modulator";
import { BasicSample, EmptySample } from "./basic_sample";
import { BasicInstrument } from "./basic_instrument";
import { BasicPreset } from "./basic_preset";
import { BankSelectHacks } from "../../utils/midi_hacks";

import type {
    MIDISystem,
    PresetsWithKeyCombinations,
    SetSampleFormatOptions,
    SF2VersionTag,
    SFEWriteOptions,
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
import { StbVorbis } from "stb-vorbis";

/**
 * This module handles parsing and writing SoundFont2 (`.sf2`, `.sf3` and `.sfogg`) files.
 * It represents a single sound bank.
 *
 * It also contains support for `.dls` files and experimental read and write support for [64-bit SFE](https://github.com/SFe-Team-was-taken/SFE).
 *

 * **Specifications:**
 *
 * - [SoundFont2 Specification](http://www.synthfont.com/sfspec24.pdf)
 * - [SoundFont3 Description](https://www.fluidsynth.org/wiki/SoundFont3Format)
 * - [DLS Level 2 Specification](https://midi.org/dls)
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
     * The type of the sound bank that was loaded.
     * Either `sf2` for SoundFont2/SoundFont3 or `dls` for DownLoadable Sounds or `sfe` for SF-Enhanced.
     *
     * > **Note**
     * >
     * > SF3 or SFOGG files are parsed as `sf2` files, but with compressed samples.
     * > The type is still `sf2`.
     */
    public readonly type: "sf2" | "dls" | "sfe";

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
     * An array of all presets in the bank, ordered by bank and preset number.
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
     * Sound bank's default modulators.
     *
     * > **Tip**
     * >
     * > Consider reading [default modulators](../../../docs/extra/modulator-information.md#default-modulators).
     */
    public defaultModulators: Modulator[] = SPESSASYNTH_DEFAULT_MODULATORS.map(
        Modulator.copyFrom.bind(Modulator)
    );

    /**
     * If the sound bank has custom default modulators (DMOD).
     *
     * > **Tip**
     * >
     * > Consider reading the [default modulators proposal](https://github.com/spessasus/soundfont-proposals/blob/main/default_modulators.md).
     */
    public customDefaultModulators = false;

    /**
     * Creates an empty sound bank instance.
     * @param type The value to initialize the {@link BasicSoundBank.type} property with.
     */
    public constructor(type: "sf2" | "sfe" | "dls" = "sf2") {
        this.type = type;
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
     * > The `soundBankInfo` is taken from the first sound bank.
     *
     * @param soundBanks The sound banks to merge. The first is used as a base, and the rest are
     * added on top.
     */
    public static mergeSoundBanks(
        ...soundBanks: BasicSoundBank[]
    ): BasicSoundBank {
        const mainSf = soundBanks.shift();
        if (!mainSf) {
            throw new Error("No sound banks provided!");
        }
        const presets = mainSf.presets;
        while (soundBanks.length > 0) {
            const newPresets = soundBanks?.shift()?.presets;
            if (newPresets) {
                for (const newPreset of newPresets) {
                    if (
                        !presets.some((existingPreset) =>
                            newPreset.matches(existingPreset)
                        )
                    ) {
                        presets.push(newPreset);
                    }
                }
            }
        }

        const b = new BasicSoundBank();
        b.addCompletePresets(presets);
        b.soundBankInfo = { ...mainSf.soundBankInfo };
        return b;
    }

    /**
     * Creates a simple sound bank with a single saw wave preset.
     * Useful for testing synthesizer's functionality without providing a file.
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
            new Generator(GeneratorTypes.initialAttenuation, 375),
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
     * Copies a given sound bank, deeply cloning all presets instruments and samples.
     * @param bank The sound bank to copy.
     */
    public static copyFrom(bank: BasicSoundBank) {
        const copied = new BasicSoundBank();
        for (const p of bank.presets) copied.clonePreset(p);
        copied.soundBankInfo = { ...bank.soundBankInfo };
        return copied;
    }

    /**
     * Adds complete presets along with their associated instruments and samples into this sound bank.
     * @param presets The presets to add.
     */
    public addCompletePresets(presets: BasicPreset[]) {
        this.addPresets(...presets);
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
        this.addInstruments(...instrumentList);

        const sampleList: BasicSample[] = [];

        for (const instrument of instrumentList) {
            for (const zone of instrument.zones) {
                if (zone.sample && !sampleList.includes(zone.sample)) {
                    sampleList.push(zone.sample);
                }
            }
        }
        this.addSamples(...sampleList);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Sets the sound bank's sample format _in place_.
     *
     * > **Warning**
     * >
     * > Note that decompressing (sample format `pcm`) usually results
     * > in permanent sample quality loss!
     * > This method is memory and CPU intensive with large sound banks.
     *
     * @param options Options associated with setting the sample format.
     */
    public async setSampleFormat(options: SetSampleFormatOptions) {
        let writtenCount = 0;
        const format = options.format;
        const progressFunc = options.progressFunction;
        // Linear async is faster here as the writing function usually uses a single WASM instance
        for (const s of this.samples) {
            switch (format) {
                default:
                case "pcm": {
                    s.setAudioData(s.getAudioData(), s.sampleRate);
                    break;
                }

                case "compressed": {
                    const f = options.compressionFunction;
                    if (!f)
                        throw new Error(
                            `No compression function supplied but '${format}' was requested.`
                        );
                    await s.compressSample(f);
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
        // Change format
        switch (format) {
            default:
            case "pcm": {
                // Set version to 2.4
                this.soundBankInfo.version.major = 2;
                this.soundBankInfo.version.minor = 4;
                break;
            }

            case "compressed": {
                // Set version to 3
                this.soundBankInfo.version.major = 3;
                this.soundBankInfo.version.minor = 0;
            }
        }
    }

    /**
     * Writes out a DLS Level 2 sound bank. This may not be 100% accurate.
     * Samples data is always written in the S16LE PCM encoding.
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
        return writeSF2Internal(this, writeOptions);
    }

    /**
     * Writes the sound bank as an [SFE 4](https://sfe-team-was-taken.github.io/SFE/) file.
     * This enables features such as bank LSB and RIFF64.
     * Note that spessasynth is currently the only software that can read these files.
     * @param writeOptions Options for writing the file.
     * @returns The binary representation of the file.
     */
    public writeSFE(
        writeOptions: Partial<SFEWriteOptions> = DEFAULT_SFE_WRITE_OPTIONS
    ) {
        return writeSFEInternal(this, writeOptions);
    }

    /**
     * Adds {@link BasicPreset}s to this sound bank.
     * @param presets The presets to add.
     */
    public addPresets(...presets: BasicPreset[]) {
        this.presets.push(...presets);
    }

    /**
     * Adds {@link BasicInstrument}s to this sound bank.
     * @param instruments The instruments to add.
     */
    public addInstruments(...instruments: BasicInstrument[]) {
        this.instruments.push(...instruments);
    }

    /**
     * Adds {@link BasicSample}s to this sound bank.
     * @param samples The samples to add.
     */
    public addSamples(...samples: BasicSample[]) {
        this.samples.push(...samples);
    }

    /**
     * Clones a sample into this bank.
     *
     * > **Important**
     * >
     * > If a sample with the same name already exists in the sound bank,
     * > it is returned instead and the new sample is not copied.
     *
     * @param sample The sample to copy.
     * @returns The copied sample.
     */
    public cloneSample(sample: BasicSample): BasicSample {
        const duplicate = this.samples.find((s) => s.name === sample.name);
        if (duplicate) {
            return duplicate;
        }
        const newSample = new BasicSample(
            sample.name,
            sample.sampleRate,
            sample.originalKey,
            sample.pitchCorrection,
            sample.sampleType,
            sample.loopStart,
            sample.loopEnd
        );
        if (sample.isCompressed) {
            newSample.setCompressedData(sample.getRawData(true));
        } else {
            newSample.setAudioData(sample.getAudioData(), sample.sampleRate);
        }
        this.addSamples(newSample);
        if (sample.linkedSample) {
            const clonedLinked = this.cloneSample(sample.linkedSample);
            // Sanity check
            if (!clonedLinked.linkedSample) {
                newSample.setLinkedSample(clonedLinked, newSample.sampleType);
            }
        }
        return newSample;
    }

    /**
     * Recursively clones an instrument into this sound bank, as well as its samples.
     *
     * > **Important**
     * >
     * > If an instrument with the same name already exists in the sound bank,
     * > it is returned instead and the new instrument is not copied.
     *
     * @param instrument The instrument to copy.
     * @returns The copied instrument.
     */
    public cloneInstrument(instrument: BasicInstrument): BasicInstrument {
        const duplicate = this.instruments.find(
            (i) => i.name === instrument.name
        );
        if (duplicate) {
            return duplicate;
        }
        const newInstrument = new BasicInstrument();
        newInstrument.name = instrument.name;
        newInstrument.globalZone.copyFrom(instrument.globalZone);
        for (const zone of instrument.zones) {
            const copiedZone = newInstrument.createZone(
                this.cloneSample(zone.sample)
            );
            copiedZone.copyFrom(zone);
        }
        this.addInstruments(newInstrument);
        return newInstrument;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Recursively clones a preset into this sound bank, as well as its instruments and samples.
     *
     * > **Important**
     * >
     * > If a preset with the same name already exists in the sound bank,
     * > it is returned instead and the new preset is not copied.
     *
     * @param preset The preset to copy.
     * @returns The copied preset.
     */
    public clonePreset(preset: BasicPreset): BasicPreset {
        const duplicate = this.presets.find((p) => p.name === preset.name);
        if (duplicate) {
            return duplicate;
        }
        const newPreset = new BasicPreset(this);
        newPreset.name = preset.name;
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
                this.cloneInstrument(zone.instrument)
            );
            copiedZone.copyFrom(zone);
        }

        this.addPresets(newPreset);
        return newPreset;
    }

    /**
     * Updates internal values. Call after updating the preset list.
     */
    public flush() {
        this.presets.sort(MIDIPatchTools.compare.bind(MIDIPatchTools));
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
     * > This exact type is returned from {@link BasicMIDI.getUsedProgramsAndKeys}
     * > Consider reading the page for more explanation about the parameter.
     *
     * @param presetData - A `Map`: `BasicPreset` -> `Set<"key-velocity">`.
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
                if (!isIZoneUsed) {
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
                    if (!isZoneUsed) {
                        trimmedZones++;
                        p.deleteZone(zoneIndex);
                        if (zone.instrument.useCount < 1) {
                            this.deleteInstrument(zone.instrument);
                        }
                        zoneIndex--;
                    }
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
     * Removes all {@link BasicSample}s and {@link BasicInstrument}s not used by any {@link BasicPreset}.
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
    }

    /**
     * Deletes a given instrument from the sound bank.
     * @param instrument The instrument to delete.
     */
    public deleteInstrument(instrument: BasicInstrument) {
        instrument.delete();
        this.instruments.splice(this.instruments.indexOf(instrument), 1);
    }

    /**
     * Deletes a given preset from the sound bank.
     * @param preset The preset to delete.
     */
    public deletePreset(preset: BasicPreset) {
        preset.delete();
        this.presets.splice(this.presets.indexOf(preset), 1);
    }

    /**
     * Deletes a given sample from the sound bank.
     * @param sample The sample to delete.
     */
    public deleteSample(sample: BasicSample) {
        sample.unlinkSample();
        this.samples.splice(this.samples.indexOf(sample), 1);
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
    }

    protected parsingError(error: string) {
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
        // At least one preset with bank 127, 126 or 120
        // MUST be a valid XG bank.
        // Allowed banks: (see XG specification)
        // Note: XG spec numbers the programs from 1...
        const allowedPrograms = new Set([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 24, 25, 26, 27, 28, 29, 30,
            31, 32, 33, 40, 41, 48, 56, 57, 58, 64, 65, 66, 126, 127
        ]);
        for (const preset of this.presets) {
            if (BankSelectHacks.isXGDrum(preset.bankMSB)) {
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

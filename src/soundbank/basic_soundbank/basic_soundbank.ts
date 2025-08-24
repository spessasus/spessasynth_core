import { SpessaSynthGroup, SpessaSynthGroupCollapsed, SpessaSynthGroupEnd, SpessaSynthInfo } from "../../utils/loggin";
import { consoleColors } from "../../utils/other";
import { DEFAULT_SF2_WRITE_OPTIONS, writeSF2Internal } from "./write_sf2/write";
import { Modulator, SPESSASYNTH_DEFAULT_MODULATORS } from "./modulator";
import { DEFAULT_DLS_OPTIONS, writeDLSInternal } from "./write_dls/write_dls";
import { BasicSample, EmptySample } from "./basic_sample";
import { Generator } from "./generator";
import { BasicInstrument } from "./basic_instrument";
import { BasicPreset } from "./basic_preset";
import { isXGDrums } from "../../utils/xg_hacks";
import { stbvorbis } from "../../externals/stbvorbis_sync/stbvorbis_wrapper";
import type { BasicMIDI } from "../../midi/basic_midi";

import type { DLSWriteOptions, SF2VersionTag, SoundBankInfoData, SoundFont2WriteOptions } from "../types";
import { generatorTypes } from "./generator_types";
import type { SynthSystem } from "../../synthesizer/types";
import { selectPreset } from "./preset_selector";
import type { MIDIPatch } from "./midi_patch";

/**
 * Represents a single sound bank, be it DLS or SF2.
 */
export class BasicSoundBank {
    /**
     * Indicates if the SF3/SF2Pack decoder is ready.
     */
    public static isSF3DecoderReady: Promise<boolean> = stbvorbis.isInitialized;

    /**
     * Sound bank's info.
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
     * The sound bank's presets.
     */
    public presets: BasicPreset[] = [];

    /**
     * The sound bank's samples.
     */
    public samples: BasicSample[] = [];

    /**
     * The sound bank's instruments.
     */
    public instruments: BasicInstrument[] = [];

    /**
     * Sound bank's default modulators.
     */
    public defaultModulators: Modulator[] = SPESSASYNTH_DEFAULT_MODULATORS.map(
        (m) => Modulator.copy(m)
    );

    /**
     * If the sound bank has custom default modulators (DMOD).
     */
    public customDefaultModulators = false;

    private _isXGBank = false;

    /**
     * Checks for XG drum sets and considers if this soundfont is XG.
     */
    public get isXGBank() {
        return this._isXGBank;
    }

    /**
     * Merges soundfonts with the given order. Keep in mind that the info read is copied from the first one
     * @param soundBanks the soundfonts to merge, the first overwrites the last
     */
    public static mergeSoundBanks(
        ...soundBanks: BasicSoundBank[]
    ): BasicSoundBank {
        const mainSf = soundBanks.shift();
        if (!mainSf) {
            throw new Error("No sound banks provided!");
        }
        const presets = mainSf.presets;
        while (soundBanks.length) {
            const newPresets = soundBanks?.shift()?.presets;
            if (newPresets) {
                newPresets.forEach((newPreset) => {
                    if (
                        presets.find((existingPreset) =>
                            newPreset.isPatchNumberEqual(existingPreset)
                        ) === undefined
                    ) {
                        presets.push(newPreset);
                    }
                });
            }
        }

        const b = new BasicSoundBank();
        b.addCompletePresets(presets);
        b.soundBankInfo = { ...mainSf.soundBankInfo };
        return b;
    }

    /**
     * Creates a simple soundfont with one saw wave preset.
     */
    public static async getSampleSoundBankFile(): Promise<ArrayBuffer> {
        const font = new BasicSoundBank();
        const sampleData = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
            sampleData[i] = (i / 128) * 2 - 1;
        }
        const sample = new EmptySample();
        sample.name = "Saw";
        sample.originalKey = 65;
        sample.pitchCorrection = 20;
        sample.loopEnd = 127;
        sample.setAudioData(sampleData, 44100);
        font.addSamples(sample);

        const inst = new BasicInstrument();
        inst.name = "Saw Wave";
        inst.globalZone.addGenerators(
            new Generator(generatorTypes.initialAttenuation, 375),
            new Generator(generatorTypes.releaseVolEnv, -1000),
            new Generator(generatorTypes.sampleModes, 1)
        );

        inst.createZone(sample);
        const zone2 = inst.createZone(sample);
        zone2.addGenerators(new Generator(generatorTypes.fineTune, -9));

        font.addInstruments(inst);

        const preset = new BasicPreset(font);
        preset.name = "Saw Wave";
        preset.createZone(inst);

        font.addPresets(preset);

        font.soundBankInfo.name = "Dummy";
        font.flush();
        return await font.writeSF2();
    }

    /**
     * Copies a given sound bank.
     * @param bank The sound bank to copy.
     */
    public static copyFrom(bank: BasicSoundBank) {
        const copied = new BasicSoundBank();
        bank.presets.forEach((p) => copied.clonePreset(p));
        copied.soundBankInfo = { ...bank.soundBankInfo };
        return copied;
    }

    /**
     * Adds complete presets along with their instruments and samples.
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

    /**
     * Write the soundfont as a .dls file. This may not be 100% accurate.
     * @param options - options for writing the file.
     * @returns the binary file.
     */
    public async writeDLS(
        options: Partial<DLSWriteOptions> = DEFAULT_DLS_OPTIONS
    ): Promise<ArrayBuffer> {
        return writeDLSInternal(this, options);
    }

    /**
     * Writes the sound bank as an SF2 file.
     * @param writeOptions the options for writing.
     * @returns the binary file data.
     */
    public async writeSF2(
        writeOptions: Partial<SoundFont2WriteOptions> = DEFAULT_SF2_WRITE_OPTIONS
    ): Promise<ArrayBuffer> {
        return writeSF2Internal(this, writeOptions);
    }

    public addPresets(...presets: BasicPreset[]) {
        this.presets.push(...presets);
    }

    public addInstruments(...instruments: BasicInstrument[]) {
        this.instruments.push(...instruments);
    }

    public addSamples(...samples: BasicSample[]) {
        this.samples.push(...samples);
    }

    /**
     * Clones samples into this bank
     * @param sample samples to copy
     * @returns copied sample, if a sample exists with that name, it is returned instead
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
     * Clones an instruments into this bank
     * @returns the copied instrument, if an instrument exists with that name, it is returned instead
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
     * Clones presets into this sound bank
     * @returns the copied preset, if a preset exists with that name, it is returned instead
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

    public flush() {
        this.presets.sort((a, b) => {
            // Force drum presets to be last
            if (a.isGMGSDrum && !b.isGMGSDrum) return 1;
            if (!a.isGMGSDrum && b.isGMGSDrum) return -1;

            // First, sort by program
            if (a.program !== b.program) {
                return a.program - b.program;
            }

            // Next, sort by bankMSB
            if (a.bankMSB !== b.bankMSB) {
                return a.bankMSB - b.bankMSB;
            }

            // Finally, sort by bankLSB
            return a.bankLSB - b.bankLSB;
        });
        this.parseInternal();
    }

    /**
     * Trims a sound bank to only contain samples in a given MIDI file
     * @param mid {BasicMIDI} - the MIDI file
     */
    public trimSoundBank(mid: BasicMIDI) {
        const trimInstrumentZones = (
            instrument: BasicInstrument,
            combos: { key: number; velocity: number }[]
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
                for (const iCombo of combos) {
                    if (
                        iCombo.key >= iKeyRange.min &&
                        iCombo.key <= iKeyRange.max &&
                        iCombo.velocity >= iVelRange.min &&
                        iCombo.velocity <= iVelRange.max
                    ) {
                        isIZoneUsed = true;
                        break;
                    }
                }
                if (!isIZoneUsed && iZone.sample) {
                    SpessaSynthInfo(
                        `%c${iZone.sample.name}%c removed from %c${instrument.name}%c.`,
                        consoleColors.recognized,
                        consoleColors.info,
                        consoleColors.recognized,
                        consoleColors.info
                    );
                    if (instrument.deleteZone(iZoneIndex)) {
                        trimmedIZones++;
                        iZoneIndex--;
                        SpessaSynthInfo(
                            `%c${iZone.sample.name}%c deleted`,
                            consoleColors.recognized,
                            consoleColors.info
                        );
                    }
                    if (iZone.sample.useCount < 1) {
                        this.deleteSample(iZone.sample);
                    }
                }
            }
            return trimmedIZones;
        };

        SpessaSynthGroup("%cTrimming sound bank...", consoleColors.info);
        const usedProgramsAndKeys = mid.getUsedProgramsAndKeys(this);

        SpessaSynthGroupCollapsed(
            "%cModifying sound bank...",
            consoleColors.info
        );
        SpessaSynthInfo("Detected keys for midi:", usedProgramsAndKeys);
        // Modify the sound bank to only include programs and samples that are used
        for (
            let presetIndex = 0;
            presetIndex < this.presets.length;
            presetIndex++
        ) {
            const p = this.presets[presetIndex];
            const used = usedProgramsAndKeys.get(p);
            if (used === undefined) {
                SpessaSynthInfo(
                    `%cDeleting preset %c${p.name}%c and its zones`,
                    consoleColors.info,
                    consoleColors.recognized,
                    consoleColors.info
                );
                this.deletePreset(p);
                presetIndex--;
            } else {
                const combos = [...used].map((s) => {
                    const split = s.split("-");
                    return {
                        key: parseInt(split[0]),
                        velocity: parseInt(split[1])
                    };
                });
                SpessaSynthGroupCollapsed(
                    `%cTrimming %c${p.name}`,
                    consoleColors.info,
                    consoleColors.recognized
                );
                SpessaSynthInfo(`Keys for ${p.name}:`, combos);
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
                    for (const combo of combos) {
                        if (
                            combo.key >= keyRange.min &&
                            combo.key <= keyRange.max &&
                            combo.velocity >= velRange.min &&
                            combo.velocity <= velRange.max &&
                            zone.instrument
                        ) {
                            // Zone is used, trim the instrument zones
                            isZoneUsed = true;
                            const trimmedIZones = trimInstrumentZones(
                                zone.instrument,
                                combos
                            );
                            SpessaSynthInfo(
                                `%cTrimmed off %c${trimmedIZones}%c zones from %c${zone.instrument.name}`,
                                consoleColors.info,
                                consoleColors.recognized,
                                consoleColors.info,
                                consoleColors.recognized
                            );
                            break;
                        }
                    }
                    if (!isZoneUsed && zone.instrument) {
                        trimmedZones++;
                        p.deleteZone(zoneIndex);
                        if (zone.instrument.useCount < 1) {
                            this.deleteInstrument(zone.instrument);
                        }
                        zoneIndex--;
                    }
                }
                SpessaSynthInfo(
                    `%cTrimmed off %c${trimmedZones}%c zones from %c${p.name}`,
                    consoleColors.info,
                    consoleColors.recognized,
                    consoleColors.info,
                    consoleColors.recognized
                );
                SpessaSynthGroupEnd();
            }
        }
        this.removeUnusedElements();

        SpessaSynthInfo("%cSound bank modified!", consoleColors.recognized);
        SpessaSynthGroupEnd();
        SpessaSynthGroupEnd();
    }

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

    public deleteInstrument(instrument: BasicInstrument) {
        instrument.delete();
        this.instruments.splice(this.instruments.indexOf(instrument), 1);
    }

    public deletePreset(preset: BasicPreset) {
        preset.delete();
        this.presets.splice(this.presets.indexOf(preset), 1);
    }

    public deleteSample(sample: BasicSample) {
        sample.unlinkSample();
        this.samples.splice(this.samples.indexOf(sample), 1);
    }

    /**
     * Get the appropriate preset.
     */
    public getPreset(patch: MIDIPatch, system: SynthSystem): BasicPreset {
        return selectPreset(this.presets, patch, system);
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Gets preset by name
     */
    public getPresetByName(presetName: string): BasicPreset {
        let preset = this.presets.find((p) => p.name === presetName);
        if (!preset) {
            SpessaSynthInfo(
                "Preset not found. Defaulting to:",
                this.presets[0].name
            );
            preset = this.presets[0];
        }
        return preset;
    }

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
        // 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 24,
        // 25, 27, 28, 29, 30, 31, 32, 33, 40, 41, 48, 56, 57, 58,
        // 64, 65, 66, 126, 127
        const allowedPrograms = new Set([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 24, 25, 27, 28, 29, 30, 31,
            32, 33, 40, 41, 48, 56, 57, 58, 64, 65, 66, 126, 127
        ]);
        for (const preset of this.presets) {
            if (isXGDrums(preset.bankMSB)) {
                this._isXGBank = true;
                if (!allowedPrograms.has(preset.program)) {
                    // Not valid!
                    this._isXGBank = false;
                    SpessaSynthInfo(
                        `%cThis bank is not valid XG. Preset %c${preset.bankMSB}:${preset.program}%c is not a valid XG drum. XG mode will use presets on bank 128.`,
                        consoleColors.info,
                        consoleColors.value,
                        consoleColors.info
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
                SpessaSynthInfo(
                    `%c${info}: %c"${v.major}.${v.minor}"`,
                    consoleColors.info,
                    consoleColors.recognized
                );
            }
            SpessaSynthInfo(
                `%c${info}: %c"${(value as string | Date).toString()}"`,
                consoleColors.info,
                consoleColors.recognized
            );
        }
    }
}

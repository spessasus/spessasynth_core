import {
    SpessaSynthGroup,
    SpessaSynthGroupCollapsed,
    SpessaSynthGroupEnd,
    SpessaSynthInfo,
    SpessaSynthWarn
} from "../../utils/loggin.js";
import { consoleColors } from "../../utils/other.js";
import { write } from "./write_sf2/write.js";
import { defaultModulators, Modulator } from "./modulator.js";
import { writeDLS } from "./write_dls/write_dls.js";
import { BasicSample, CreatedSample } from "./basic_sample.js";
import { Generator } from "./generator.js";
import { BasicInstrument } from "./basic_instrument.js";
import { BasicPreset } from "./basic_preset.js";
import { isXGDrums } from "../../utils/xg_hacks.js";
import { generatorTypes } from "./generator_types.js";
import { stbvorbis } from "stbvorbis_sync";
import type { BasicMIDI } from "../../midi/basic_midi.ts";

import type { SoundBankInfo } from "../types.ts";

/**
 * Represents a single sound bank, be it DLS or SF2.
 */
export class BasicSoundBank {
    /**
     * Indicates if the SF3/SF2Pack decoder is ready.
     */
    static isSF3DecoderReady: Promise<boolean> = stbvorbis.isInitialized;

    /**
     * Soundfont's info stored as name: value. ifil and iver are stored as string representation of float (e.g., 2.1)
     */
    readonly soundFontInfo: SoundBankInfo = {};

    /**
     * The soundfont's presets.
     * @type {BasicPreset[]}
     */
    presets: BasicPreset[] = [];

    /**
     * The soundfont's samples.
     */
    samples: BasicSample[] = [];

    /**
     * The soundfont's instruments.
     */
    instruments: BasicInstrument[] = [];

    /**
     * Soundfont's default modulators.
     */
    defaultModulators: Modulator[] = defaultModulators.map((m) =>
        Modulator.copy(m)
    );

    /**
     * If the bank has custom default modulators (DMOD).
     */
    customDefaultModulators: boolean = false;

    /**
     * Checks for XG drum sets and considers if this soundfont is XG.
     */
    isXGBank: boolean = false;
    write = write.bind(this);
    writeDLS = writeDLS.bind(this);

    /**
     * Creates a new basic soundfont template (or copies)
     */
    constructor(
        data:
            | undefined
            | {
                  presets: BasicPreset[];
                  info: SoundBankInfo;
              } = undefined
    ) {
        if (data?.presets) {
            this.soundFontInfo = data.info;
            this.addPresets(...data.presets);
            const instrumentList: BasicInstrument[] = [];
            for (const preset of data.presets) {
                for (const zone of preset.presetZones) {
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
                for (const zone of instrument.instrumentZones) {
                    if (zone.sample && !sampleList.includes(zone.sample)) {
                        sampleList.push(zone.sample);
                    }
                }
            }
            this.addSamples(...sampleList);
        }
    }

    /**
     * Merges soundfonts with the given order. Keep in mind that the info read is copied from the first one
     * @param soundBanks the soundfonts to merge, the first overwrites the last
     */
    static mergeSoundBanks(...soundBanks: BasicSoundBank[]): BasicSoundBank {
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
                        presets.find(
                            (existingPreset) =>
                                existingPreset.bank === newPreset.bank &&
                                existingPreset.program === newPreset.program
                        ) === undefined
                    ) {
                        presets.push(newPreset);
                    }
                });
            }
        }

        return new BasicSoundBank({
            presets: presets,
            info: mainSf.soundFontInfo
        });
    }

    /**
     * Creates a simple soundfont with one saw wave preset.
     */
    static async getDummySoundfontFile(): Promise<ArrayBufferLike> {
        const font = new BasicSoundBank();
        const sampleData = new Float32Array(128);
        for (let i = 0; i < 128; i++) {
            sampleData[i] = (i / 128) * 2 - 1;
        }
        const sample = new CreatedSample("Saw", 44100, sampleData);
        sample.samplePitch = 65;
        sample.samplePitchCorrection = 20;
        font.addSamples(sample);

        const inst = new BasicInstrument();
        inst.instrumentName = "Saw Wave";
        inst.globalZone.addGenerators(
            new Generator(generatorTypes.initialAttenuation, 375),
            new Generator(generatorTypes.releaseVolEnv, -1000),
            new Generator(generatorTypes.sampleModes, 1)
        );

        const zone1 = inst.createZone();
        zone1.setSample(sample);

        const zone2 = inst.createZone();
        zone2.setSample(sample);
        zone2.addGenerators(new Generator(generatorTypes.fineTune, -9));

        font.addInstruments(inst);

        const preset = new BasicPreset(font);
        preset.presetName = "Saw Wave";
        const pZone = preset.createZone();
        pZone.setInstrument(inst);

        font.addPresets(preset);

        font.soundFontInfo["ifil"] = "2.1";
        font.soundFontInfo["isng"] = "E-mu 10K2";
        font.soundFontInfo["INAM"] = "Dummy";
        font.flush();
        const f = await font.write();
        return f.buffer;
    }

    addPresets(...presets: BasicPreset[]) {
        this.presets.push(...presets);
    }

    addInstruments(...instruments: BasicInstrument[]) {
        this.instruments.push(...instruments);
    }

    addSamples(...samples: BasicSample[]) {
        this.samples.push(...samples);
    }

    /**
     * Clones samples into this bank
     * @param sample samples to copy
     * @returns copied sample, if a sample exists with that name, it is returned instead
     */
    cloneSample(sample: BasicSample): BasicSample {
        const duplicate = this.samples.find(
            (s) => s.sampleName === sample.sampleName
        );
        if (duplicate) {
            return duplicate;
        }
        const newSample = new BasicSample(
            sample.sampleName,
            sample.sampleRate,
            sample.samplePitch,
            sample.samplePitchCorrection,
            sample.sampleType,
            sample.sampleLoopStartIndex,
            sample.sampleLoopEndIndex
        );
        if (sample.isCompressed && sample.compressedData) {
            newSample.setCompressedData(sample.compressedData.slice());
        } else {
            newSample.setAudioData(sample.getAudioData());
        }
        this.addSamples(newSample);
        if (sample.linkedSample) {
            const clonedLinked = this.cloneSample(sample.linkedSample);
            // sanity check
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
    cloneInstrument(instrument: BasicInstrument): BasicInstrument {
        const duplicate = this.instruments.find(
            (i) => i.instrumentName === instrument.instrumentName
        );
        if (duplicate) {
            return duplicate;
        }
        const newInstrument = new BasicInstrument();
        newInstrument.instrumentName = instrument.instrumentName;
        newInstrument.globalZone.copyFrom(instrument.globalZone);
        for (const zone of instrument.instrumentZones) {
            const copiedZone = newInstrument.createZone();
            copiedZone.copyFrom(zone);
            if (zone.sample) {
                copiedZone.setSample(this.cloneSample(zone.sample));
            }
        }
        this.addInstruments(newInstrument);
        return newInstrument;
    }

    // noinspection JSUnusedGlobalSymbols
    /**
     * Clones presets into this sound bank
     * @returns the copied preset, if a preset exists with that name, it is returned instead
     */
    clonePreset(preset: BasicPreset): BasicPreset {
        const duplicate = this.presets.find(
            (p) => p.presetName === preset.presetName
        );
        if (duplicate) {
            return duplicate;
        }
        const newPreset = new BasicPreset(this);
        newPreset.presetName = preset.presetName;
        newPreset.bank = preset.bank;
        newPreset.program = preset.program;
        newPreset.library = preset.library;
        newPreset.genre = preset.genre;
        newPreset.morphology = preset.morphology;
        newPreset.globalZone.copyFrom(preset.globalZone);
        for (const zone of preset.presetZones) {
            const copiedZone = newPreset.createZone();
            copiedZone.copyFrom(zone);
            if (zone.instrument) {
                copiedZone.setInstrument(this.cloneInstrument(zone.instrument));
            }
        }

        this.addPresets(newPreset);
        return newPreset;
    }

    flush() {
        this.presets.sort((a, b) => {
            if (a.bank !== b.bank) {
                return a.bank - b.bank;
            }
            return a.program - b.program;
        });
        this._parseInternal();
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
                iZoneIndex < instrument.instrumentZones.length;
                iZoneIndex++
            ) {
                const iZone = instrument.instrumentZones[iZoneIndex];
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
                        `%c${iZone.sample.sampleName}%c removed from %c${instrument.instrumentName}%c.`,
                        consoleColors.recognized,
                        consoleColors.info,
                        consoleColors.recognized,
                        consoleColors.info
                    );
                    if (instrument.deleteZone(iZoneIndex)) {
                        trimmedIZones++;
                        iZoneIndex--;
                        SpessaSynthInfo(
                            `%c${iZone.sample.sampleName}%c deleted`,
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

        SpessaSynthGroup("%cTrimming soundbank...", consoleColors.info);
        const usedProgramsAndKeys = mid.getUsedProgramsAndKeys(this);

        SpessaSynthGroupCollapsed(
            "%cModifying soundbank...",
            consoleColors.info
        );
        SpessaSynthInfo("Detected keys for midi:", usedProgramsAndKeys);
        // modify the soundfont to only include programs and samples that are used
        for (
            let presetIndex = 0;
            presetIndex < this.presets.length;
            presetIndex++
        ) {
            const p = this.presets[presetIndex];
            const string = p.bank + ":" + p.program;
            const used = usedProgramsAndKeys[string];
            if (used === undefined) {
                SpessaSynthInfo(
                    `%cDeleting preset %c${p.presetName}%c and its zones`,
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
                    `%cTrimming %c${p.presetName}`,
                    consoleColors.info,
                    consoleColors.recognized
                );
                SpessaSynthInfo(`Keys for ${p.presetName}:`, combos);
                let trimmedZones = 0;
                // clean the preset to only use zones that are used
                for (
                    let zoneIndex = 0;
                    zoneIndex < p.presetZones.length;
                    zoneIndex++
                ) {
                    const zone = p.presetZones[zoneIndex];
                    const keyRange = zone.keyRange;
                    const velRange = zone.velRange;
                    // check if any of the combos matches the zone
                    let isZoneUsed = false;
                    for (const combo of combos) {
                        if (
                            combo.key >= keyRange.min &&
                            combo.key <= keyRange.max &&
                            combo.velocity >= velRange.min &&
                            combo.velocity <= velRange.max &&
                            zone.instrument
                        ) {
                            // zone is used, trim the instrument zones
                            isZoneUsed = true;
                            const trimmedIZones = trimInstrumentZones(
                                zone.instrument,
                                combos
                            );
                            SpessaSynthInfo(
                                `%cTrimmed off %c${trimmedIZones}%c zones from %c${zone.instrument.instrumentName}`,
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
                    `%cTrimmed off %c${trimmedZones}%c zones from %c${p.presetName}`,
                    consoleColors.info,
                    consoleColors.recognized,
                    consoleColors.info,
                    consoleColors.recognized
                );
                SpessaSynthGroupEnd();
            }
        }
        this.removeUnusedElements();

        this.soundFontInfo["ICMT"] =
            `NOTE: This soundfont was trimmed by SpessaSynth to only contain presets used in "${mid.midiName}"\n\n` +
            this.soundFontInfo["ICMT"];

        SpessaSynthInfo("%cSoundfont modified!", consoleColors.recognized);
        SpessaSynthGroupEnd();
        SpessaSynthGroupEnd();
    }

    removeUnusedElements() {
        this.instruments = this.instruments.filter((i) => {
            i.deleteUnusedZones();
            const deletable = i.useCount < 1;
            if (deletable) {
                i.deleteInstrument();
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

    deleteInstrument(instrument: BasicInstrument) {
        instrument.deleteInstrument();
        this.instruments.splice(this.instruments.indexOf(instrument), 1);
    }

    deletePreset(preset: BasicPreset) {
        preset.deletePreset();
        this.presets.splice(this.presets.indexOf(preset), 1);
    }

    deleteSample(sample: BasicSample) {
        sample.unlinkSample();
        this.samples.splice(this.samples.indexOf(sample), 1);
    }

    /**
     * Get the appropriate preset, undefined if not found
     * @param bankNr
     * @param programNr
     * @param allowXGDrums if true, allows XG drum banks (120, 126 and 127) as drum preset
     * @returns {BasicPreset|undefined}
     */
    getPresetNoFallback(
        bankNr: number,
        programNr: number,
        allowXGDrums: boolean = false
    ): BasicPreset | undefined {
        const isDrum = bankNr === 128 || (allowXGDrums && isXGDrums(bankNr));
        // check for exact match
        let p;
        if (isDrum) {
            p = this.presets.find(
                (p) =>
                    p.bank === bankNr &&
                    p.isDrumPreset(allowXGDrums) &&
                    p.program === programNr
            );
        } else {
            p = this.presets.find(
                (p) => p.bank === bankNr && p.program === programNr
            );
        }
        if (p) {
            return p;
        }
        // no match...
        if (isDrum) {
            if (allowXGDrums) {
                // try any drum preset with matching program?
                const p = this.presets.find(
                    (p) =>
                        p.isDrumPreset(allowXGDrums) && p.program === programNr
                );
                if (p) {
                    return p;
                }
            }
        }
        return undefined;
    }

    /**
     * Get the appropriate preset
     * @param bankNr
     * @param programNr
     * @param allowXGDrums if true, allows XG drum banks (120, 126 and 127) as drum preset
     * @returns {BasicPreset}
     */
    getPreset(
        bankNr: number,
        programNr: number,
        allowXGDrums: boolean = false
    ): BasicPreset {
        const isDrums = bankNr === 128 || (allowXGDrums && isXGDrums(bankNr));
        // check for exact match
        let preset;
        // only allow drums if the preset is considered to be a drum preset
        if (isDrums) {
            preset = this.presets.find(
                (p) =>
                    p.bank === bankNr &&
                    p.isDrumPreset(allowXGDrums) &&
                    p.program === programNr
            );
        } else {
            preset = this.presets.find(
                (p) => p.bank === bankNr && p.program === programNr
            );
        }
        if (preset) {
            return preset;
        }
        // no match...
        if (isDrums) {
            // drum preset: find any preset with bank 128
            preset = this.presets.find(
                (p) => p.isDrumPreset(allowXGDrums) && p.program === programNr
            );
            if (!preset) {
                // only allow 128, otherwise it would default to XG SFX
                preset = this.presets.find((p) => p.isDrumPreset(allowXGDrums));
            }
        } else {
            // non-drum preset: find any preset with the given program that is not a drum preset
            preset = this.presets.find(
                (p) => p.program === programNr && !p.isDrumPreset(allowXGDrums)
            );
        }
        if (preset) {
            SpessaSynthWarn(
                `%cPreset ${bankNr}.${programNr} not found. Replaced with %c${preset.presetName} (${preset.bank}.${preset.program})`,
                consoleColors.warn,
                consoleColors.recognized
            );
        }

        // no preset, use the first one available
        if (!preset) {
            SpessaSynthWarn(
                `Preset ${programNr} not found. Defaulting to`,
                this.presets[0].presetName
            );
            preset = this.presets[0];
        }
        return preset;
    }

    /**
     * gets preset by name
     */
    getPresetByName(presetName: string): BasicPreset {
        let preset = this.presets.find((p) => p.presetName === presetName);
        if (!preset) {
            SpessaSynthWarn(
                "Preset not found. Defaulting to:",
                this.presets[0].presetName
            );
            preset = this.presets[0];
        }
        return preset;
    }

    destroySoundBank() {
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
     * parses the bank after loading is done
     * @protected
     */
    protected _parseInternal() {
        this.isXGBank = false;
        // definitions for XG:
        // at least one preset with bank 127, 126 or 120
        // MUST be a valid XG bank.
        // allowed banks: (see XG specification)
        // 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 24,
        // 25, 27, 28, 29, 30, 31, 32, 33, 40, 41, 48, 56, 57, 58,
        // 64, 65, 66, 126, 127
        const allowedPrograms = new Set([
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 24, 25, 27, 28, 29, 30, 31,
            32, 33, 40, 41, 48, 56, 57, 58, 64, 65, 66, 126, 127
        ]);
        for (const preset of this.presets) {
            if (isXGDrums(preset.bank)) {
                this.isXGBank = true;
                if (!allowedPrograms.has(preset.program)) {
                    // not valid!
                    this.isXGBank = false;
                    SpessaSynthInfo(
                        `%cThis bank is not valid XG. Preset %c${preset.bank}:${preset.program}%c is not a valid XG drum. XG mode will use presets on bank 128.`,
                        consoleColors.info,
                        consoleColors.value,
                        consoleColors.info
                    );
                    break;
                }
            }
        }
    }
}

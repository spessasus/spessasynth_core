import { BasicSoundBank } from "../../../soundbank/basic_soundbank/basic_soundbank";
import { EmptySample } from "../../../soundbank/basic_soundbank/basic_sample";
import { BasicInstrument } from "../../../soundbank/basic_soundbank/basic_instrument";
import { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import { Generator } from "../../../soundbank/basic_soundbank/generator";
import { GeneratorTypes } from "../../../soundbank/basic_soundbank/generator_types";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { ModulatorSource } from "../../../soundbank/basic_soundbank/modulator_source";
import { ModulatorCurveTypes } from "../../../soundbank/enums";
import type { MIDIController } from "../../enums";
import {
    FILTER_CUTOFF_CC,
    FILTER_CUTOFF_RANGE,
    FILTER_RESONANCE_CC,
    FILTER_RESONANCE_RANGE,
    OFFSET_COARSE_CC,
    OFFSET_FINE_CC
} from "./tracker_midi_track";
import {
    type TrackerLoopType,
    TrackerLoopTypes,
    type TrackerSample,
    type TrackerSampleVariant,
    TrackerSampleVariants
} from "./types";

/**
 * The volume envelope release (in timecents) of the sound bank instruments.
 * Short, as trackers cut the notes instantly.
 */
const RELEASE_TIMECENTS = -9000;

/**
 * How one variant of a tracker sample is laid out in the sound bank.
 * The synthesizer plays it forwards from the start offset and loops it forwards,
 * so ping-pong loops are unrolled and reversed playback uses reversed data.
 */
interface SampleLayout {
    sampleIndex: number;
    variant: TrackerSampleVariant;
    /**
     * The loop of the source data this layout plays (before reversing and unrolling).
     */
    loopType: TrackerLoopType;
    loopStart: number;
    loopEnd: number;
    /**
     * The length of the source sample.
     */
    sourceLength: number;
    /**
     * The length of the sound bank sample.
     */
    length: number;
    /**
     * The sound bank loop, both zero if the sample does not loop.
     */
    playLoopStart: number;
    playLoopEnd: number;
}

/**
 * Unrolls or trims the data of a sample for a forward-looping synthesizer.
 * @param data The source data (already reversed for reversed playback).
 * @param loopType The loop type.
 * @param loopStart The loop start.
 * @param loopEnd The loop end.
 * @param pingPongTail How far before the loop end the backward part starts, see {@link TrackerSampleBank}.
 */
function layoutData(
    data: Float32Array,
    loopType: TrackerLoopType,
    loopStart: number,
    loopEnd: number,
    pingPongTail: number
) {
    if (loopType !== TrackerLoopTypes.pingPong) {
        return data;
    }
    // Unroll the ping-pong loop into a forward loop
    const forward = data.subarray(0, loopEnd);
    const backward = data.slice(loopStart + 1, loopEnd + 1 - pingPongTail);
    backward.reverse();
    const out = new Float32Array(forward.length + backward.length);
    out.set(forward);
    out.set(backward, forward.length);
    return out;
}

/**
 * Creates the sound bank of a tracker module.
 * Every sample is one preset, selected with its index (program, and bank MSB above 127).
 * Extra variants of a sample (the sample after the sustain loop is released, reversed playback)
 * get their own presets after the samples, created when the playback first needs them.
 */
export class TrackerSampleBank {
    private readonly samples: TrackerSample[];
    private readonly layouts = new Array<SampleLayout | undefined>();
    private readonly variantPresets = new Map<number, number>();
    /**
     * The backward part of an unrolled ping-pong loop starts this many points before the loop end.
     * 2 plays every point once per direction, 1 repeats the last point (Impulse Tracker).
     */
    private readonly pingPongTail: number;

    /**
     * Creates the sound bank of the samples.
     * @param samples The module samples.
     * @param repeatPingPongEnd If ping-pong loops play their last point twice, like Impulse Tracker.
     */
    public constructor(samples: TrackerSample[], repeatPingPongEnd = false) {
        this.samples = samples;
        this.pingPongTail = repeatPingPongEnd ? 1 : 2;
        for (const [index, sample] of samples.entries()) {
            this.layouts.push(
                sample.data.length > 0
                    ? this.createLayout(index, TrackerSampleVariants.normal)
                    : undefined
            );
        }
    }

    /**
     * Gets the preset of a sample variant, creating it if needed.
     * @param sampleIndex The index of the sample in the module.
     * @param variant The variant.
     * @returns The preset index.
     */
    public getPreset(sampleIndex: number, variant: TrackerSampleVariant) {
        if (variant === TrackerSampleVariants.normal) {
            return sampleIndex;
        }
        const key = sampleIndex * 4 + variant;
        let preset = this.variantPresets.get(key);
        if (preset === undefined) {
            preset = this.layouts.length;
            this.layouts.push(this.createLayout(sampleIndex, variant));
            this.variantPresets.set(key, preset);
        }
        return preset;
    }

    /**
     * Gets the length of a preset's sample.
     * @param preset The preset index.
     */
    public getLength(preset: number) {
        return this.layouts[preset]?.length ?? 0;
    }

    /**
     * Gets the loop start of a preset's sample.
     * @param preset The preset index.
     */
    public getLoopStart(preset: number) {
        return this.layouts[preset]?.playLoopStart ?? 0;
    }

    /**
     * Checks if a preset's sample loops.
     * @param preset The preset index.
     */
    public isLooped(preset: number) {
        const layout = this.layouts[preset];
        return !!layout && layout.playLoopEnd > layout.playLoopStart;
    }

    /**
     * Advances a playback position, wrapping it in the loop.
     * @param preset The preset index.
     * @param position The position in the preset's sample.
     * @param frames The amount of sample points to advance.
     * @returns The new position, Infinity if the sample has ended.
     */
    public advance(preset: number, position: number, frames: number) {
        const layout = this.layouts[preset];
        if (!layout) {
            return Infinity;
        }
        position += frames;
        if (layout.playLoopEnd > layout.playLoopStart) {
            if (position >= layout.playLoopEnd) {
                const length = layout.playLoopEnd - layout.playLoopStart;
                position =
                    layout.playLoopStart +
                    ((position - layout.playLoopStart) % length);
            }
            return position;
        }
        return position >= layout.length ? Infinity : position;
    }

    /**
     * Converts a position in a preset's sample to the position in the source sample.
     * @param preset The preset index.
     * @param position The position in the preset's sample.
     * @returns The source position and if it is played backwards.
     */
    public toSource(preset: number, position: number) {
        const layout = this.layouts[preset];
        if (!layout) {
            return { position: 0, backwards: false };
        }
        let backwards = false;
        if (
            layout.loopType === TrackerLoopTypes.pingPong &&
            position >= layout.loopEnd
        ) {
            backwards = true;
            position =
                layout.loopEnd -
                this.pingPongTail -
                (position - layout.loopEnd);
        }
        if (layout.variant === TrackerSampleVariants.reverse) {
            position = layout.sourceLength - 1 - position;
            backwards = !backwards;
        }
        return { position: Math.max(0, position), backwards };
    }

    /**
     * Converts a position in the source sample to the position in a preset's sample.
     * @param preset The preset index.
     * @param position The position in the source sample.
     * @param backwards If the source sample is played backwards.
     * @returns The position in the preset's sample.
     */
    public fromSource(preset: number, position: number, backwards: boolean) {
        const layout = this.layouts[preset];
        if (!layout) {
            return 0;
        }
        if (layout.variant === TrackerSampleVariants.reverse) {
            position = layout.sourceLength - 1 - position;
            backwards = !backwards;
        }
        if (
            backwards &&
            layout.loopType === TrackerLoopTypes.pingPong &&
            position > layout.loopStart &&
            position <= layout.loopEnd - this.pingPongTail
        ) {
            position =
                layout.loopEnd +
                (layout.loopEnd - this.pingPongTail - position);
        }
        return this.advance(preset, Math.max(0, position), 0);
    }

    /**
     * Writes the sound bank.
     * @param title The module title.
     * @param formatName The module format name.
     * @param rootKey The MIDI key at which the samples play at their middle C rate.
     * @param attenuation The attenuation of every sample in centibels.
     * @returns The SF2 binary.
     */
    public write(
        title: string,
        formatName: string,
        rootKey: number,
        attenuation: number
    ) {
        const bank = new BasicSoundBank();
        bank.soundBankInfo.name = title || "Tracker module";
        bank.soundBankInfo.software = "SpessaSynth";
        bank.soundBankInfo.comment = `Converted from ${formatName}`;

        const ccSource = (cc: MIDIController) =>
            new ModulatorSource(cc, ModulatorCurveTypes.linear, true);
        const modulators = [
            // The sample offset controllers modulate the sample start
            new Modulator(
                ccSource(OFFSET_FINE_CC),
                new ModulatorSource(),
                GeneratorTypes.startAddrsOffset,
                // The largest amount, each step is 255.99 sample points (and 2 for the LSB).
                // The synthesizer truncates the result, so offsets land one sample point early
                32_767,
                0
            ),
            new Modulator(
                ccSource(OFFSET_COARSE_CC),
                new ModulatorSource(),
                GeneratorTypes.startAddrsCoarseOffset,
                // Slightly above 128 so the truncated result is exactly the controller value
                129,
                0
            ),
            // The resonant filter, zero leaves it open
            new Modulator(
                ccSource(FILTER_CUTOFF_CC),
                new ModulatorSource(),
                GeneratorTypes.initialFilterFc,
                -FILTER_CUTOFF_RANGE,
                0
            ),
            new Modulator(
                ccSource(FILTER_RESONANCE_CC),
                new ModulatorSource(),
                GeneratorTypes.initialFilterQ,
                FILTER_RESONANCE_RANGE,
                0
            ),
            // The synthesizer lowers the gain by half of the resonance, trackers do not
            new Modulator(
                ccSource(FILTER_RESONANCE_CC),
                new ModulatorSource(),
                GeneratorTypes.initialAttenuation,
                -FILTER_RESONANCE_RANGE / 2,
                0
            )
        ];

        for (const [preset, layout] of this.layouts.entries()) {
            if (!layout) {
                continue;
            }
            const trackerSample = this.samples[layout.sampleIndex];
            const baseName =
                trackerSample.name.trim() || `Sample ${layout.sampleIndex + 1}`;
            const name =
                layout.variant === TrackerSampleVariants.release
                    ? `${baseName} (release)`
                    : layout.variant === TrackerSampleVariants.reverse
                      ? `${baseName} (reverse)`
                      : baseName;
            const channels = trackerSample.rightData
                ? [trackerSample.data, trackerSample.rightData]
                : [trackerSample.data];

            const instrument = new BasicInstrument();
            instrument.name = name;
            instrument.globalZone.addGenerators(
                new Generator(GeneratorTypes.releaseVolEnv, RELEASE_TIMECENTS),
                new Generator(GeneratorTypes.initialAttenuation, attenuation),
                new Generator(
                    GeneratorTypes.sampleModes,
                    layout.playLoopEnd > layout.playLoopStart ? 1 : 0
                )
            );
            instrument.globalZone.addModulators(
                ...modulators.map((m) => Modulator.copyFrom(m))
            );
            for (const [c, source] of channels.entries()) {
                let data = source;
                if (layout.variant === TrackerSampleVariants.reverse) {
                    data = source.slice();
                    data.reverse();
                }
                const sample = new EmptySample();
                sample.name =
                    channels.length > 1 ? `${name} ${c ? "R" : "L"}` : name;
                sample.originalKey = rootKey;
                sample.setAudioData(
                    layoutData(
                        data,
                        layout.loopType,
                        layout.loopStart,
                        layout.loopEnd,
                        this.pingPongTail
                    ),
                    Math.round(trackerSample.middleCRate)
                );
                sample.loopStart = layout.playLoopStart;
                sample.loopEnd = layout.playLoopEnd;
                bank.addSamples(sample);
                const zone = instrument.createZone(sample);
                if (channels.length > 1) {
                    // Stereo samples play both channels panned hard left and right.
                    // Trackers play each channel at the level of a centered mono sample, 3 dB lower.
                    // The synthesizer applies 0.4 of the generator's attenuation
                    zone.addGenerators(
                        new Generator(GeneratorTypes.pan, c ? 500 : -500),
                        new Generator(
                            GeneratorTypes.initialAttenuation,
                            attenuation + 75
                        )
                    );
                }
            }
            bank.addInstruments(instrument);

            const bankPreset = new BasicPreset(bank);
            bankPreset.name = name;
            bankPreset.program = preset & 0x7f;
            bankPreset.bankMSB = preset >> 7;
            bankPreset.createZone(instrument);
            bank.addPresets(bankPreset);
        }
        bank.flush();
        return bank.writeSF2();
    }

    private createLayout(
        sampleIndex: number,
        variant: TrackerSampleVariant
    ): SampleLayout {
        const sample = this.samples[sampleIndex];
        const length = sample.data.length;
        // The sustain loop plays while the key is held, so it is the default one
        const sustain =
            variant !== TrackerSampleVariants.release &&
            (sample.sustainLoopType ?? TrackerLoopTypes.none) !==
                TrackerLoopTypes.none;
        let loopType = sustain
            ? (sample.sustainLoopType ?? TrackerLoopTypes.none)
            : sample.loopType;
        let loopStart = sustain
            ? (sample.sustainLoopStart ?? 0)
            : sample.loopStart;
        let loopEnd = sustain ? (sample.sustainLoopEnd ?? 0) : sample.loopEnd;
        loopEnd = Math.min(loopEnd, length);
        if (loopStart >= loopEnd) {
            loopType = TrackerLoopTypes.none;
        }
        if (variant === TrackerSampleVariants.reverse) {
            // The loop region mirrored into the reversed data
            [loopStart, loopEnd] = [length - loopEnd, length - loopStart];
        }
        if (loopType === TrackerLoopTypes.none) {
            loopStart = 0;
            loopEnd = 0;
        }
        let playLength = length;
        const playLoopStart = loopStart;
        let playLoopEnd = loopEnd;
        if (loopType === TrackerLoopTypes.pingPong) {
            playLength =
                loopEnd + Math.max(0, loopEnd - loopStart - this.pingPongTail);
            playLoopEnd = playLength;
        }
        return {
            sampleIndex,
            variant,
            loopType,
            loopStart,
            loopEnd,
            sourceLength: length,
            length: playLength,
            playLoopStart,
            playLoopEnd
        };
    }
}

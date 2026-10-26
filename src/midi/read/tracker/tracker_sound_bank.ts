import { BasicSoundBank } from "../../../soundbank/basic_soundbank/basic_soundbank";
import { EmptySample } from "../../../soundbank/basic_soundbank/basic_sample";
import { BasicInstrument } from "../../../soundbank/basic_soundbank/basic_instrument";
import { BasicPreset } from "../../../soundbank/basic_soundbank/basic_preset";
import { Generator } from "../../../soundbank/basic_soundbank/generator";
import { GeneratorTypes } from "../../../soundbank/basic_soundbank/generator_types";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { ModulatorSource } from "../../../soundbank/basic_soundbank/modulator_source";
import { ModulatorCurveTypes } from "../../../soundbank/enums";
import { OFFSET_COARSE_CC, OFFSET_FINE_CC } from "./tracker_midi_track";
import { TrackerLoopTypes, type TrackerSample } from "./types";

/**
 * The volume envelope release (in timecents) of the sound bank instruments.
 * Short, as trackers cut the notes instantly.
 */
const RELEASE_TIMECENTS = -9000;

/**
 * Creates the sound bank of a tracker module with one preset per sample.
 * The preset of a sample is selected with its index (program, and bank MSB above 127).
 * @param samples The module samples.
 * @param title The module title.
 * @param formatName The module format name.
 * @param rootKey The MIDI key at which the samples play at their middle C rate.
 * @param attenuation The attenuation of every sample in centibels.
 * @returns The SF2 binary.
 */
export function createTrackerSoundBank(
    samples: TrackerSample[],
    title: string,
    formatName: string,
    rootKey: number,
    attenuation: number
) {
    const bank = new BasicSoundBank();
    bank.soundBankInfo.name = title || "Tracker module";
    bank.soundBankInfo.software = "SpessaSynth";
    bank.soundBankInfo.comment = `Converted from ${formatName}`;

    // The sample offset controllers modulate the sample start
    const offsetModulators = [
        new Modulator(
            new ModulatorSource(
                OFFSET_FINE_CC,
                ModulatorCurveTypes.linear,
                true
            ),
            new ModulatorSource(),
            GeneratorTypes.startAddrsOffset,
            // The largest amount, each step is 255.99 sample points.
            // The synthesizer truncates the result, so offsets land one sample point early
            32_767,
            0
        ),
        new Modulator(
            new ModulatorSource(
                OFFSET_COARSE_CC,
                ModulatorCurveTypes.linear,
                true
            ),
            new ModulatorSource(),
            GeneratorTypes.startAddrsCoarseOffset,
            // Slightly above 128 so the truncated result is exactly the controller value
            129,
            0
        )
    ];

    for (const [index, trackerSample] of samples.entries()) {
        if (trackerSample.data.length === 0) {
            continue;
        }
        const name = trackerSample.name.trim() || `Sample ${index + 1}`;
        let data = trackerSample.data;
        let loopStart = trackerSample.loopStart;
        let loopEnd = trackerSample.loopEnd;
        if (trackerSample.loopType === TrackerLoopTypes.pingPong) {
            // Unroll the ping-pong loop into a forward loop
            const forward = data.subarray(0, loopEnd);
            const backward = data.slice(loopStart + 1, loopEnd - 1);
            backward.reverse();
            data = new Float32Array(forward.length + backward.length);
            data.set(forward);
            data.set(backward, forward.length);
            loopEnd = data.length;
        } else if (trackerSample.loopType === TrackerLoopTypes.none) {
            loopStart = 0;
            loopEnd = 0;
        }

        const sample = new EmptySample();
        sample.name = name;
        sample.originalKey = rootKey;
        sample.setAudioData(data, Math.round(trackerSample.middleCRate));
        sample.loopStart = loopStart;
        sample.loopEnd = loopEnd;
        bank.addSamples(sample);

        const instrument = new BasicInstrument();
        instrument.name = name;
        instrument.globalZone.addGenerators(
            new Generator(GeneratorTypes.releaseVolEnv, RELEASE_TIMECENTS),
            new Generator(GeneratorTypes.initialAttenuation, attenuation),
            new Generator(
                GeneratorTypes.sampleModes,
                trackerSample.loopType === TrackerLoopTypes.none ? 0 : 1
            )
        );
        instrument.globalZone.addModulators(
            ...offsetModulators.map((m) => Modulator.copyFrom(m))
        );
        instrument.createZone(sample);
        bank.addInstruments(instrument);

        const preset = new BasicPreset(bank);
        preset.name = name;
        preset.program = index & 0x7f;
        preset.bankMSB = index >> 7;
        preset.createZone(instrument);
        bank.addPresets(preset);
    }
    bank.flush();
    return bank.writeSF2();
}

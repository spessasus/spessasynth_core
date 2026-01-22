import { VolumeEnvelope } from "./volume_envelope";
import { ModulationEnvelope } from "./modulation_envelope";
import { absCentsToHz, timecentsToSeconds } from "../unit_converter";
import { getLFOValue } from "./lfo";
import { WavetableOscillator } from "./wavetable_oscillator";
import { LowpassFilter } from "./lowpass_filter";
import type { Voice } from "../voice";
import type { MIDIChannel } from "../midi_channel";
import { generatorTypes } from "../../../../soundbank/basic_soundbank/generator_types";
import { customControllers } from "../../../enums";
import { midiControllers } from "../../../../midi/enums";

/**
 * Renders a voice to the stereo output buffer
 * @param voice the voice to render
 * @param timeNow current time in seconds
 * @param outputLeft the left output buffer
 * @param outputRight the right output buffer
 * @param reverbOutputLeft left output for reverb
 * @param reverbOutputRight right output for reverb
 * @param chorusOutputLeft left output for chorus
 * @param chorusOutputRight right output for chorus
 * @param startIndex
 * @param sampleCount
 * @returns true if the voice is finished
 */
export function renderVoice(
    this: MIDIChannel,
    voice: Voice,
    timeNow: number,
    outputLeft: Float32Array,
    outputRight: Float32Array,
    reverbOutputLeft: Float32Array,
    reverbOutputRight: Float32Array,
    chorusOutputLeft: Float32Array,
    chorusOutputRight: Float32Array,
    startIndex: number,
    sampleCount: number
): boolean {
    // Check if release
    if (
        !voice.isInRelease && // If not in release, check if the release time is
        timeNow >= voice.releaseStartTime
    ) {
        // Release the voice here
        voice.isInRelease = true;
        VolumeEnvelope.startRelease(voice);
        ModulationEnvelope.startRelease(voice);
        if (voice.sample.loopingMode === 3) {
            voice.sample.isLooping = false;
        }
    }

    // If the initial attenuation is more than 100dB, skip the voice (it's silent anyway)
    if (voice.modulatedGenerators[generatorTypes.initialAttenuation] > 2500) {
        if (voice.isInRelease) {
            voice.finished = true;
        }
        return voice.finished;
    }

    // TUNING
    let targetKey = voice.targetKey;

    // Calculate tuning
    let cents =
        voice.modulatedGenerators[generatorTypes.fineTune] + // Soundfont fine tune
        this.channelOctaveTuning[voice.midiNote] + // MTS octave tuning
        this.channelTuningCents; // Channel tuning
    let semitones = voice.modulatedGenerators[generatorTypes.coarseTune]; // Soundfont coarse tuning

    // Midi tuning standard
    const tuning =
        this.synthProps.tunings[this.preset?.program ?? 0]?.[voice.realKey];
    if (tuning?.centTuning) {
        // Override key
        targetKey = tuning.midiNote;
        // Add micro-tonal tuning
        cents += tuning.centTuning;
    }

    // Portamento
    if (voice.portamentoFromKey > -1) {
        // 0 to 1
        const elapsed = Math.min(
            (timeNow - voice.startTime) / voice.portamentoDuration,
            1
        );
        const diff = targetKey - voice.portamentoFromKey;
        // Zero progress means the pitch being in fromKey, full progress means the normal pitch
        semitones -= diff * (1 - elapsed);
    }

    // Calculate tuning by key using soundfont's scale tuning
    cents +=
        (targetKey - voice.sample.rootKey) *
        voice.modulatedGenerators[generatorTypes.scaleTuning];

    // Low pass excursion with LFO and mod envelope
    let lowpassExcursion = 0;
    let volumeExcursionCentibels = 0;

    // Vibrato LFO
    const vibPitchDepth =
        voice.modulatedGenerators[generatorTypes.vibLfoToPitch];
    const vibVolDepth =
        voice.modulatedGenerators[generatorTypes.vibLfoToVolume];
    const vibFilterDepth =
        voice.modulatedGenerators[generatorTypes.vibLfoToFilterFc];
    if (vibPitchDepth !== 0 || vibVolDepth !== 0 || vibFilterDepth !== 0) {
        // Calculate start time and lfo value
        const vibStart =
            voice.startTime +
            timecentsToSeconds(
                voice.modulatedGenerators[generatorTypes.delayVibLFO]
            );
        const vibFreqHz = absCentsToHz(
            voice.modulatedGenerators[generatorTypes.freqVibLFO]
        );
        const vibLfoValue = getLFOValue(vibStart, vibFreqHz, timeNow);
        // Use modulation multiplier (RPN modulation depth)
        cents +=
            vibLfoValue *
            (vibPitchDepth *
                this.customControllers[customControllers.modulationMultiplier]);
        // Vol env volume offset
        // Negate the lfo value because audigy starts with increase rather than decrease
        volumeExcursionCentibels += -vibLfoValue * vibVolDepth;
        // Low pass frequency
        lowpassExcursion += vibLfoValue * vibFilterDepth;
    }

    // Mod LFO
    const modPitchDepth =
        voice.modulatedGenerators[generatorTypes.modLfoToPitch];
    const modVolDepth =
        voice.modulatedGenerators[generatorTypes.modLfoToVolume];
    const modFilterDepth =
        voice.modulatedGenerators[generatorTypes.modLfoToFilterFc];
    // Don't compute mod lfo unless necessary
    if (modPitchDepth !== 0 || modFilterDepth !== 0 || modVolDepth !== 0) {
        // Calculate start time and lfo value
        const modStart =
            voice.startTime +
            timecentsToSeconds(
                voice.modulatedGenerators[generatorTypes.delayModLFO]
            );
        const modFreqHz = absCentsToHz(
            voice.modulatedGenerators[generatorTypes.freqModLFO]
        );
        const modLfoValue = getLFOValue(modStart, modFreqHz, timeNow);
        // Use modulation multiplier (RPN modulation depth)
        cents +=
            modLfoValue *
            (modPitchDepth *
                this.customControllers[customControllers.modulationMultiplier]);
        // Vol env volume offset
        // Negate the lfo value because audigy starts with increase rather than decrease
        volumeExcursionCentibels += -modLfoValue * modVolDepth;
        // Low pass frequency
        lowpassExcursion += modLfoValue * modFilterDepth;
    }

    // Channel vibrato (GS NRPN)
    if (
        // Only enabled when modulation wheel is disabled (to prevent overlap)
        this.midiControllers[midiControllers.modulationWheel] == 0 &&
        this.channelVibrato.depth > 0
    ) {
        // Same as others
        cents +=
            getLFOValue(
                voice.startTime + this.channelVibrato.delay,
                this.channelVibrato.rate,
                timeNow
            ) * this.channelVibrato.depth;
    }

    // Mod env
    const modEnvPitchDepth =
        voice.modulatedGenerators[generatorTypes.modEnvToPitch];
    const modEnvFilterDepth =
        voice.modulatedGenerators[generatorTypes.modEnvToFilterFc];
    // Don't compute mod env unless necessary
    if (modEnvFilterDepth !== 0 || modEnvPitchDepth !== 0) {
        const modEnv = ModulationEnvelope.getValue(voice, timeNow);
        // Apply values
        lowpassExcursion += modEnv * modEnvFilterDepth;
        cents += modEnv * modEnvPitchDepth;
    }

    // Default resonant modulator: it does not affect the filter gain (neither XG nor GS did that)
    volumeExcursionCentibels -= voice.resonanceOffset;

    // Finally, calculate the playback rate
    const centsTotal = ~~(cents + semitones * 100);
    if (centsTotal !== voice.currentTuningCents) {
        voice.currentTuningCents = centsTotal;
        voice.currentTuningCalculated = Math.pow(2, centsTotal / 1200);
    }

    // SYNTHESIS
    const bufferOut = new Float32Array(sampleCount);

    // Looping mode 2: start on release. process only volEnv
    if (voice.sample.loopingMode === 2 && !voice.isInRelease) {
        VolumeEnvelope.apply(
            voice,
            bufferOut,
            volumeExcursionCentibels,
            this.synthProps.volumeEnvelopeSmoothingFactor
        );
        return voice.finished;
    }

    // Wave table oscillator
    WavetableOscillator.getSample(
        voice,
        bufferOut,
        this.synthProps.masterParameters.interpolationType
    );

    // Low pass filter
    LowpassFilter.apply(
        voice,
        bufferOut,
        lowpassExcursion,
        this.synthProps.filterSmoothingFactor
    );

    // Vol env
    VolumeEnvelope.apply(
        voice,
        bufferOut,
        volumeExcursionCentibels,
        this.synthProps.volumeEnvelopeSmoothingFactor
    );

    this.panAndMixVoice(
        voice,
        bufferOut,
        outputLeft,
        outputRight,
        reverbOutputLeft,
        reverbOutputRight,
        chorusOutputLeft,
        chorusOutputRight,
        startIndex
    );
    return voice.finished;
}

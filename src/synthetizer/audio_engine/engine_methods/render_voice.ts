import { VolumeEnvelope } from "../engine_components/volume_envelope";
import { ModulationEnvelope } from "../engine_components/modulation_envelope";
import { absCentsToHz, timecentsToSeconds } from "../engine_components/unit_converter";
import { getLFOValue } from "../engine_components/lfo";
import { WavetableOscillator } from "../engine_components/wavetable_oscillator";
import { LowpassFilter } from "../engine_components/lowpass_filter";
import type { Voice } from "../engine_components/voice";
import type { MIDIChannel } from "../engine_components/midi_channel";
import { generatorTypes } from "../../../soundbank/basic_soundbank/generator_types";
import { customControllers } from "../../enums";

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
    // check if release
    if (!voice.isInRelease) {
        // if not in release, check if the release time is
        if (timeNow >= voice.releaseStartTime) {
            // release the voice here
            voice.isInRelease = true;
            VolumeEnvelope.startRelease(voice);
            ModulationEnvelope.startRelease(voice);
            if (voice.sample.loopingMode === 3) {
                voice.sample.isLooping = false;
            }
        }
    }

    // if the initial attenuation is more than 100dB, skip the voice (it's silent anyway)
    if (voice.modulatedGenerators[generatorTypes.initialAttenuation] > 2500) {
        if (voice.isInRelease) {
            voice.finished = true;
        }
        return voice.finished;
    }

    // TUNING
    let targetKey = voice.targetKey;

    // calculate tuning
    let cents =
        voice.modulatedGenerators[generatorTypes.fineTune] + // soundfont fine tune
        this.channelOctaveTuning[voice.midiNote] + // MTS octave tuning
        this.channelTuningCents; // channel tuning
    let semitones = voice.modulatedGenerators[generatorTypes.coarseTune]; // soundfont coarse tuning

    // midi tuning standard
    const tuning =
        this.synthProps.tunings[this.preset?.program || 0]?.[voice.realKey];
    if (tuning !== undefined && tuning?.centTuning) {
        // override key
        targetKey = tuning.midiNote;
        // add micro-tonal tuning
        cents += tuning.centTuning;
    }

    // portamento
    if (voice.portamentoFromKey > -1) {
        // 0 to 1
        const elapsed = Math.min(
            (timeNow - voice.startTime) / voice.portamentoDuration,
            1
        );
        const diff = targetKey - voice.portamentoFromKey;
        // zero progress means the pitch being in fromKey, full progress means the normal pitch
        semitones -= diff * (1 - elapsed);
    }

    // calculate tuning by key using soundfont's scale tuning
    cents +=
        (targetKey - voice.sample.rootKey) *
        voice.modulatedGenerators[generatorTypes.scaleTuning];

    // low pass excursion with LFO and mod envelope
    let lowpassExcursion = 0;
    let volumeExcursionCentibels = 0;

    // vibrato LFO
    const vibPitchDepth =
        voice.modulatedGenerators[generatorTypes.vibLfoToPitch];
    const vibVolDepth =
        voice.modulatedGenerators[generatorTypes.vibLfoToVolume];
    const vibFilterDepth =
        voice.modulatedGenerators[generatorTypes.vibLfoToFilterFc];
    if (vibPitchDepth !== 0 || vibVolDepth !== 0 || vibFilterDepth !== 0) {
        // calculate start time and lfo value
        const vibStart =
            voice.startTime +
            timecentsToSeconds(
                voice.modulatedGenerators[generatorTypes.delayVibLFO]
            );
        const vibFreqHz = absCentsToHz(
            voice.modulatedGenerators[generatorTypes.freqVibLFO]
        );
        const vibLfoValue = getLFOValue(vibStart, vibFreqHz, timeNow);
        // use modulation multiplier (RPN modulation depth)
        cents +=
            vibLfoValue *
            (vibPitchDepth *
                this.customControllers[customControllers.modulationMultiplier]);
        // vol env volume offset
        // negate the lfo value because audigy starts with increase rather than decrease
        volumeExcursionCentibels += -vibLfoValue * vibVolDepth;
        // low pass frequency
        lowpassExcursion += vibLfoValue * vibFilterDepth;
    }

    // mod LFO
    const modPitchDepth =
        voice.modulatedGenerators[generatorTypes.modLfoToPitch];
    const modVolDepth =
        voice.modulatedGenerators[generatorTypes.modLfoToVolume];
    const modFilterDepth =
        voice.modulatedGenerators[generatorTypes.modLfoToFilterFc];
    // don't compute mod lfo unless necessary
    if (modPitchDepth !== 0 || modFilterDepth !== 0 || modVolDepth !== 0) {
        // calculate start time and lfo value
        const modStart =
            voice.startTime +
            timecentsToSeconds(
                voice.modulatedGenerators[generatorTypes.delayModLFO]
            );
        const modFreqHz = absCentsToHz(
            voice.modulatedGenerators[generatorTypes.freqModLFO]
        );
        const modLfoValue = getLFOValue(modStart, modFreqHz, timeNow);
        // use modulation multiplier (RPN modulation depth)
        cents +=
            modLfoValue *
            (modPitchDepth *
                this.customControllers[customControllers.modulationMultiplier]);
        // vol env volume offset
        // negate the lfo value because audigy starts with increase rather than decrease
        volumeExcursionCentibels += -modLfoValue * modVolDepth;
        // low pass frequency
        lowpassExcursion += modLfoValue * modFilterDepth;
    }

    // channel vibrato (GS NRPN)
    if (this.channelVibrato.depth > 0) {
        // same as others
        const channelVibrato = getLFOValue(
            voice.startTime + this.channelVibrato.delay,
            this.channelVibrato.rate,
            timeNow
        );
        if (channelVibrato) {
            cents += channelVibrato * this.channelVibrato.depth;
        }
    }

    // mod env
    const modEnvPitchDepth =
        voice.modulatedGenerators[generatorTypes.modEnvToPitch];
    const modEnvFilterDepth =
        voice.modulatedGenerators[generatorTypes.modEnvToFilterFc];
    // don't compute mod env unless necessary
    if (modEnvFilterDepth !== 0 || modEnvPitchDepth !== 0) {
        const modEnv = ModulationEnvelope.getValue(voice, timeNow);
        // apply values
        lowpassExcursion += modEnv * modEnvFilterDepth;
        cents += modEnv * modEnvPitchDepth;
    }

    // default resonant modulator: it does not affect the filter gain (neither XG nor GS did that)
    volumeExcursionCentibels -= voice.resonanceOffset;

    // finally, calculate the playback rate
    const centsTotal = ~~(cents + semitones * 100);
    if (centsTotal !== voice.currentTuningCents) {
        voice.currentTuningCents = centsTotal;
        voice.currentTuningCalculated = Math.pow(2, centsTotal / 1200);
    }

    // SYNTHESIS
    const bufferOut = new Float32Array(sampleCount);

    // looping mode 2: start on release. process only volEnv
    if (voice.sample.loopingMode === 2 && !voice.isInRelease) {
        VolumeEnvelope.apply(
            voice,
            bufferOut,
            volumeExcursionCentibels,
            this.synthProps.volumeEnvelopeSmoothingFactor
        );
        return voice.finished;
    }

    // wave table oscillator
    WavetableOscillator.getSample(
        voice,
        bufferOut,
        this.synthProps.masterParameters.interpolationType
    );

    // low pass filter
    LowpassFilter.apply(
        voice,
        bufferOut,
        lowpassExcursion,
        this.synthProps.filterSmoothingFactor
    );

    // vol env
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

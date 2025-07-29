import { decibelAttenuationToGain, timecentsToSeconds } from "../unit_converter";
import type { Voice } from "../voice";
import { generatorTypes } from "../../../../soundbank/basic_soundbank/generator_types";

/**
 * volume_envelope.js
 * purpose: applies a volume envelope for a given voice
 */

export const VOLUME_ENVELOPE_SMOOTHING_FACTOR = 0.01;

const DB_SILENCE = 100;
const PERCEIVED_DB_SILENCE = 90;
// around 96 dB of attenuation
const PERCEIVED_GAIN_SILENCE = 0.000015; // can't go lower than that (see #50)

/**
 * VOL ENV STATES:
 * 0 - delay
 * 1 - attack
 * 2 - hold/peak
 * 3 - decay
 * 4 - sustain
 * release indicates by isInRelease property
 */
type VolumeEnvelopeState = 0 | 1 | 2 | 3 | 4;

export class VolumeEnvelope {
    /**
     * The sample rate in Hz.
     */
    public sampleRate: number;
    /**
     * The current attenuation of the envelope in dB.
     */
    public currentAttenuationDb: number = DB_SILENCE;
    /**
     * The current stage of the volume envelope.
     */
    public state: VolumeEnvelopeState = 0;
    /**
     * The voice's absolute attenuation as linear gain.
     */
    public attenuation: number = 0;
    /**
     * The attenuation target, which the "attenuation" property is linearly interpolated towards (gain).
     */
    public attenuationTargetGain: number = 0;
    /**
     * The envelope's current time in samples.
     */
    protected currentSampleTime: number = 0;
    /**
     * The dB attenuation of the envelope when it entered the release stage.
     */
    protected releaseStartDb: number = DB_SILENCE;
    /**
     * The time in samples relative to the start of the envelope.
     */
    protected releaseStartTimeSamples: number = 0;
    /**
     * The current gain applied to the voice in the release stage.
     */
    protected currentReleaseGain: number = 1;
    /**
     * The attack duration in samples.
     */
    protected attackDuration: number = 0;
    /**
     * The decay duration in samples.
     */
    protected decayDuration: number = 0;
    /**
     * The release duration in samples.
     */
    protected releaseDuration: number = 0;
    /**
     * The attenuation target, which the "attenuation" property is linearly interpolated towards (dB).
     */
    protected attenuationTarget: number = 0;
    /**
     * The voice's sustain amount in dB, relative to attenuation.
     */
    protected sustainDbRelative: number = 0;
    /**
     * The time in samples to the end of delay stage, relative to the start of the envelope.
     */
    protected delayEnd: number = 0;
    /**
     * The time in samples to the end of attack stage, relative to the start of the envelope.
     */
    protected attackEnd: number = 0;
    /**
     * The time in samples to the end of hold stage, relative to the start of the envelope.
     */
    protected holdEnd: number = 0;
    /**
     * The time in samples to the end of decay stage, relative to the start of the envelope.
     */
    protected decayEnd: number = 0;

    /**
     * if sustain stage is silent,
     * then we can turn off the voice when it is silent.
     * We can't do that with modulated as it can silence the volume and then raise it again, and the voice must keep playing.
     */
    protected canEndOnSilentSustain: boolean;

    /**
     * @param sampleRate Hz
     * @param initialDecay cb
     */
    public constructor(sampleRate: number, initialDecay: number) {
        this.sampleRate = sampleRate;
        this.canEndOnSilentSustain = initialDecay / 10 >= PERCEIVED_DB_SILENCE;
    }

    /**
     * Starts the release phase in the envelope.
     * @param voice the voice this envelope belongs to.
     */
    public static startRelease(voice: Voice) {
        voice.volumeEnvelope.releaseStartTimeSamples =
            voice.volumeEnvelope.currentSampleTime;
        voice.volumeEnvelope.currentReleaseGain = decibelAttenuationToGain(
            voice.volumeEnvelope.currentAttenuationDb
        );
        VolumeEnvelope.recalculate(voice);
    }

    /**
     * Recalculates the envelope
     * @param voice the voice this envelope belongs to
     */
    public static recalculate(voice: Voice) {
        const env = voice.volumeEnvelope;
        const timecentsToSamples = (tc: number) => {
            return Math.max(
                0,
                Math.floor(timecentsToSeconds(tc) * env.sampleRate)
            );
        };
        // calculate absolute times (they can change so we have to recalculate every time
        env.attenuationTarget =
            Math.max(
                0,
                Math.min(
                    voice.modulatedGenerators[
                        generatorTypes.initialAttenuation
                    ],
                    1440
                )
            ) / 10; // divide by ten to get decibels
        env.attenuationTargetGain = decibelAttenuationToGain(
            env.attenuationTarget
        );
        env.sustainDbRelative = Math.min(
            DB_SILENCE,
            voice.modulatedGenerators[generatorTypes.sustainVolEnv] / 10
        );
        const sustainDb = Math.min(DB_SILENCE, env.sustainDbRelative);

        // calculate durations
        env.attackDuration = timecentsToSamples(
            voice.modulatedGenerators[generatorTypes.attackVolEnv]
        );

        // decay: sf spec page 35: the time is for change from attenuation to -100dB,
        // therefore, we need to calculate the real time
        // (changing from attenuation to sustain instead of -100dB)
        const fullChange =
            voice.modulatedGenerators[generatorTypes.decayVolEnv];
        const keyNumAddition =
            (60 - voice.targetKey) *
            voice.modulatedGenerators[generatorTypes.keyNumToVolEnvDecay];
        const fraction = sustainDb / DB_SILENCE;
        env.decayDuration =
            timecentsToSamples(fullChange + keyNumAddition) * fraction;

        env.releaseDuration = timecentsToSamples(
            voice.modulatedGenerators[generatorTypes.releaseVolEnv]
        );

        // calculate absolute end times for the values
        env.delayEnd = timecentsToSamples(
            voice.modulatedGenerators[generatorTypes.delayVolEnv]
        );
        env.attackEnd = env.attackDuration + env.delayEnd;

        // make sure to take keyNumToVolEnvHold into account!
        const holdExcursion =
            (60 - voice.targetKey) *
            voice.modulatedGenerators[generatorTypes.keyNumToVolEnvHold];
        env.holdEnd =
            timecentsToSamples(
                voice.modulatedGenerators[generatorTypes.holdVolEnv] +
                    holdExcursion
            ) + env.attackEnd;

        env.decayEnd = env.decayDuration + env.holdEnd;

        // if this is the first recalculation and the voice has no attack or delay time, set current db to peak
        if (env.state === 0 && env.attackEnd === 0) {
            // env.currentAttenuationDb = env.attenuationTarget;
            env.state = 2;
        }

        // check if voice is in release
        if (voice.isInRelease) {
            // no interpolation this time: force update to actual attenuation and calculate release start from there
            //env.attenuation = Math.min(DB_SILENCE, env.attenuationTarget);
            const sustainDb = Math.max(
                0,
                Math.min(DB_SILENCE, env.sustainDbRelative)
            );
            const fraction = sustainDb / DB_SILENCE;
            env.decayDuration =
                timecentsToSamples(fullChange + keyNumAddition) * fraction;

            switch (env.state) {
                case 0:
                    env.releaseStartDb = DB_SILENCE;
                    break;

                case 1: {
                    // attack phase: get linear gain of the attack phase when release started
                    // and turn it into db as we're ramping the db up linearly
                    // (to make volume go down exponentially)
                    // attack is linear (in gain) so we need to do get db from that
                    const elapsed =
                        1 -
                        (env.attackEnd - env.releaseStartTimeSamples) /
                            env.attackDuration;
                    // calculate the gain that the attack would have, so
                    // turn that into db
                    env.releaseStartDb = 20 * Math.log10(elapsed) * -1;
                    break;
                }

                case 2:
                    env.releaseStartDb = 0;
                    break;

                case 3:
                    env.releaseStartDb =
                        (1 -
                            (env.decayEnd - env.releaseStartTimeSamples) /
                                env.decayDuration) *
                        sustainDb;
                    break;

                case 4:
                    env.releaseStartDb = sustainDb;
                    break;
            }
            env.releaseStartDb = Math.max(
                0,
                Math.min(env.releaseStartDb, DB_SILENCE)
            );
            if (env.releaseStartDb >= PERCEIVED_DB_SILENCE) {
                voice.finished = true;
            }
            env.currentReleaseGain = decibelAttenuationToGain(
                env.releaseStartDb
            );

            // release: sf spec page 35: the time is for change from attenuation to -100dB,
            // therefore, we need to calculate the real time
            // (changing from release start to -100dB instead of from peak to -100dB)
            const releaseFraction =
                (DB_SILENCE - env.releaseStartDb) / DB_SILENCE;
            env.releaseDuration *= releaseFraction;
        }
    }

    /**
     * Applies volume envelope gain to the given output buffer.
     * Essentially we use approach of 100dB is silence, 0dB is peak, and always add attenuation to that (which is interpolated).
     * @param voice the voice we're working on
     * @param audioBuffer the audio buffer to modify
     * @param centibelOffset the centibel offset of volume, for modLFOtoVolume
     * @param smoothingFactor the adjusted smoothing factor for the envelope
     */
    public static apply(
        voice: Voice,
        audioBuffer: Float32Array,
        centibelOffset: number,
        smoothingFactor: number
    ) {
        const env = voice.volumeEnvelope;
        const decibelOffset = centibelOffset / 10;

        const attenuationSmoothing = smoothingFactor;

        // RELEASE PHASE
        if (voice.isInRelease) {
            let elapsedRelease =
                env.currentSampleTime - env.releaseStartTimeSamples;
            if (elapsedRelease >= env.releaseDuration) {
                for (let i = 0; i < audioBuffer.length; i++) {
                    audioBuffer[i] = 0;
                }
                voice.finished = true;
                return;
            }
            const dbDifference = DB_SILENCE - env.releaseStartDb;
            for (let i = 0; i < audioBuffer.length; i++) {
                // attenuation interpolation
                env.attenuation +=
                    (env.attenuationTargetGain - env.attenuation) *
                    attenuationSmoothing;
                const db =
                    (elapsedRelease / env.releaseDuration) * dbDifference +
                    env.releaseStartDb;
                env.currentReleaseGain =
                    env.attenuation *
                    decibelAttenuationToGain(db + decibelOffset);
                audioBuffer[i] *= env.currentReleaseGain;
                env.currentSampleTime++;
                elapsedRelease++;
            }

            if (env.currentReleaseGain <= PERCEIVED_GAIN_SILENCE) {
                voice.finished = true;
            }
            return;
        }

        let filledBuffer = 0;
        switch (env.state) {
            case 0:
                // delay phase, no sound is produced
                while (env.currentSampleTime < env.delayEnd) {
                    env.currentAttenuationDb = DB_SILENCE;
                    audioBuffer[filledBuffer] = 0;

                    env.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
                env.state++;
            // fallthrough

            case 1:
                // attack phase: ramp from 0 to attenuation
                while (env.currentSampleTime < env.attackEnd) {
                    // attenuation interpolation
                    env.attenuation +=
                        (env.attenuationTargetGain - env.attenuation) *
                        attenuationSmoothing;

                    // Special case: linear gain ramp instead of linear db ramp
                    const linearAttenuation =
                        1 -
                        (env.attackEnd - env.currentSampleTime) /
                            env.attackDuration; // 0 to 1
                    audioBuffer[filledBuffer] *=
                        linearAttenuation *
                        env.attenuation *
                        decibelAttenuationToGain(decibelOffset);
                    // set current attenuation to peak as its invalid during this phase
                    env.currentAttenuationDb = 0;

                    env.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
                env.state++;
            // fallthrough

            case 2:
                // hold/peak phase: stay at attenuation
                while (env.currentSampleTime < env.holdEnd) {
                    // attenuation interpolation
                    env.attenuation +=
                        (env.attenuationTargetGain - env.attenuation) *
                        attenuationSmoothing;

                    audioBuffer[filledBuffer] *=
                        env.attenuation *
                        decibelAttenuationToGain(decibelOffset);
                    env.currentAttenuationDb = 0;

                    env.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
                env.state++;
            // fallthrough

            case 3:
                // decay phase: linear ramp from attenuation to sustain
                while (env.currentSampleTime < env.decayEnd) {
                    // attenuation interpolation
                    env.attenuation +=
                        (env.attenuationTargetGain - env.attenuation) *
                        attenuationSmoothing;

                    env.currentAttenuationDb =
                        (1 -
                            (env.decayEnd - env.currentSampleTime) /
                                env.decayDuration) *
                        env.sustainDbRelative;
                    audioBuffer[filledBuffer] *=
                        env.attenuation *
                        decibelAttenuationToGain(
                            env.currentAttenuationDb + decibelOffset
                        );

                    env.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
                env.state++;
            // fallthrough

            case 4:
                if (
                    env.canEndOnSilentSustain &&
                    env.sustainDbRelative >= PERCEIVED_DB_SILENCE
                ) {
                    voice.finished = true;
                }
                // sustain phase: stay at sustain
                while (true) {
                    // attenuation interpolation
                    env.attenuation +=
                        (env.attenuationTargetGain - env.attenuation) *
                        attenuationSmoothing;

                    audioBuffer[filledBuffer] *=
                        env.attenuation *
                        decibelAttenuationToGain(
                            env.sustainDbRelative + decibelOffset
                        );
                    env.currentAttenuationDb = env.sustainDbRelative;
                    env.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
        }
    }
}

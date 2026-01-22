import { decibelAttenuationToGain, timecentsToSeconds } from "../unit_converter";
import type { Voice } from "../voice";
import { generatorTypes } from "../../../../soundbank/basic_soundbank/generator_types";

/**
 * Volume_envelope.ts
 * purpose: applies a volume envelope for a given voice
 */

export const VOLUME_ENVELOPE_SMOOTHING_FACTOR = 0.01;

const DB_SILENCE = 100;
const PERCEIVED_DB_SILENCE = 90;

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
    public readonly sampleRate: number;
    /**
     * The current attenuation of the envelope in dB.
     */
    public currentAttenuationDb: number = DB_SILENCE;
    /**
     * The current stage of the volume envelope.
     */
    public state: VolumeEnvelopeState = 0;
    /**
     * The envelope's current time in samples.
     */
    private currentSampleTime = 0;
    /**
     * The dB attenuation of the envelope when it entered the release stage.
     */
    private releaseStartDb: number = DB_SILENCE;
    /**
     * The time in samples relative to the start of the envelope.
     */
    private releaseStartTimeSamples = 0;
    /**
     * The attack duration in samples.
     */
    private attackDuration = 0;
    /**
     * The decay duration in samples.
     */
    private decayDuration = 0;
    /**
     * The release duration in samples.
     */
    private releaseDuration = 0;
    /**
     * The voice's sustain amount in dB, relative to attenuation.
     */
    private sustainDbRelative = 0;
    /**
     * The time in samples to the end of delay stage, relative to the start of the envelope.
     */
    private delayEnd = 0;
    /**
     * The time in samples to the end of attack stage, relative to the start of the envelope.
     */
    private attackEnd = 0;
    /**
     * The time in samples to the end of hold stage, relative to the start of the envelope.
     */
    private holdEnd = 0;
    /**
     * The time in samples to the end of decay stage, relative to the start of the envelope.
     */
    private decayEnd = 0;

    /**
     * If the volume envelope has ever entered the release phase.
     * @private
     */
    private enteredRelease = false;

    /**
     * If sustain stage is silent,
     * then we can turn off the voice when it is silent.
     * We can't do that with modulated as it can silence the volume and then raise it again, and the voice must keep playing.
     */
    private canEndOnSilentSustain = false;

    /**
     * @param sampleRate Hz
     */
    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
    }

    /**
     * Applies volume envelope gain to the given output buffer.
     * Essentially we use approach of 100dB is silence, 0dB is peak, and always add attenuation to that (which is interpolated).
     * @param voice the voice we're working on
     * @param audioBuffer the audio buffer to modify
     * @param centibelOffset the centibel offset of volume, for modLFOtoVolume and initialAttenuation
     */
    public apply(
        voice: Voice,
        audioBuffer: Float32Array,
        centibelOffset: number
    ) {
        const decibelOffset = centibelOffset / 10;

        // RELEASE PHASE
        if (this.enteredRelease) {
            // How much time has passed since release was started?
            let elapsedRelease =
                this.currentSampleTime - this.releaseStartTimeSamples;
            if (elapsedRelease >= this.releaseDuration) {
                // Release has finished and so has the voice!
                for (let i = 0; i < audioBuffer.length; i++) {
                    audioBuffer[i] = 0;
                }
                voice.finished = true;
                return;
            }
            const dbDifference = DB_SILENCE - this.releaseStartDb;
            for (let i = 0; i < audioBuffer.length; i++) {
                // Linearly ramp down decibels
                const db =
                    (elapsedRelease / this.releaseDuration) * dbDifference +
                    this.releaseStartDb;
                this.currentAttenuationDb = db + decibelOffset;
                audioBuffer[i] *= decibelAttenuationToGain(
                    this.currentAttenuationDb
                );
                this.currentSampleTime++;
                elapsedRelease++;
            }

            if (this.currentAttenuationDb >= PERCEIVED_DB_SILENCE) {
                voice.finished = true;
            }
            return;
        }

        let filledBuffer = 0;
        switch (this.state) {
            case 0: {
                // Delay phase: no sound is produced
                while (this.currentSampleTime < this.delayEnd) {
                    this.currentAttenuationDb = DB_SILENCE;
                    audioBuffer[filledBuffer] = 0;

                    this.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
                this.state++;
            }
            // Fallthrough

            case 1: {
                // Attack phase: ramp from 0 to attenuation
                while (this.currentSampleTime < this.attackEnd) {
                    // Special case: linear gain ramp instead of linear db ramp
                    const linearGain =
                        1 -
                        (this.attackEnd - this.currentSampleTime) /
                            this.attackDuration; // 0 to 1
                    audioBuffer[filledBuffer] *=
                        linearGain * decibelAttenuationToGain(decibelOffset);
                    // Set current attenuation to peak as its invalid during this phase
                    this.currentAttenuationDb = 0;

                    this.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
                this.state++;
            }
            // Fallthrough

            case 2: {
                // Hold/peak phase: stay at attenuation
                while (this.currentSampleTime < this.holdEnd) {
                    audioBuffer[filledBuffer] *=
                        decibelAttenuationToGain(decibelOffset);
                    this.currentAttenuationDb = 0;

                    this.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
                this.state++;
            }
            // Fallthrough

            case 3: {
                // Decay phase: linear ramp from attenuation to sustain
                while (this.currentSampleTime < this.decayEnd) {
                    this.currentAttenuationDb =
                        (1 -
                            (this.decayEnd - this.currentSampleTime) /
                                this.decayDuration) *
                        this.sustainDbRelative;
                    audioBuffer[filledBuffer] *= decibelAttenuationToGain(
                        this.currentAttenuationDb + decibelOffset
                    );

                    this.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
                this.state++;
            }
            // Fallthrough

            case 4: {
                if (
                    this.canEndOnSilentSustain &&
                    this.sustainDbRelative >= PERCEIVED_DB_SILENCE
                ) {
                    voice.finished = true;
                }
                // Sustain phase: stay at sustain
                while (true) {
                    const gain = decibelAttenuationToGain(
                        this.sustainDbRelative + decibelOffset
                    );
                    audioBuffer[filledBuffer] *= gain;
                    this.currentAttenuationDb = this.sustainDbRelative;
                    this.currentSampleTime++;
                    if (++filledBuffer >= audioBuffer.length) {
                        return;
                    }
                }
            }
        }
    }

    /**
     * Starts the release phase in the envelope.
     * @param voice the voice this envelope belongs to.
     */
    public startRelease(voice: Voice) {
        // Set the release start time to now
        this.releaseStartTimeSamples = this.currentSampleTime;

        const timecents =
            voice.overrideReleaseVolEnv ||
            voice.modulatedGenerators[generatorTypes.releaseVolEnv];
        // Min is set to -7200 prevent clicks
        this.releaseDuration = this.timecentsToSamples(
            Math.max(-7200, timecents)
        );

        if (this.enteredRelease) {
            // The envelope is already in release, but we request an update
            // This can happen with exclusiveClass for example
            // Don't compute the releaseStartDb as it's tracked in currentAttenuationDb
            this.releaseStartDb = this.currentAttenuationDb;
        } else {
            // The envelope now enters the release phase from the current gain
            // Compute the current gain level in decibel attenuation

            const sustainDb = Math.max(
                0,
                Math.min(DB_SILENCE, this.sustainDbRelative)
            );
            const fraction = sustainDb / DB_SILENCE;

            // Decay: sf spec page 35: the time is for change from attenuation to -100dB,
            // Therefore, we need to calculate the real time
            // (changing from attenuation to sustain instead of -100dB)
            const keyNumAddition =
                (60 - voice.targetKey) *
                voice.modulatedGenerators[generatorTypes.keyNumToVolEnvDecay];

            this.decayDuration =
                this.timecentsToSamples(
                    voice.modulatedGenerators[generatorTypes.decayVolEnv] +
                        keyNumAddition
                ) * fraction;

            switch (this.state) {
                case 0: {
                    // Delay phase: no sound is produced
                    this.releaseStartDb = DB_SILENCE;
                    break;
                }

                case 1: {
                    // Attack phase: get linear gain of the attack phase when release started
                    // And turn it into db as we're ramping the db up linearly
                    // (to make volume go down exponentially)
                    // Attack is linear (in gain) so we need to do get db from that
                    const elapsed =
                        1 -
                        (this.attackEnd - this.releaseStartTimeSamples) /
                            this.attackDuration;
                    // Calculate the gain that the attack would have, so
                    // Turn that into db
                    this.releaseStartDb = 20 * Math.log10(elapsed) * -1;
                    break;
                }

                case 2: {
                    this.releaseStartDb = 0;
                    break;
                }

                case 3: {
                    this.releaseStartDb =
                        (1 -
                            (this.decayEnd - this.releaseStartTimeSamples) /
                                this.decayDuration) *
                        sustainDb;
                    break;
                }

                case 4: {
                    this.releaseStartDb = sustainDb;
                    break;
                }
            }
            this.releaseStartDb = Math.max(
                0,
                Math.min(this.releaseStartDb, DB_SILENCE)
            );
            this.currentAttenuationDb = this.releaseStartDb;
        }
        this.enteredRelease = true;

        // Release: sf spec page 35: the time is for change from attenuation to -100dB,
        // Therefore, we need to calculate the real time
        // (changing from release start to -100dB instead of from peak to -100dB)
        const releaseFraction = (DB_SILENCE - this.releaseStartDb) / DB_SILENCE;
        this.releaseDuration *= releaseFraction;
        // Sanity check
        if (this.releaseStartDb >= PERCEIVED_DB_SILENCE) {
            voice.finished = true;
        }
    }

    /**
     * Initialize the volume envelope
     * @param voice The voice this envelope belongs to
     */
    public init(voice: Voice) {
        this.canEndOnSilentSustain =
            voice.modulatedGenerators[generatorTypes.sustainVolEnv] / 10 >=
            PERCEIVED_DB_SILENCE;

        // Calculate absolute times (they can change so we have to recalculate every time
        this.sustainDbRelative = Math.min(
            DB_SILENCE,
            voice.modulatedGenerators[generatorTypes.sustainVolEnv] / 10
        );
        const sustainDb = Math.min(DB_SILENCE, this.sustainDbRelative);

        // Calculate durations
        this.attackDuration = this.timecentsToSamples(
            voice.modulatedGenerators[generatorTypes.attackVolEnv]
        );

        // Decay: sf spec page 35: the time is for change from attenuation to -100dB,
        // Therefore, we need to calculate the real time
        // (changing from attenuation to sustain instead of -100dB)
        const keyNumAddition =
            (60 - voice.targetKey) *
            voice.modulatedGenerators[generatorTypes.keyNumToVolEnvDecay];
        const fraction = sustainDb / DB_SILENCE;
        this.decayDuration =
            this.timecentsToSamples(
                voice.modulatedGenerators[generatorTypes.decayVolEnv] +
                    keyNumAddition
            ) * fraction;

        // Calculate absolute end times for the values
        this.delayEnd = this.timecentsToSamples(
            voice.modulatedGenerators[generatorTypes.delayVolEnv]
        );
        this.attackEnd = this.attackDuration + this.delayEnd;

        // Make sure to take keyNumToVolEnvHold into account!
        const holdExcursion =
            (60 - voice.targetKey) *
            voice.modulatedGenerators[generatorTypes.keyNumToVolEnvHold];
        this.holdEnd =
            this.timecentsToSamples(
                voice.modulatedGenerators[generatorTypes.holdVolEnv] +
                    holdExcursion
            ) + this.attackEnd;

        this.decayEnd = this.decayDuration + this.holdEnd;

        // If this is the first recalculation and the voice has no attack or delay time, set current db to peak
        if (this.state === 0 && this.attackEnd === 0) {
            // This.currentAttenuationDb = this.attenuationTarget;
            this.state = 2;
        }
    }

    private timecentsToSamples(tc: number) {
        return Math.max(
            0,
            Math.floor(timecentsToSeconds(tc) * this.sampleRate)
        );
    }
}

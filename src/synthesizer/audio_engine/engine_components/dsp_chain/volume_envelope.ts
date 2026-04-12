import {
    CENTIBEL_LOOKUP_TABLE,
    MIN_CENTIBELS,
    timecentsToSeconds
} from "../unit_converter";
import type { Voice } from "../voice";
import { generatorTypes } from "../../../../soundbank/basic_soundbank/generator_types";

/**
 * Volume_envelope.ts
 * purpose: applies a volume envelope for a given voice
 *
 * For performance reasons, cbAttenuationToGain is inlined here.
 */

// Per SF2 definition
const CB_SILENCE = 960;
const PERCEIVED_CB_SILENCE = 900;

// Gain smoothing for rapid volume changes. Must be run EVERY SAMPLE
const GAIN_SMOOTHING_FACTOR = 0.01;

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
     * The target gain for the current rendering block.
     */
    public outputGain = 0;
    /**
     * The current attenuation of the envelope in cB.
     */
    public attenuationCb: number = CB_SILENCE;
    /**
     * The current stage of the volume envelope.
     */
    public state: VolumeEnvelopeState = 0;
    /**
     * The envelope's current time in samples.
     */
    private sampleTime = 0;
    /**
     * The dB attenuation of the envelope when it entered the release stage.
     */
    private releaseStartCb: number = CB_SILENCE;
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
     * The voice's sustain amount in cB.
     */
    private sustainCb = 0;
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

    private readonly gainSmoothing;

    /**
     * The current peak gain, used for smoothing.
     * @private
     */
    private peakGain = 0;

    /**
     * @param sampleRate Hz
     */
    public constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.gainSmoothing = GAIN_SMOOTHING_FACTOR * (44_100 / sampleRate);
    }

    /**
     * Starts the release phase in the envelope.
     * @param voice the voice this envelope belongs to.
     */
    public startRelease(voice: Voice) {
        // Set the release start time to now
        this.releaseStartTimeSamples = this.sampleTime;

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
            // Don't compute the releaseStartCb as it's tracked in attenuationCb
            this.releaseStartCb = this.attenuationCb;
        } else {
            // The envelope now enters the release phase from the current gain
            // Compute the current gain level in decibel attenuation

            const sustainCb = Math.max(0, Math.min(CB_SILENCE, this.sustainCb));
            const fraction = sustainCb / CB_SILENCE;

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
                    this.releaseStartCb = CB_SILENCE;
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
                    // Turn that into cB
                    this.releaseStartCb = 200 * Math.log10(elapsed) * -1;
                    break;
                }

                case 2: {
                    this.releaseStartCb = 0;
                    break;
                }

                case 3: {
                    this.releaseStartCb =
                        (1 -
                            (this.decayEnd - this.releaseStartTimeSamples) /
                                this.decayDuration) *
                        sustainCb;
                    break;
                }

                case 4: {
                    this.releaseStartCb = sustainCb;
                    break;
                }
            }
            this.releaseStartCb = Math.max(
                0,
                Math.min(this.releaseStartCb, CB_SILENCE)
            );
            this.attenuationCb = this.releaseStartCb;
        }
        this.enteredRelease = true;

        // Release: sf spec page 35: the time is for change from attenuation to -100dB,
        // Therefore, we need to calculate the real time
        // (changing from release start to -100dB instead of from peak to -100dB)
        const releaseFraction = (CB_SILENCE - this.releaseStartCb) / CB_SILENCE;
        this.releaseDuration *= releaseFraction;
        // Voice may be off instantly
        // Testcase: mono mode
        if (this.releaseStartCb >= PERCEIVED_CB_SILENCE) {
            voice.isActive = false;
        }
    }

    /**
     * Initialize the volume envelope
     * @param voice The voice this envelope belongs to
     */
    public init(voice: Voice) {
        this.enteredRelease = false;
        this.state = 0;
        this.sampleTime = 0;
        this.canEndOnSilentSustain =
            voice.modulatedGenerators[generatorTypes.sustainVolEnv] >=
            PERCEIVED_CB_SILENCE;

        // Set the initial gain
        this.peakGain =
            CENTIBEL_LOOKUP_TABLE[
                (voice.modulatedGenerators[generatorTypes.initialAttenuation] -
                    MIN_CENTIBELS) |
                    0
            ];
        this.outputGain = this.peakGain;

        // Calculate absolute times (they can change so we have to recalculate every time
        this.sustainCb = Math.min(
            CB_SILENCE,
            voice.modulatedGenerators[generatorTypes.sustainVolEnv]
        );

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
        const fraction = this.sustainCb / CB_SILENCE;
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

        // If the voice has no attack or delay time, set current db to peak
        if (this.attackEnd === 0) {
            // This.attenuationCb = this.attenuationTarget;
            this.state = 2;
        }
    }

    /**
     * Calculates the gain value for the last sample in the block and writes it to `outputGain`.
     * Essentially we use approach of 100dB is silence, 0dB is peak.
     * @param sampleCount the amount of samples to write
     * @param gainTarget the gain target to smooth.
     * @returns if the voice has finished.
     */
    public process(sampleCount: number, gainTarget: number): boolean {
        const {
            releaseStartTimeSamples,
            releaseStartCb,
            releaseDuration,
            gainSmoothing,
            delayEnd,
            attackEnd,
            attackDuration,
            holdEnd,
            decayEnd,
            decayDuration,
            sustainCb
        } = this;
        // Advance time by the entire block to calculate the last sample's gain
        const sampleTime = (this.sampleTime += sampleCount);

        // Gain smoothing
        if (this.peakGain !== gainTarget) {
            this.peakGain += (gainTarget - this.peakGain) * gainSmoothing;
        }
        const peakGain = this.peakGain;

        if (this.enteredRelease) {
            // How much time has passed since release was started?
            const elapsedRelease = sampleTime - releaseStartTimeSamples;
            const cbDifference = CB_SILENCE - releaseStartCb;

            // Linearly ramp down decibels
            this.attenuationCb =
                (elapsedRelease / releaseDuration) * cbDifference +
                releaseStartCb;
            this.outputGain =
                CENTIBEL_LOOKUP_TABLE[
                    (this.attenuationCb - MIN_CENTIBELS) | 0
                ] * peakGain;
            return this.attenuationCb < PERCEIVED_CB_SILENCE;
        }
        switch (this.state) {
            case 0: {
                // Delay phase: no sound is produced
                if (sampleTime < delayEnd) {
                    // Silence
                    this.attenuationCb = CB_SILENCE;
                    this.outputGain = 0;
                    return true;
                }
                this.state++;
            }
            // Fallthrough
            case 1: {
                // Attack phase: ramp from 0 to attenuation
                if (sampleTime < attackEnd) {
                    // Set current attenuation to peak as its invalid during this phase
                    this.attenuationCb = 0;
                    // Special case: linear gain ramp instead of linear db ramp
                    const linearGain =
                        1 - (attackEnd - sampleTime) / attackDuration;
                    this.outputGain = linearGain * peakGain;
                    return true;
                }

                this.state++;
            }
            // Fallthrough
            case 2: {
                // Hold/peak phase: stay at max volume
                if (sampleTime < holdEnd) {
                    // Peak, no attenuation
                    this.attenuationCb = 0;
                    this.outputGain = peakGain;
                    return true;
                }
                this.state++;
            }
            // Fallthrough
            case 3: {
                if (sampleTime < decayEnd) {
                    // Linear centibel ramp down to sustain
                    this.attenuationCb =
                        (1 - (decayEnd - sampleTime) / decayDuration) *
                        sustainCb;
                    this.outputGain =
                        peakGain *
                        CENTIBEL_LOOKUP_TABLE[
                            (this.attenuationCb - MIN_CENTIBELS) | 0
                        ];
                    return true;
                }
                this.state++;
            }
            // Fallthrough
            case 4: {
                if (
                    this.canEndOnSilentSustain &&
                    sustainCb >= PERCEIVED_CB_SILENCE
                ) {
                    // Make sure to fill with silence
                    // https://github.com/spessasus/spessasynth_core/issues/57
                    this.attenuationCb = CB_SILENCE;
                    this.outputGain = 0;
                    return false;
                }

                // Sustain phase: stay at sustain
                this.attenuationCb = sustainCb;
                this.outputGain =
                    peakGain *
                    CENTIBEL_LOOKUP_TABLE[(sustainCb - MIN_CENTIBELS) | 0];
                return true;
            }
        }
    }

    private timecentsToSamples(tc: number) {
        return Math.max(
            0,
            Math.floor(timecentsToSeconds(tc) * this.sampleRate)
        );
    }
}

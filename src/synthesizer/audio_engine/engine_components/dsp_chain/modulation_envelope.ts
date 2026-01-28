import { timecentsToSeconds } from "../unit_converter";
import { getModulatorCurveValue } from "../modulator_curves";
import { type Voice } from "../voice";
import { generatorTypes } from "../../../../soundbank/basic_soundbank/generator_types";
import { modulatorCurveTypes } from "../../../../soundbank/enums";

/**
 * Modulation_envelope.ts
 * purpose: calculates the modulation envelope for the given voice
 */
const MODENV_PEAK = 1;

// 1000 should be precise enough
const CONVEX_ATTACK = new Float32Array(1000);
for (let i = 0; i < CONVEX_ATTACK.length; i++) {
    // This makes the db linear (I think)
    CONVEX_ATTACK[i] = getModulatorCurveValue(
        0,
        modulatorCurveTypes.convex,
        i / 1000
    );
}

export class ModulationEnvelope {
    /**
     * The attack duration, in seconds.
     */
    private attackDuration = 0;
    /**
     * The decay duration, in seconds.
     */
    private decayDuration = 0;
    /**
     * The hold duration, in seconds.
     */
    private holdDuration = 0;
    /**
     * Release duration, in seconds.
     */
    private releaseDuration = 0;
    /**
     * The sustain level 0-1.
     */
    private sustainLevel = 0;
    /**
     * Delay phase end time in seconds, absolute (audio context time).
     */
    private delayEnd = 0;
    /**
     * Attack phase end time in seconds, absolute (audio context time).
     */
    private attackEnd = 0;
    /**
     * Hold phase end time in seconds, absolute (audio context time).
     */
    private holdEnd = 0;
    /**
     * The level of the envelope when the release phase starts.
     */
    private releaseStartLevel = 0;
    /**
     * The current modulation envelope value.
     */
    private currentValue = 0;
    /**
     * If the modulation envelope has ever entered the release phase.
     */
    private enteredRelease = false;

    /**
     * Decay phase end time in seconds, absolute (audio context time).
     */
    private decayEnd = 0;

    /**
     * Calculates the current modulation envelope value for the given time and voice.
     * @param voice the voice we are working on.
     * @param currentTime in seconds.
     * @returns  mod env value, from 0 to 1.
     */
    public process(voice: Voice, currentTime: number): number {
        if (this.enteredRelease) {
            // If the voice is still in the delay phase,
            // Start level will be 0 that will result in divide by zero
            if (this.releaseStartLevel === 0) {
                return 0;
            }
            return Math.max(
                0,
                (1 -
                    (currentTime - voice.releaseStartTime) /
                        this.releaseDuration) *
                    this.releaseStartLevel
            );
        }

        if (currentTime < this.delayEnd) {
            this.currentValue = 0; // Delay
        } else if (currentTime < this.attackEnd) {
            // Modulation envelope uses convex curve for attack
            this.currentValue =
                CONVEX_ATTACK[
                    ~~(
                        (1 -
                            (this.attackEnd - currentTime) /
                                this.attackDuration) *
                        1000
                    )
                ];
        } else if (currentTime < this.holdEnd) {
            // Hold: stay at 1
            this.currentValue = MODENV_PEAK;
        } else if (currentTime < this.decayEnd) {
            // Decay: linear ramp from 1 to sustain level
            this.currentValue =
                (1 - (this.decayEnd - currentTime) / this.decayDuration) *
                    (this.sustainLevel - MODENV_PEAK) +
                MODENV_PEAK;
        } else {
            // Sustain: stay at sustain level
            this.currentValue = this.sustainLevel;
        }
        return this.currentValue;
    }

    /**
     * Starts the release phase in the envelope.
     * @param voice the voice this envelope belongs to.
     */
    public startRelease(voice: Voice) {
        this.releaseStartLevel = this.currentValue;
        this.enteredRelease = true;

        // Min is set to -7200 to prevent lowpass clicks
        const releaseTime = timecentsToSeconds(
            Math.max(
                voice.modulatedGenerators[generatorTypes.releaseModEnv],
                -7200
            )
        );
        // Release time is from the full level to 0%
        // To get the actual time, multiply by the release start level
        this.releaseDuration = releaseTime * this.releaseStartLevel;
    }

    /**
     * Initializes the modulation envelope.
     * @param voice the voice this envelope belongs to.
     */
    public init(voice: Voice) {
        this.enteredRelease = false;
        this.sustainLevel =
            1 - voice.modulatedGenerators[generatorTypes.sustainModEnv] / 1000;

        this.attackDuration = timecentsToSeconds(
            voice.modulatedGenerators[generatorTypes.attackModEnv]
        );

        const decayKeyExcursionCents =
            (60 - voice.midiNote) *
            voice.modulatedGenerators[generatorTypes.keyNumToModEnvDecay];
        const decayTime = timecentsToSeconds(
            voice.modulatedGenerators[generatorTypes.decayModEnv] +
                decayKeyExcursionCents
        );
        // According to the specification, the decay time is the time it takes to reach 0% from 100%.
        // Calculate the time to reach actual sustain level,
        // For example, sustain 0.6 will be 0.4 of the decay time
        this.decayDuration = decayTime * (1 - this.sustainLevel);

        const holdKeyExcursionCents =
            (60 - voice.midiNote) *
            voice.modulatedGenerators[generatorTypes.keyNumToModEnvHold];
        this.holdDuration = timecentsToSeconds(
            holdKeyExcursionCents +
                voice.modulatedGenerators[generatorTypes.holdModEnv]
        );

        this.delayEnd =
            voice.startTime +
            timecentsToSeconds(
                voice.modulatedGenerators[generatorTypes.delayModEnv]
            );
        this.attackEnd = this.delayEnd + this.attackDuration;
        this.holdEnd = this.attackEnd + this.holdDuration;
        this.decayEnd = this.holdEnd + this.decayDuration;
    }
}

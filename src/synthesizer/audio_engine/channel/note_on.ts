import { portamentoTimeToSeconds } from "./portamento_time";
import { GENERATOR_OVERRIDE_NO_CHANGE_VALUE } from "../synth_constants";
import type { MIDIChannel } from "./midi_channel";
import type { SampleLoopingMode } from "../voice/voice";
import {
    GENERATORS_AMOUNT,
    GeneratorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import { MIDIControllers } from "../../../midi/enums";
import { ALTERNATING_OFF } from "../voice/wavetable_oscillator/wavetable_oscillator";
import { timecentsToSeconds } from "../voice/unit_converter";
import { SpessaLog } from "../../../utils/loggin";
import { randomGenerator } from "../../../utils/other";

const clamp = (num: number, min: number, max: number) =>
    Math.max(min, Math.min(max, num));

/**
 * Sends a "MIDI Note on" message and starts a note.
 * @param midiNote The MIDI note number (0-127).
 * @param velocity The velocity of the note (0-127). If less than 1, it will send a note off instead.
 * @param emit If the note on should be updated and emitted (non-internal)
 */
export function noteOn(
    this: MIDIChannel,
    midiNote: number,
    velocity: number,
    emit = true
) {
    if (velocity < 1) {
        this.noteOff(midiNote);
        return;
    }

    const black = this.synthCore.systemParameters.blackMIDIMode;
    if (
        // If black MIDI conditions are met...
        (black && this.synthCore.voiceCount > 200 && velocity < 40) ||
        (black && velocity < 10) ||
        // Or channel is muted...
        this._systemParameters.isMuted ||
        // Or channel has no preset...
        !this.preset
    ) {
        return;
    }

    // Apply Velocity Sense and clamp
    const realVelocity = clamp(
        Math.floor(
            velocity * (this._midiParameters.velocitySenseDepth / 64) +
                (this._midiParameters.velocitySenseOffset - 64) * 2
        ),
        0,
        127
    );

    // Sanity check
    if (midiNote > 127 || midiNote < 0) return;
    // Drum keys may not receive note on
    if (this._drumChannel && !this.drumParams[midiNote].rxNoteOn) return;

    // Note which we should grab presets from (strictly internal)
    let soundBankNote = midiNote + this.currentKeyShift;

    // MIDI Tuning Standard
    const program = this.preset.program;
    const tune = this.synthCore.tunings[program * 128 + midiNote];
    if (tune >= 0)
        // Overwrite the note with MIDI tuning standard!
        soundBankNote = Math.trunc(tune);

    // The key shift may push the note out of range
    if (soundBankNote > 127 || soundBankNote < 0) return;

    // Monophonic retrigger
    if (
        (this._systemParameters.monophonicRetrigger ??
            this.synthCore.systemParameters.monophonicRetrigger) ||
        this._midiParameters.assignMode === 0
    )
        this.killNote(midiNote);

    // Gain
    let voiceGain = 1;

    // Portamento
    const previousNote = this.lastPortamentoNote;
    const portamentoEnabled =
        this.portamentoForce ||
        this._midiControllers[MIDIControllers.portamentoOnOff] >= 8192;

    // 14-bit MIDI CC -> 7-bit value
    const portamentoTime =
        this._midiControllers[MIDIControllers.portamentoTime] >> 7;

    const canApplyPortamento =
        portamentoEnabled && // Enabled?
        !this._drumChannel && // Not a drum channel?
        previousNote >= 0 && // Valid note?
        previousNote !== midiNote && // Not the same note?
        portamentoTime > 0; // Non-instant time?

    let portaFromKey = -1;
    let portaTime = 0;

    if (canApplyPortamento) {
        const keyDistance = Math.abs(midiNote - previousNote);

        portaFromKey = previousNote;
        portaTime = portamentoTimeToSeconds(portamentoTime, keyDistance);

        this.portamentoForce = false;
    }

    // Always track the last note, even if portamento isn't applied.
    // See: https://github.com/spessasus/spessasynth_core/issues/77
    this.lastPortamentoNote = midiNote;

    this.playingNotes[midiNote] = true;

    // Mono mode. A drum part ignores it, like on the Sound Canvas (SC-88Pro and SC-8850 manuals)
    if (!this._midiParameters.polyMode && !this._drumChannel) {
        if (this.lastMonoNote >= 0 && this.lastMonoNote !== midiNote)
            this.killNote(this.lastMonoNote);
        this.lastMonoNote = midiNote;
        this.lastMonoVelocity = velocity;
    }

    // Get voices
    const voices = this.synthCore.getVoices(
        this.channel,
        soundBankNote,
        realVelocity
    );

    // Overrides
    // Zero means disabled
    let panOverride = 0;
    let exclusiveOverride = 0;
    let pitchOffset = 0;
    let reverbGain = 1;
    let chorusGain = 1;
    let variationGain = 1;
    if (this._midiParameters.randomPan) {
        // The range is -500 to 500
        panOverride = Math.round(randomGenerator() * 1000 - 500);
    }

    // Drum parameters
    if (this._drumChannel) {
        const p = this.drumParams[midiNote];
        const drumPan = p.pan - 64;
        // If pan is different from default then it's overridden
        if (drumPan !== 0) {
            if (drumPan === -64) {
                // Random pan
                panOverride = Math.round(randomGenerator() * 1000 - 500);
            } else {
                const channelPan =
                    (this._midiControllers[MIDIControllers.pan] >> 7) - 64;
                const targetPan = Math.max(
                    -63,
                    Math.min(drumPan + channelPan, 63)
                );
                // Ensure that override is applied, even for zero
                panOverride = (targetPan / 63) * 500 || 1;
            }
        }

        pitchOffset = p.pitchFine + p.pitchCoarse * 100;
        exclusiveOverride = p.assignGroup;
        reverbGain = p.reverbSend / 127;
        chorusGain = p.chorusSend / 127;
        variationGain = p.variationSend / 127;
        this.synthCore.gsDelayActive ||= variationGain > 0;
        voiceGain = Math.pow(p.level / 120, 2);
    }

    const noteID = emit ? this.noteOnID[midiNote]++ : this.noteOnID[midiNote];

    // Apply exclusive class before adding the voices, so the voices of this note on do not end each other.
    // Mono mode chokes too, voices held by the pedal can survive a switch to mono
    if (this._voiceCount > 0) {
        for (const cached of voices) {
            const exclusiveClass = exclusiveOverride || cached.exclusiveClass;
            if (exclusiveClass === 0) continue;
            // Kill all voices with the same exclusive class
            for (const v of this.synthCore.voices) {
                if (
                    v.isActive &&
                    v.channel === this.channel &&
                    v.exclusiveClass === exclusiveClass
                ) {
                    if (v.startTime > this.synthCore.currentTime) {
                        // A delayed voice that has not started yet never sounds
                        v.isActive = false;
                    } else {
                        v.exclusiveRelease(this.synthCore.currentTime);
                    }
                }
            }
        }
    }

    // Add voices
    for (const cached of voices) {
        const voice = this.synthCore.assignVoice();
        const now = this.synthCore.currentTime;
        voice.setup(now, this.channel, midiNote, noteID);

        // Select the correct oscillator
        // Channel takes precedence
        voice.wavetable =
            voice.oscillators[
                this._systemParameters.interpolationType ??
                    this.synthCore.systemParameters.interpolationType
            ];

        // Set cached data
        voice.targetKey = cached.targetKey;
        voice.velocity = cached.velocity;
        voice.generators.set(cached.generators);
        voice.exclusiveClass = exclusiveOverride || cached.exclusiveClass;
        voice.rootKey = cached.rootKey;
        voice.wavetable.sampleData = cached.sampleData;
        voice.wavetable.playbackStep = cached.playbackStep;

        voice.modulators = cached.modulators;

        if (voice.modulators.length > voice.modulatorValues.length) {
            SpessaLog.warn(
                `${voice.modulators.length} modulators! Increasing modulatorValues table.`
            );
            voice.modulatorValues = new Float64Array(voice.modulators.length);
        }

        // Apply generator override
        if (this.generators.overridesEnabled) {
            const g = this.generators.overrides;
            for (let type = 0; type < GENERATORS_AMOUNT; type++) {
                const overrideValue = g[type];
                if (overrideValue === GENERATOR_OVERRIDE_NO_CHANGE_VALUE)
                    continue;
                voice.generators[type] = overrideValue;
            }
        }

        // Compute all modulators
        this.computeModulators(voice);
        // SampleModes is read once, here. Its modulators are ignored (SFe 4.0, section 7.1), the generator overrides apply
        voice.loopingMode = voice.modulatedGenerators[
            GeneratorTypes.sampleModes
        ] as SampleLoopingMode;
        const modulated = voice.modulatedGenerators;

        // Delayed voice start (SFe): everything below runs from the delayed start time
        // -32768 (the default) is zero time
        voice.startTime += timecentsToSeconds(
            modulated[GeneratorTypes.delayVoice]
        );
        const start = voice.startTime;

        // Initialize the volume envelope (non-realtime)
        voice.volEnv.init(voice);

        // Initialize the modulation envelopes (non-realtime)
        voice.modEnv.init(voice);
        voice.modEnv2.init(voice);

        voice.filter.init();

        // Calculate LFO start times
        voice.vibLfoStartTime =
            start + timecentsToSeconds(modulated[GeneratorTypes.delayVibLFO]);
        voice.modLfoStartTime =
            start + timecentsToSeconds(modulated[GeneratorTypes.delayModLFO]);
        // LFO fade in and start phase (SFe)
        // -32768 (the default) is zero time, so no fade
        voice.vibLfoFade = timecentsToSeconds(
            modulated[GeneratorTypes.fadeVibLFO]
        );
        voice.modLfoFade = timecentsToSeconds(
            modulated[GeneratorTypes.fadeModLFO]
        );
        voice.vibLfoPhase +=
            (modulated[GeneratorTypes.vibLfoStartPhase] % 360) / 360;
        if (voice.vibLfoPhase >= 1) voice.vibLfoPhase -= 1;
        voice.modLfoPhase +=
            (modulated[GeneratorTypes.modLfoStartPhase] % 360) / 360;
        if (voice.modLfoPhase >= 1) voice.modLfoPhase -= 1;

        // Modulate sample offsets (these are not real time).
        // The modulated values are truncated toward zero (SFe 4.0, section 7.1)
        const g = voice.modulatedGenerators;
        const cursorStartOffset =
            Math.trunc(g[GeneratorTypes.startAddrsOffset]) +
            Math.trunc(g[GeneratorTypes.startAddrsCoarseOffset]) * 32_768;
        // This will be negative
        const endOffset =
            Math.trunc(g[GeneratorTypes.endAddrOffset]) +
            Math.trunc(g[GeneratorTypes.endAddrsCoarseOffset]) * 32_768;
        const loopStartOffset =
            Math.trunc(g[GeneratorTypes.startloopAddrsOffset]) +
            Math.trunc(g[GeneratorTypes.startloopAddrsCoarseOffset]) * 32_768;
        const loopEndOffset =
            Math.trunc(g[GeneratorTypes.endloopAddrsOffset]) +
            Math.trunc(g[GeneratorTypes.endloopAddrsCoarseOffset]) * 32_768;

        // Clamp the sample offsets
        // End is exclusive, not inclusive.
        // Testcase: https://github.com/spessasus/spessasynth_core/issues/90
        const endExclusive = cached.sampleData.length;
        voice.wavetable.cursor = clamp(cursorStartOffset, 0, endExclusive - 1);
        voice.wavetable.end = clamp(endExclusive + endOffset, 0, endExclusive);
        voice.wavetable.loopStart = clamp(
            cached.loopStart + loopStartOffset,
            0,
            endExclusive
        );
        voice.wavetable.loopEnd = clamp(
            cached.loopEnd + loopEndOffset,
            0,
            endExclusive
        );
        // Swap loops if needed
        if (voice.wavetable.loopEnd < voice.wavetable.loopStart) {
            const temp = voice.wavetable.loopStart;
            voice.wavetable.loopStart = voice.wavetable.loopEnd;
            voice.wavetable.loopEnd = temp;
        }
        if (
            voice.wavetable.loopEnd - voice.wavetable.loopStart < 1 && // Disable loop if enabled
            // Don't disable on release mode. Testcase:
            // https://github.com/spessasus/SpessaSynth/issues/174
            (voice.loopingMode === 1 ||
                voice.loopingMode === 3 ||
                voice.loopingMode === 4)
        ) {
            voice.loopingMode = 0;
        }
        voice.wavetable.loopLength =
            voice.wavetable.loopEnd - voice.wavetable.loopStart;
        voice.wavetable.turn = ALTERNATING_OFF;
        // An alternating loop plays as a forward loop through the turn and back, without repeating the turn points.
        // One point long, it is the same as a forward loop.
        if (voice.loopingMode === 4 && voice.wavetable.loopLength > 1) {
            voice.wavetable.turn = voice.wavetable.loopEnd - 1;
            voice.wavetable.loopLength = (voice.wavetable.loopLength - 1) * 2;
            voice.wavetable.loopEnd =
                voice.wavetable.loopStart + voice.wavetable.loopLength;
        }
        voice.wavetable.isLooping =
            voice.loopingMode === 1 ||
            voice.loopingMode === 3 ||
            voice.loopingMode === 4;
        voice.wavetable.hasLooped = false;

        // Apply portamento
        voice.portamentoFromKey = portaFromKey;
        voice.portamentoDuration = portaTime;

        // Apply special params
        voice.overridePan = panOverride;
        voice.gainModifier = voiceGain;
        voice.pitchOffset = pitchOffset;
        voice.reverbGain = reverbGain;
        voice.chorusGain = chorusGain;
        voice.variationGain = variationGain;

        // Set initial pan to avoid split second changing from middle to the correct value
        voice.currentPan = Math.max(
            -500,
            Math.min(
                500,
                panOverride || voice.modulatedGenerators[GeneratorTypes.pan]
            )
        ); //  -500 to 500
    }
    this._voiceCount += voices.length;
    if (emit)
        this.synthCore.callEvent("noteOn", {
            midiNote,
            channel: this.channel,
            velocity
        });
}

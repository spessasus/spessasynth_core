import { portamentoTimeToSeconds } from "./portamento_time";
import { GENERATOR_OVERRIDE_NO_CHANGE_VALUE } from "../synth_constants";
import type { MIDIChannel } from "./midi_channel";
import {
    GENERATORS_AMOUNT,
    GeneratorTypes
} from "../../../soundbank/basic_soundbank/generator_types";
import { MIDIControllers } from "../../../midi/enums";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { timecentsToSeconds } from "../voice/unit_converter";
import { SpessaLog } from "../../../utils/loggin";

const clamp = (num: number, min: number, max: number) =>
    Math.max(min, Math.min(max, num));

/**
 * Sends a "MIDI Note on" message and starts a note.
 * @param midiNote The MIDI note number (0-127).
 * @param velocity The velocity of the note (0-127). If less than 1, it will send a note off instead.
 */
export function noteOn(this: MIDIChannel, midiNote: number, velocity: number) {
    if (velocity < 1) {
        this.noteOff(midiNote);
        return;
    }
    velocity = clamp(velocity, 0, 127);

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

    // Note which we should grab presets from (strictly internal)
    let soundBankNote = midiNote + this.currentKeyShift;
    // Sanity check
    if (midiNote > 127 || midiNote < 0) return;

    // MIDI Tuning Standard
    const program = this.preset.program;
    const tune = this.synthCore.tunings[program * 128 + midiNote];
    if (tune >= 0)
        // Overwrite the note with MIDI tuning standard!
        soundBankNote = Math.trunc(tune);

    // Monophonic retrigger
    if (
        (this._systemParameters.monophonicRetrigger ??
            this.synthCore.systemParameters.monophonicRetrigger) ||
        this._midiParameters.assignMode === 0
    )
        this.killNote(midiNote);

    // Key velocity override
    const keyVel = this.synthCore.keyModifierManager.getVelocity(
        this.channel,
        midiNote
    );
    if (keyVel > -1) {
        velocity = keyVel;
    }

    // Gain
    let voiceGain = this.synthCore.keyModifierManager.getGain(
        this.channel,
        midiNote
    );

    // Portamento
    const previousNote = this.lastNote;
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
    this.lastNote = midiNote;

    // Mono mode
    if (!this._midiParameters.polyMode) {
        let vc = 0;
        if (this._voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (v.isActive && v.channel === this.channel) {
                    // No minimum note time, release ASAP
                    v.exclusiveRelease(this.synthCore.currentTime, 0);
                    if (++vc >= this._voiceCount) break; // We already checked all the voices
                }
            }
    }

    // Get voices
    const voices = this.synthCore.getVoices(
        this.channel,
        soundBankNote,
        velocity
    );

    // Overrides
    // Zero means disabled
    let panOverride = 0;
    let exclusiveOverride = 0;
    let pitchOffset = 0;
    let reverbSend = 1;
    let chorusSend = 1;
    let delaySend = 1;
    if (this._midiParameters.randomPan) {
        // The range is -500 to 500
        panOverride = Math.round(Math.random() * 1000 - 500);
    }

    // Drum parameters
    if (this._drumChannel) {
        const p = this.drumParams[midiNote];
        if (!p.rxNoteOn) {
            return;
        }
        const drumPan = p.pan - 64;
        // If pan is different from default then it's overridden
        if (drumPan !== 0) {
            if (drumPan === -64) {
                // Random pan
                panOverride = Math.round(Math.random() * 1000 - 500);
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

        pitchOffset = p.pitch;
        exclusiveOverride = p.exclusiveClass;
        reverbSend = p.reverbGain;
        chorusSend = p.chorusGain;
        delaySend = p.delayGain;
        // 1 is no override
        if (voiceGain === 1) voiceGain = p.gain;
    }

    // Add voices
    for (const cached of voices) {
        const voice = this.synthCore.assignVoice();
        const now = this.synthCore.currentTime;
        voice.setup(now, this.channel, midiNote);

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
        voice.loopingMode = cached.loopingMode;
        voice.wavetable.sampleData = cached.sampleData;
        voice.wavetable.playbackStep = cached.playbackStep;

        // Set modulators
        if (this.dynamicModulators.active) {
            // We have to copy them...
            voice.modulators = [...cached.modulators];
            // Dynamic modulators
            for (const m of this.dynamicModulators.modulatorList) {
                const existingModIndex = voice.modulators.findIndex(
                    (voiceMod) => Modulator.isIdentical(voiceMod, m.mod)
                );

                // Replace or add
                if (existingModIndex === -1) {
                    voice.modulators.push(m.mod);
                } else {
                    voice.modulators[existingModIndex] = m.mod;
                }
            }
        } else {
            // Set directly
            voice.modulators = cached.modulators;
        }

        if (voice.modulators.length > voice.modulatorValues.length) {
            SpessaLog.warn(
                `${voice.modulators.length} modulators! Increasing modulatorValues table.`
            );
            voice.modulatorValues = new Int16Array(voice.modulators.length);
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

        // Apply exclusive class
        // In mono mode all voices have been killed already
        if (voice.exclusiveClass !== 0 && this._midiParameters.polyMode) {
            // Kill all voices with the same exclusive class
            let vc = 0;
            if (this._voiceCount > 0)
                for (const v of this.synthCore.voices) {
                    if (
                        v.isActive &&
                        v.channel === this.channel &&
                        v.exclusiveClass === voice.exclusiveClass &&
                        // Only voices created in a different quantum
                        v.hasRendered
                    ) {
                        v.exclusiveRelease(this.synthCore.currentTime);
                        if (++vc >= this._voiceCount) break; // We already checked all the voices
                    }
                }
        }
        // Compute all modulators
        this.computeModulators(voice);

        // Initialize the volume envelope (non-realtime)
        voice.volEnv.init(voice);

        // Initialize the modulation envelope (non-realtime)
        voice.modEnv.init(voice);

        voice.filter.init();

        // Calculate LFO start times
        voice.vibLfoStartTime =
            now +
            timecentsToSeconds(
                voice.modulatedGenerators[GeneratorTypes.delayVibLFO]
            );
        voice.modLfoStartTime =
            now +
            timecentsToSeconds(
                voice.modulatedGenerators[GeneratorTypes.delayModLFO]
            );

        // Modulate sample offsets (these are not real time)
        const cursorStartOffset =
            voice.modulatedGenerators[GeneratorTypes.startAddrsOffset] +
            voice.modulatedGenerators[GeneratorTypes.startAddrsCoarseOffset] *
                32_768;
        const endOffset =
            voice.modulatedGenerators[GeneratorTypes.endAddrOffset] +
            voice.modulatedGenerators[GeneratorTypes.endAddrsCoarseOffset] *
                32_768;
        const loopStartOffset =
            voice.modulatedGenerators[GeneratorTypes.startloopAddrsOffset] +
            voice.modulatedGenerators[
                GeneratorTypes.startloopAddrsCoarseOffset
            ] *
                32_768;
        const loopEndOffset =
            voice.modulatedGenerators[GeneratorTypes.endloopAddrsOffset] +
            voice.modulatedGenerators[GeneratorTypes.endloopAddrsCoarseOffset] *
                32_768;

        // Clamp the sample offsets
        const lastSample = cached.sampleData.length - 1;
        voice.wavetable.cursor = clamp(cursorStartOffset, 0, lastSample);
        voice.wavetable.end = clamp(lastSample + endOffset, 0, lastSample);
        voice.wavetable.loopStart = clamp(
            cached.loopStart + loopStartOffset,
            0,
            lastSample
        );
        voice.wavetable.loopEnd = clamp(
            cached.loopEnd + loopEndOffset,
            0,
            lastSample
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
            (voice.loopingMode === 1 || voice.loopingMode === 3)
        ) {
            voice.loopingMode = 0;
        }
        // LoopEnd is inclusive. Testcase:
        // https://github.com/spessasus/spessasynth_core/issues/90
        voice.wavetable.loopLength =
            voice.wavetable.loopEnd - voice.wavetable.loopStart + 1;
        voice.wavetable.isLooping =
            voice.loopingMode === 1 || voice.loopingMode === 3;

        // Apply portamento
        voice.portamentoFromKey = portaFromKey;
        voice.portamentoDuration = portaTime;

        // Apply special params
        voice.overridePan = panOverride;
        voice.gainModifier = voiceGain;
        voice.pitchOffset = pitchOffset;
        voice.reverbSend = reverbSend;
        voice.chorusSend = chorusSend;
        voice.delaySend = delaySend;

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
    this.synthCore.callEvent("noteOn", {
        midiNote,
        channel: this.channel,
        velocity
    });
}

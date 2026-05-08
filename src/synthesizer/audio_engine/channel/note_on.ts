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
import { SpessaSynthLog } from "../../../utils/loggin";

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
    velocity = Math.min(127, velocity);

    const black = this.synthCore.masterParameters.blackMIDIMode;
    if (
        // If black MIDI conditions are met...
        (black && this.synthCore.voiceCount > 200 && velocity < 40) ||
        (black && velocity < 10) ||
        // Or channel is muted...
        this._masterParameters.isMuted ||
        // Or channel has no preset...
        !this.preset
    ) {
        return;
    }

    // Shift note by key shift
    midiNote += this.currentKeyShift;
    // Note which we should grab presets from
    let internalMidiNote = midiNote;

    // Sanity check
    if (midiNote > 127 || midiNote < 0) return;

    const program = this.preset.program;
    const tune = this.synthCore.tunings[program * 128 + midiNote];
    if (tune >= 0) internalMidiNote = Math.trunc(tune);

    // Monophonic retrigger
    if (
        this.synthCore.masterParameters.monophonicRetriggerMode ||
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
    let portamentoFromKey = -1;
    let portamentoDuration = 0;
    // Note: the 14-bit value needs to go down to 7-bit
    const portamentoTime =
        this.midiControllers[MIDIControllers.portamentoTime] >> 7;
    const portaControl =
        this.midiControllers[MIDIControllers.portamentoControl] >> 7;
    if (
        !this.drumChannel && // No portamento on drum channel
        portaControl !== midiNote && // If the same note, there's no portamento
        this.midiControllers[MIDIControllers.portamentoOnOff] >= 8192 // (64 << 7)
    ) {
        if (
            portamentoTime > 0 && // 0 duration means no portamento
            portaControl > 0
        ) {
            // Key 0 means initial portamento (no portamento)
            const diff = Math.abs(midiNote - portaControl);
            portamentoDuration = portamentoTimeToSeconds(portamentoTime, diff);
            portamentoFromKey = portaControl;
        }
        // Set portamento control to previous value
        // Note: track even when porta time is 0, see
        // https://github.com/spessasus/spessasynth_core/issues/77
        this.controllerChange(MIDIControllers.portamentoControl, midiNote);
    }

    // Mono mode
    if (!this._midiParameters.polyMode) {
        let vc = 0;
        if (this.voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (v.isActive && v.channel === this.channel) {
                    // No minimum note time, release ASAP
                    v.exclusiveRelease(this.synthCore.currentTime, 0);
                    if (++vc >= this.voiceCount) break; // We already checked all the voices
                }
            }
    }

    // Get voices
    const voices = this.synthCore.getVoices(
        this.channel,
        internalMidiNote,
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
    if (this.drumChannel) {
        const p = this.drumParams[midiNote];
        if (!p.rxNoteOn) {
            return;
        }
        const drumPan = p.pan;
        // If pan is different from default then it's overridden
        if (drumPan !== 64) {
            const targetPan =
                Math.max(
                    -63,
                    Math.min(
                        drumPan -
                            64 +
                            ((this.midiControllers[MIDIControllers.pan] >> 7) -
                                64),
                        63
                    )
                ) || 1; // Prevent 0 to not be flagged as disabled

            panOverride =
                drumPan === 0
                    ? // 0 is random pan
                      Math.round(Math.random() * 1000 - 500)
                    : // 1 is set pan
                      (targetPan / 63) * 500;
        }

        pitchOffset = p.pitch;
        exclusiveOverride = p.exclusiveClass;
        reverbSend = p.reverbGain;
        chorusSend = p.chorusGain;
        delaySend = p.delayGain;
        // 1 is no override
        if (voiceGain === 1) {
            voiceGain = p.gain;
        }
    }

    // Add voices
    for (const cached of voices) {
        const voice = this.synthCore.assignVoice();
        const now = this.synthCore.currentTime;
        voice.setup(now, this.channel, midiNote, velocity);

        // Select the correct oscillator
        voice.wavetable =
            voice.oscillators[
                this.synthCore.masterParameters.interpolationType
            ];

        // Set cached data
        voice.generators.set(cached.generators);
        voice.exclusiveClass = exclusiveOverride || cached.exclusiveClass;
        voice.rootKey = cached.rootKey;
        voice.loopingMode = cached.loopingMode;
        voice.wavetable.sampleData = cached.sampleData;
        voice.wavetable.playbackStep = cached.playbackStep;
        voice.targetKey = cached.targetKey;

        // Set modulators
        if (this.sysExModulators.active) {
            // We have to copy them...
            voice.modulators = [...cached.modulators];
            // Dynamic modulators
            for (const m of this.sysExModulators.modulatorList) {
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
            SpessaSynthLog.warn(
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
            if (this.voiceCount > 0)
                for (const v of this.synthCore.voices) {
                    if (
                        v.isActive &&
                        v.channel === this.channel &&
                        v.exclusiveClass === voice.exclusiveClass &&
                        // Only voices created in a different quantum
                        v.hasRendered
                    ) {
                        v.exclusiveRelease(this.synthCore.currentTime);
                        if (++vc >= this.voiceCount) break; // We already checked all the voices
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
        voice.wavetable.loopLength =
            voice.wavetable.loopEnd - voice.wavetable.loopStart;
        voice.wavetable.isLooping =
            voice.loopingMode === 1 || voice.loopingMode === 3;

        // Apply portamento
        voice.portamentoFromKey = portamentoFromKey;
        voice.portamentoDuration = portamentoDuration;

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
    this.voiceCount += voices.length;
    this.synthCore.callEvent("noteOn", {
        midiNote,
        channel: this.channel,
        velocity
    });
}

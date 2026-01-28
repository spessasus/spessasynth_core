import { portamentoTimeToSeconds } from "./portamento_time";
import { GENERATOR_OVERRIDE_NO_CHANGE_VALUE } from "../engine_components/synth_constants";
import { SpessaSynthWarn } from "../../../utils/loggin";
import type { MIDIChannel } from "../engine_components/midi_channel";
import { generatorTypes } from "../../../soundbank/basic_soundbank/generator_types";
import { midiControllers } from "../../../midi/enums";
import { customControllers } from "../../enums";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";

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

    if (
        (this.synthCore.masterParameters.blackMIDIMode &&
            this.synthCore.voiceCount > 200 &&
            velocity < 40) ||
        (this.synthCore.masterParameters.blackMIDIMode && velocity < 10) ||
        this._isMuted
    ) {
        return;
    }

    // Warning is handled for synth.
    if (!this.preset) {
        return;
    }

    const realKey =
        midiNote +
        this.channelTransposeKeyShift +
        this.customControllers[customControllers.channelKeyShift];
    let internalMidiNote = realKey;

    if (realKey > 127 || realKey < 0) {
        return;
    }
    const program = this.preset.program;
    const tune = this.synthCore.tunings[program * 128 + realKey];
    if (tune >= 0) {
        internalMidiNote = Math.trunc(tune);
    }

    // Monophonic retrigger
    if (this.synthCore.masterParameters.monophonicRetriggerMode) {
        this.killNote(midiNote);
    }

    // Key velocity override
    const keyVel = this.synthCore.keyModifierManager.getVelocity(
        this.channel,
        realKey
    );
    if (keyVel > -1) {
        velocity = keyVel;
    }

    // Gain
    const voiceGain = this.synthCore.keyModifierManager.getGain(
        this.channel,
        realKey
    );

    // Portamento
    let portamentoFromKey = -1;
    let portamentoDuration = 0;
    // Note: the 14-bit value needs to go down to 7-bit
    const portamentoTime =
        this.midiControllers[midiControllers.portamentoTime] >> 7;
    const portaControl =
        this.midiControllers[midiControllers.portamentoControl] >> 7;
    if (
        !this.drumChannel && // No portamento on drum channel
        portaControl !== internalMidiNote && // If the same note, there's no portamento
        this.midiControllers[midiControllers.portamentoOnOff] >= 8192 && // (64 << 7)
        portamentoTime > 0 // 0 duration means no portamento
    ) {
        if (portaControl > 0) {
            // Key 0 means initial portamento (no portamento)
            const diff = Math.abs(internalMidiNote - portaControl);
            portamentoDuration = portamentoTimeToSeconds(portamentoTime, diff);
            portamentoFromKey = portaControl;
        }
        // Set portamento control to previous value
        this.controllerChange(
            midiControllers.portamentoControl,
            internalMidiNote
        );
    }

    // Mono mode
    if (!this.polyMode) {
        let vc = 0;
        if (this.voiceCount > 0)
            for (const v of this.synthCore.voices) {
                if (v.active && v.channel === this.channel) {
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

    // Zero means disabled
    let panOverride = 0;
    if (this.randomPan) {
        // The range is -500 to 500
        panOverride = Math.round(Math.random() * 1000 - 500);
    }

    // Add voices
    for (const cached of voices) {
        const voice = this.synthCore.assignVoice();
        voice.setup(
            this.synthCore.currentTime,
            this.channel,
            internalMidiNote,
            velocity,
            realKey
        );

        // Select the correct oscillator
        voice.wavetable =
            voice.oscillators[
                this.synthCore.masterParameters.interpolationType
            ];

        // Set cached data
        voice.generators.set(cached.generators);
        voice.exclusiveClass = cached.exclusiveClass;
        voice.rootKey = cached.rootKey;
        voice.loopingMode = cached.loopingMode;
        voice.wavetable.sampleData = cached.sampleData;
        voice.wavetable.playbackStep = cached.playbackStep;
        voice.targetKey = cached.targetKey;

        // Set modulators
        if (this.sysExModulators.modulatorList.length > 0) {
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
            SpessaSynthWarn(
                `${voice.modulators.length} modulators! Increasing modulatorValues table.`
            );
            voice.modulatorValues = new Int16Array(voice.modulators.length);
        }

        // Apply generator override
        if (this.generatorOverridesEnabled) {
            for (const [
                generatorType,
                overrideValue
            ] of this.generatorOverrides.entries()) {
                if (overrideValue === GENERATOR_OVERRIDE_NO_CHANGE_VALUE) {
                    continue;
                }
                voice.generators[generatorType] = overrideValue;
            }
        }

        // Apply exclusive class
        // In mono mode all voices have been killed already
        if (voice.exclusiveClass !== 0 && this.polyMode) {
            // Kill all voices with the same exclusive class
            let vc = 0;
            if (this.voiceCount > 0)
                for (const v of this.synthCore.voices) {
                    if (
                        v.active &&
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

        // Modulate sample offsets (these are not real time)
        const cursorStartOffset =
            voice.modulatedGenerators[generatorTypes.startAddrsOffset] +
            voice.modulatedGenerators[generatorTypes.startAddrsCoarseOffset] *
                32_768;
        const endOffset =
            voice.modulatedGenerators[generatorTypes.endAddrOffset] +
            voice.modulatedGenerators[generatorTypes.endAddrsCoarseOffset] *
                32_768;
        const loopStartOffset =
            voice.modulatedGenerators[generatorTypes.startloopAddrsOffset] +
            voice.modulatedGenerators[
                generatorTypes.startloopAddrsCoarseOffset
            ] *
                32_768;
        const loopEndOffset =
            voice.modulatedGenerators[generatorTypes.endloopAddrsOffset] +
            voice.modulatedGenerators[generatorTypes.endloopAddrsCoarseOffset] *
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

        // Apply pan override
        voice.overridePan = panOverride;

        // Apply gain override
        voice.gainModifier = voiceGain;

        // Set initial pan to avoid split second changing from middle to the correct value
        voice.currentPan = Math.max(
            -500,
            Math.min(500, voice.modulatedGenerators[generatorTypes.pan])
        ); //  -500 to 500
    }
    this.voiceCount += voices.length;
    this.sendChannelProperty();
    this.synthCore.callEvent("noteOn", {
        midiNote: midiNote,
        channel: this.channel,
        velocity: velocity
    });
}

import { portamentoTimeToSeconds } from "./portamento_time";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { GENERATOR_OVERRIDE_NO_CHANGE_VALUE } from "../engine_components/synth_constants";
import { SpessaSynthWarn } from "../../../utils/loggin";
import type { MIDIChannel } from "../engine_components/midi_channel";
import { generatorTypes } from "../../../soundbank/basic_soundbank/generator_types";
import { midiControllers } from "../../../midi/enums";
import { customControllers } from "../../enums";

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
        (this.synthProps.masterParameters.blackMIDIMode &&
            this.synth.totalVoicesAmount > 200 &&
            velocity < 40) ||
        (this.synthProps.masterParameters.blackMIDIMode && velocity < 10) ||
        this.isMuted
    ) {
        return;
    }

    if (!this.preset) {
        SpessaSynthWarn(`No preset for channel ${this.channelNumber}!`);
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
    const program = this.preset?.program;
    const tune = this.synthProps.tunings[program]?.[realKey]?.midiNote;
    if (tune >= 0) {
        internalMidiNote = tune;
    }

    // Monophonic retrigger
    if (this.synthProps.masterParameters.monophonicRetriggerMode) {
        this.killNote(midiNote, -7200);
    }

    // Key velocity override
    const keyVel = this.synth.keyModifierManager.getVelocity(
        this.channelNumber,
        realKey
    );
    if (keyVel > -1) {
        velocity = keyVel;
    }

    // Gain
    const voiceGain = this.synth.keyModifierManager.getGain(
        this.channelNumber,
        realKey
    );

    // Portamento
    let portamentoFromKey = -1;
    let portamentoDuration = 0;
    // Note: the 14-bit value needs to go down to 7-bit
    const portamentoTime =
        this.midiControllers[midiControllers.portamentoTime] >> 7;
    const control = this.midiControllers[midiControllers.portamentoControl];
    const currentFromKey = control >> 7;
    if (
        !this.drumChannel && // No portamento on drum channel
        currentFromKey !== internalMidiNote && // If the same note, there's no portamento
        this.midiControllers[midiControllers.portamentoOnOff] >= 8192 && // (64 << 7)
        portamentoTime > 0 // 0 duration is no portamento
    ) {
        // A value of one means the initial portamento
        if (control !== 1) {
            const diff = Math.abs(internalMidiNote - currentFromKey);
            portamentoDuration = portamentoTimeToSeconds(portamentoTime, diff);
            portamentoFromKey = currentFromKey;
        }
        // Set portamento control to previous value
        this.controllerChange(
            midiControllers.portamentoControl,
            internalMidiNote
        );
    }
    // Get voices
    const voices = this.synthProps.getVoices(
        this.channelNumber,
        internalMidiNote,
        velocity,
        realKey
    );

    // Zero means disabled
    let panOverride = 0;
    if (this.randomPan) {
        // The range is -500 to 500
        panOverride = Math.round(Math.random() * 1000 - 500);
    }

    // Add voices
    const channelVoices = this.voices;
    voices.forEach((voice) => {
        // Apply portamento
        voice.portamentoFromKey = portamentoFromKey;
        voice.portamentoDuration = portamentoDuration;

        // Apply pan override
        voice.overridePan = panOverride;

        // Apply gain override
        voice.gain = voiceGain;

        // Dynamic modulators (if none, this won't iterate over anything)
        this.sysExModulators.modulatorList.forEach((m) => {
            const mod = m.mod;
            const existingModIndex = voice.modulators.findIndex((voiceMod) =>
                Modulator.isIdentical(voiceMod, mod)
            );

            // Replace or add
            if (existingModIndex !== -1) {
                voice.modulators[existingModIndex] = Modulator.copy(mod);
            } else {
                voice.modulators.push(Modulator.copy(mod));
            }
        });

        // Apply generator override
        if (this.generatorOverridesEnabled) {
            this.generatorOverrides.forEach((overrideValue, generatorType) => {
                if (overrideValue === GENERATOR_OVERRIDE_NO_CHANGE_VALUE) {
                    return;
                }
                voice.generators[generatorType] = overrideValue;
            });
        }

        // Apply exclusive class
        const exclusive = voice.exclusiveClass;
        if (exclusive !== 0) {
            // Kill all voices with the same exclusive class
            channelVoices.forEach((v) => {
                if (v.exclusiveClass === exclusive) {
                    v.exclusiveRelease(this.synth.currentSynthTime);
                }
            });
        }
        // Compute all modulators
        this.computeModulators(voice);
        // Modulate sample offsets (these are not real time)
        const cursorStartOffset =
            voice.modulatedGenerators[generatorTypes.startAddrsOffset] +
            voice.modulatedGenerators[generatorTypes.startAddrsCoarseOffset] *
                32768;
        const endOffset =
            voice.modulatedGenerators[generatorTypes.endAddrOffset] +
            voice.modulatedGenerators[generatorTypes.endAddrsCoarseOffset] *
                32768;
        const loopStartOffset =
            voice.modulatedGenerators[generatorTypes.startloopAddrsOffset] +
            voice.modulatedGenerators[
                generatorTypes.startloopAddrsCoarseOffset
            ] *
                32768;
        const loopEndOffset =
            voice.modulatedGenerators[generatorTypes.endloopAddrsOffset] +
            voice.modulatedGenerators[generatorTypes.endloopAddrsCoarseOffset] *
                32768;
        const sm = voice.sample;
        // Apply them
        const clamp = (num: number) =>
            Math.max(0, Math.min(sm.sampleData.length - 1, num));
        sm.cursor = clamp(sm.cursor + cursorStartOffset);
        sm.end = clamp(sm.end + endOffset);
        sm.loopStart = clamp(sm.loopStart + loopStartOffset);
        sm.loopEnd = clamp(sm.loopEnd + loopEndOffset);
        // Swap loops if needed
        if (sm.loopEnd < sm.loopStart) {
            const temp = sm.loopStart;
            sm.loopStart = sm.loopEnd;
            sm.loopEnd = temp;
        }
        if (sm.loopEnd - sm.loopStart < 1) {
            // Disable loop if enabled
            // Don't disable on release mode. Testcase:
            // https://github.com/spessasus/SpessaSynth/issues/174
            if (sm.loopingMode === 1 || sm.loopingMode === 3) {
                sm.loopingMode = 0;
                sm.isLooping = false;
            }
        }
        // Set the current attenuation to target,
        // As it's interpolated (we don't want 0 attenuation for even a split second)
        voice.volumeEnvelope.attenuation =
            voice.volumeEnvelope.attenuationTargetGain;
        // Set initial pan to avoid split second changing from middle to the correct value
        voice.currentPan = Math.max(
            -500,
            Math.min(500, voice.modulatedGenerators[generatorTypes.pan])
        ); //  -500 to 500
    });

    this.synth.totalVoicesAmount += voices.length;
    // Cap the voices
    if (
        this.synth.totalVoicesAmount > this.synthProps.masterParameters.voiceCap
    ) {
        this.synthProps.voiceKilling(voices.length);
    }
    channelVoices.push(...voices);
    this.sendChannelProperty();
    this.synthProps.callEvent("noteOn", {
        midiNote: midiNote,
        channel: this.channelNumber,
        velocity: velocity
    });
}

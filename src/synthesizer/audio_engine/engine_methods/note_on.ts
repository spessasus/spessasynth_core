import { portamentoTimeToSeconds } from "./portamento_time";
import { Modulator } from "../../../soundbank/basic_soundbank/modulator";
import { GENERATOR_OVERRIDE_NO_CHANGE_VALUE } from "../engine_components/synth_constants";
import { SpessaSynthWarn } from "../../../utils/loggin";
import type { MIDIChannel } from "../engine_components/midi_channel";
import { generatorTypes } from "../../../soundbank/basic_soundbank/generator_types";
import { midiControllers } from "../../../midi/enums";
import { customControllers } from "../../enums";

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
        (this.synthProps.masterParameters.blackMIDIMode &&
            this.synth.totalVoicesAmount > 200 &&
            velocity < 40) ||
        (this.synthProps.masterParameters.blackMIDIMode && velocity < 10) ||
        this._isMuted
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
    for (const voice of voices) {
        // Apply portamento
        voice.portamentoFromKey = portamentoFromKey;
        voice.portamentoDuration = portamentoDuration;

        // Apply pan override
        voice.overridePan = panOverride;

        // Apply gain override
        voice.gain = voiceGain;

        // Dynamic modulators (if none, this won't iterate over anything)
        for (const m of this.sysExModulators.modulatorList) {
            const mod = m.mod;
            const existingModIndex = voice.modulators.findIndex((voiceMod) =>
                Modulator.isIdentical(voiceMod, mod)
            );

            // Replace or add
            if (existingModIndex === -1) {
                voice.modulators.push(Modulator.copyFrom(mod));
            } else {
                voice.modulators[existingModIndex] = Modulator.copyFrom(mod);
            }
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
        const exclusive = voice.exclusiveClass;
        if (exclusive !== 0) {
            // Kill all voices with the same exclusive class
            for (const v of channelVoices) {
                if (v.exclusiveClass === exclusive) {
                    v.exclusiveRelease(this.synth.currentSynthTime);
                }
            }
        }
        // Compute all modulators
        this.computeModulators(voice);
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
        const sample = voice.sample;
        // Apply them

        const lastSample = sample.sampleData.length - 1;
        sample.cursor = clamp(sample.cursor + cursorStartOffset, 0, lastSample);
        sample.end = clamp(sample.end + endOffset, 0, lastSample);
        sample.loopStart = clamp(
            sample.loopStart + loopStartOffset,
            0,
            lastSample
        );
        sample.loopEnd = clamp(sample.loopEnd + loopEndOffset, 0, lastSample);
        // Swap loops if needed
        if (sample.loopEnd < sample.loopStart) {
            const temp = sample.loopStart;
            sample.loopStart = sample.loopEnd;
            sample.loopEnd = temp;
        }
        if (
            sample.loopEnd - sample.loopStart < 1 && // Disable loop if enabled
            // Don't disable on release mode. Testcase:
            // https://github.com/spessasus/SpessaSynth/issues/174
            (sample.loopingMode === 1 || sample.loopingMode === 3)
        ) {
            sample.loopingMode = 0;
            sample.isLooping = false;
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
    }

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

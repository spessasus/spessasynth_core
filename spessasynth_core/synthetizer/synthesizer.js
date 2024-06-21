import {
    addNewChannel,
} from './worklet_system/worklet_utilities/worklet_processor_channel.js'

import { SoundFont2 } from '../soundfont/soundfont_parser.js'
import { systemExclusive } from './worklet_system/worklet_methods/system_exclusive.js'
import { noteOn } from './worklet_system/worklet_methods/note_on.js'
import { dataEntryCoarse, dataEntryFine } from './worklet_system/worklet_methods/data_entry.js'
import { killNote, noteOff, stopAll, stopAllChannels } from './worklet_system/worklet_methods/note_off.js'
import {
    controllerChange, muteChannel,
    resetAllControllers,
    resetControllers,
    resetParameters, setMainVolume, setMasterPan,
} from './worklet_system/worklet_methods/controller_control.js'
import {
    pitchWheel,
    setChannelTuning,
    setMasterTuning, setModulationDepth,
    transposeAllChannels,
    transposeChannel,
} from './worklet_system/worklet_methods/tuning_control.js'
import {
    programChange,
    reloadSoundFont,
    sampleDump,
    setDrums,
    setPreset,
} from './worklet_system/worklet_methods/program_control.js'
import { disableAndLockVibrato, setVibrato } from './worklet_system/worklet_methods/vibrato_control.js'
import { SpessaSynthInfo } from '../utils/loggin.js'
import { consoleColors } from '../utils/other.js'
import { releaseVoice, renderVoice, voiceKilling } from './worklet_system/worklet_methods/voice_control.js'
import {stbvorbis} from "../utils/stbvorbis_sync.js";


export const VOICE_CAP = 450;

export const DEFAULT_PERCUSSION = 9;
export const DEFAULT_CHANNEL_COUNT = 16;
export const DEFAULT_SYNTH_MODE = "gs";

export const MIN_NOTE_LENGTH = 0.07; // if the note is released faster than that, it forced to last that long

export const SYNTHESIZER_GAIN = 1.0;

const BLOCK_SIZE = 128;

class Synthesizer {
    /**
     * Creates a new synthesizer
     * @param soundFontBuffer {Buffer|ArrayBufferLike} the soundfont file buffer.
     * @param sampleRate {number} the sample rate, in hertz.
     * @param blockSize {number} the block size in samples, represets the interval of updating the sequencer, modulation envelope, etc. Defaults to 128.
     */
    constructor(soundFontBuffer, sampleRate, blockSize = BLOCK_SIZE) {

        this.currentTime = 0;
        this.sampleRate = sampleRate;
        this.blockSize = blockSize;

        this._outputsAmount = DEFAULT_CHANNEL_COUNT;

        /**
         * @type {function}
         */
        this.processTickCallback = undefined;

        this.transposition = 0;

        /**
         * The volume gain
         * @type {number}
         */
        this.mainVolume = SYNTHESIZER_GAIN;

        /**
         * -1 to 1
         * @type {number}
         */
        this.pan = 0.0;
        /**
         * the pan of the left channel
         * @type {number}
         */
        this.panLeft = 0.5 * this.mainVolume;

        this.highPerformanceMode = false;

        /**
         * If using sf3 soundfonts, wait for this promise
         * @type {Promise<unknown>}
         */
        this.sf3supportReady = stbvorbis.isReady;

        /**
         * the pan of the right channel
         * @type {number}
         */
        this.panRight = 0.5 * this.mainVolume;
        /**
         * @type {SoundFont2}
         */
        this.soundfont = new SoundFont2(soundFontBuffer);

        this.defaultPreset = this.soundfont.getPreset(0, 0);
        this.drumPreset = this.soundfont.getPreset(128, 0);

        /**
         * @type {Float32Array[]}
         */
        this.workletDumpedSamplesList = [];
        /**
         * contains all the channels with their voices on the processor size
         * @type {WorkletProcessorChannel[]}
         */
        this.workletProcessorChannels = [];
        for (let i = 0; i < this._outputsAmount; i++) {
            this.addNewChannel(false);
        }

        this.workletProcessorChannels[DEFAULT_PERCUSSION].preset = this.drumPreset;
        this.workletProcessorChannels[DEFAULT_PERCUSSION].drumChannel = true;

        // in seconds, time between two samples (very, very short)
        this.sampleTime = 1 / this.sampleRate;

        /**
         * Controls the system
         * @typedef {"gm"|"gm2"|"gs"|"xg"} SynthSystem
         * @type {SynthSystem}
         */
        this.system = DEFAULT_SYNTH_MODE;

        this.totalVoicesAmount = 0;
        SpessaSynthInfo(`%cSpessaSynth is ready!`,
            consoleColors.info)
    }

    debugMessage()
    {
        SpessaSynthInfo({
            channels: this.workletProcessorChannels,
            voicesAmount: this.totalVoicesAmount,
            outputAmount: this._outputsAmount,
            dumpedSamples: this.workletDumpedSamplesList
        });
    }

    /**
     * @param channel {number}
     * @param controllerNumber {number}
     * @param isLocked {boolean}
     */
    lockController(channel, controllerNumber, isLocked)
    {
        this.workletProcessorChannels[channel].lockedControllers[controllerNumber] = isLocked;
    }

    /**
     * Syntesizes the voice to output buffers.
     * @param outputChannels {Float32Array[]} - the dry audio output data of 2 arrays. The first array is left the second is right.
     * @param reverbOutputChannels {Float32Array[]} - the dry audio output data for the reverb of 2 arrays. The first array is left the second is right.
     * @param chorusOutputChannels {Float32Array[]} - the dry audio output data for the chorus of 2 arrays. The first array is left the second is right.
     */
    render(outputChannels, reverbOutputChannels = undefined, chorusOutputChannels = undefined) {
        // render in blocks until we reach the output
        let samplesToRender = outputChannels[0].length;
        let renderedSamples = 0;
        while(samplesToRender > 0)
        {
            /**
             * @type {Float32Array[]}
             */
            let block;
            let reverbBlock;
            let chorusBlock;
            if(samplesToRender < this.blockSize)
            {
                block = [new Float32Array(samplesToRender), new Float32Array(samplesToRender)];
                reverbBlock = [new Float32Array(samplesToRender), new Float32Array(samplesToRender)];
                chorusBlock = [new Float32Array(samplesToRender), new Float32Array(samplesToRender)];
            }
            else
            {
                block = [new Float32Array(this.blockSize), new Float32Array(this.blockSize)];
                chorusBlock = [new Float32Array(this.blockSize), new Float32Array(this.blockSize)];
                reverbBlock = [new Float32Array(this.blockSize), new Float32Array(this.blockSize)];
            }
            samplesToRender -= this.blockSize;
            // for every channel
            let totalCurrentVoices = 0;
            this.workletProcessorChannels.forEach(channel => {
                if(channel.voices.length < 1 || channel.isMuted)
                {
                    // skip the channels
                    return;
                }
                const tempV = channel.voices;

                // reset voices
                channel.voices = [];

                // for every voice
                tempV.forEach(v => {
                    // render voice
                    this.renderVoice(channel, v, block, reverbBlock, chorusBlock);
                    if(!v.finished)
                    {
                        // if not finished, add it back
                        channel.voices.push(v);
                    }
                });

                totalCurrentVoices += tempV.length;
            });

            // if voice count changed, update voice amount
            if(totalCurrentVoices !== this.totalVoicesAmount)
            {
                this.totalVoicesAmount = totalCurrentVoices;
            }

            // if sequencer connected, process
            if(this.processTickCallback)
            {
                this.processTickCallback();
            }
            // append to blocks
            outputChannels[0].set(block[0], renderedSamples);
            outputChannels[1].set(block[1], renderedSamples);

            if(reverbOutputChannels)
            {
                reverbOutputChannels[0].set(reverbBlock[0], renderedSamples);
                reverbOutputChannels[1].set(reverbBlock[1], renderedSamples);
            }

            if(chorusOutputChannels)
            {
                chorusOutputChannels[1].set(chorusBlock[1], renderedSamples);
                chorusOutputChannels[1].set(chorusBlock[1], renderedSamples);
            }

            renderedSamples += block[0].length;
            this.currentTime += this.sampleTime * block[0].length;
        }
    }
}

// include other methods
// voice related
Synthesizer.prototype.renderVoice = renderVoice;
Synthesizer.prototype.releaseVoice = releaseVoice;
Synthesizer.prototype.voiceKilling = voiceKilling;

// system exlcusive related
Synthesizer.prototype.systemExclusive = systemExclusive;

// note messages related
Synthesizer.prototype.noteOn = noteOn;
Synthesizer.prototype.noteOff = noteOff;
Synthesizer.prototype.killNote = killNote;
Synthesizer.prototype.stopAll = stopAll;
Synthesizer.prototype.stopAllChannels = stopAllChannels;
Synthesizer.prototype.muteChannel = muteChannel;

// vustom vibrato related
Synthesizer.prototype.setVibrato = setVibrato;
Synthesizer.prototype.disableAndLockVibrato = disableAndLockVibrato;

// data entry related
Synthesizer.prototype.dataEntryCoarse = dataEntryCoarse;
Synthesizer.prototype.dataEntryFine = dataEntryFine;

// channel related
Synthesizer.prototype.addNewChannel = addNewChannel;
Synthesizer.prototype.controllerChange = controllerChange;
Synthesizer.prototype.resetAllControllers = resetAllControllers;
Synthesizer.prototype.resetControllers = resetControllers;
Synthesizer.prototype.resetParameters = resetParameters;

// master parameter related
Synthesizer.prototype.setMainVolume = setMainVolume;
Synthesizer.prototype.setMasterPan = setMasterPan;

// tuning related
Synthesizer.prototype.transposeAllChannels = transposeAllChannels;
Synthesizer.prototype.transposeChannel = transposeChannel;
Synthesizer.prototype.setChannelTuning = setChannelTuning;
Synthesizer.prototype.setMasterTuning = setMasterTuning;
Synthesizer.prototype.setModulationDepth = setModulationDepth;
Synthesizer.prototype.pitchWheel = pitchWheel;

// program related
Synthesizer.prototype.programChange = programChange;
Synthesizer.prototype.setPreset = setPreset;
Synthesizer.prototype.setDrums = setDrums;
Synthesizer.prototype.reloadSoundFont = reloadSoundFont;
Synthesizer.prototype.sampleDump = sampleDump;


export { Synthesizer }
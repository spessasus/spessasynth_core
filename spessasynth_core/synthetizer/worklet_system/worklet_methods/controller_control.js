import { consoleColors } from '../../../utils/other.js'
import { midiControllers } from '../../../midi_parser/midi_message.js'
import { DEFAULT_PERCUSSION, DEFAULT_SYNTH_MODE } from '../../synthesizer.js'
import {
    customControllers,
    customResetArray,
    dataEntryStates,
    resetArray,
} from '../worklet_utilities/worklet_processor_channel.js'
import { computeModulators } from '../worklet_utilities/worklet_modulator.js'
import { SpessaSynthInfo } from '../../../utils/loggin.js'
import { SYNTHESIZER_GAIN } from '../../synthesizer.js'

/**
 * Changes a MIDI controller
 * @param channel {number} - The MIDI Channel to use
 * @param controllerNumber {number} - The MIDI controller number
 * @param controllerValue {number} - The new value
 * @this {Synthesizer}
 */
export function controllerChange(channel, controllerNumber, controllerValue)
{
    /**
     * @type {WorkletProcessorChannel}
     */
    const channelObject = this.workletProcessorChannels[channel];
    switch (controllerNumber) {
        case midiControllers.allNotesOff:
            this.stopAll(channel);
            break;

        case midiControllers.allSoundOff:
            this.stopAll(channel, true);
            break;

        case midiControllers.bankSelect:
            let bankNr = controllerValue;
            switch (this.system)
            {
                case "gm":
                    // gm ignores bank select
                    SpessaSynthInfo(`%cIgnoring the Bank Select (${controllerValue}), as the synth is in GM mode.`, consoleColors.info);
                    return;

                case "xg":
                    // for xg, if msb is 127, then it's drums
                    if (bankNr === 127)
                    {
                        channelObject.drumChannel = true;
                    }
                    break;

                case "gm2":
                    if(bankNr === 120)
                    {
                        channelObject.drumChannel = true;
                    }
            }

            if(channelObject.drumChannel)
            {
                // 128 for percussion channel
                bankNr = 128;
            }
            if(bankNr === 128 && !channelObject.drumChannel)
            {
                // if channel is not for percussion, default to bank current
                bankNr = channelObject.midiControllers[midiControllers.bankSelect];
            }

            channelObject.midiControllers[midiControllers.bankSelect] = bankNr;
            break;

        case midiControllers.lsbForControl0BankSelect:
            if(this.system === 'xg')
            {
                if(channelObject.midiControllers[midiControllers.bankSelect] === 0)
                {
                    if(controllerValue !== 127)
                        channelObject.midiControllers[midiControllers.bankSelect] = controllerValue;
                }
            }
            else
            if(this.system === "gm2")
            {
                channelObject.midiControllers[midiControllers.bankSelect] = controllerValue;
            }
            break;

        case midiControllers.RPNLsb:
            channelObject.RPValue = channelObject.RPValue << 7 | controllerValue;
            channelObject.dataEntryState = dataEntryStates.RPFine;
            break;

        case midiControllers.RPNMsb:
            channelObject.RPValue = controllerValue;
            channelObject.dataEntryState = dataEntryStates.RPCoarse;
            break;

        case midiControllers.NRPNMsb:
            channelObject.NRPCoarse = controllerValue;
            channelObject.dataEntryState = dataEntryStates.NRPCoarse;
            break;

        case midiControllers.NRPNLsb:
            channelObject.NRPFine = controllerValue;
            channelObject.dataEntryState = dataEntryStates.NRPFine;
            break;

        case midiControllers.dataEntryMsb:
            this.dataEntryCoarse(channel, controllerValue);
            break;

        case midiControllers.lsbForControl6DataEntry:
            this.dataEntryFine(channel, controllerValue);
            break;

        default:
            if(channelObject.lockedControllers[controllerNumber])
            {
                return;
            }
            // special case: hold pedal
            if(controllerNumber === midiControllers.sustainPedal) {
                if (controllerValue >= 64)
                {
                    channelObject.holdPedal = true;
                }
                else
                {
                    channelObject.holdPedal = false;
                    channelObject.sustainedVoices.forEach(v => {
                        this.releaseVoice(v)
                    });
                    channelObject.sustainedVoices = [];
                }
            }
            channelObject.midiControllers[controllerNumber] = controllerValue << 7;
            channelObject.voices.forEach(v => computeModulators(v, channelObject.midiControllers));
            break;
    }
}

/**
 * Resets all controllers and programs
 * @this {Synthesizer}
 */
export function resetAllControllers()
{
    SpessaSynthInfo("%cResetting all controllers!", consoleColors.info);
    for (let channelNumber = 0; channelNumber < this.workletProcessorChannels.length; channelNumber++)
    {
        this.resetControllers(channelNumber);

        /**
         * @type {WorkletProcessorChannel}
         **/
        const ch = this.workletProcessorChannels[channelNumber];

        // if preset is unlocked, switch to non drums and call event
        if(!ch.lockPreset)
        {
            ch.midiControllers[midiControllers.bankSelect] = 0;
            if (channelNumber % 16 === DEFAULT_PERCUSSION)
            {
                this.setPreset(channelNumber, this.drumPreset);
                ch.drumChannel = true;
            }
            else
            {
                ch.drumChannel = false;
                this.setPreset(channelNumber, this.defaultPreset);
            }
        }
    }
    this.system = DEFAULT_SYNTH_MODE;
}

/**
 * Resets all controllers for channel
 * @param channel {number} - The MIDI Channel to use
 * @this {Synthesizer}
 */
export function resetControllers(channel)
{
    const channelObject = this.workletProcessorChannels[channel];
    /**
     * get excluded (locked) cc numbers as locked ccs are unaffected by reset
     * @type {number[]}
     */
    const excludedCCs = channelObject.lockedControllers.reduce((lockedCCs, cc, ccNum) => {
        if(cc)
        {
            lockedCCs.push(ccNum);
        }
        return lockedCCs;
    }, []);
    // save excluded controllers as reset doesn't affect them
    let excludedCCvalues = excludedCCs.map(ccNum => {
        return {
            ccNum: ccNum,
            ccVal: channelObject.midiControllers[ccNum]
        }
    });

    // reset the array
    channelObject.midiControllers.set(resetArray);
    channelObject.channelVibrato = {rate: 0, depth: 0, delay: 0};
    channelObject.holdPedal = false;

    excludedCCvalues.forEach((cc) => {
        channelObject.midiControllers[cc.ccNum] = cc.ccVal;
    });

    // reset custom controllers
    // special case: transpose does not get affected
    const transpose = channelObject.customControllers[customControllers.channelTranspose];
    channelObject.customControllers.set(customResetArray);
    channelObject.customControllers[customControllers.channelTranspose] = transpose;

    this.resetParameters(channel);

}

/**
 * @param channel {number}
 * @this {Synthesizer}
 */
export function resetParameters(channel)
{
    const channelObject = this.workletProcessorChannels[channel];

    // reset parameters
    /**
     * @type {number}
     */
    channelObject.NRPCoarse = 0;
    /**
     * @type {number}
     */
    channelObject.NRPFine = 0;
    /**
     * @type {number}
     */
    channelObject.RPValue = 0;
    /**
     * @type {string}
     */
    channelObject.dataEntryState = dataEntryStates.Idle;
}

/**
 * Sets the main volume of the synthesizer
 * @param volume {number} - 0-1 the volume
 * @this {Synthesizer}
 */
export function setMainVolume(volume)
{
    this.mainVolume = volume * SYNTHESIZER_GAIN;
    this.setMasterPan(this.pan);
}

/**
 * Sets the master stereo panning of the synthesizer
 * @param pan {number} - -1 to 1 the pan, -1 is left, 0 is the middle, 1 is right
 * @this {Synthesizer}
 */
export function setMasterPan(pan)
{
    this.pan = pan;
    // clamp to 0-1 (0 is left)
    pan = (pan / 2) + 0.5;
    this.panLeft = (1 - pan) * this.mainVolume;
    this.panRight = (pan) * this.mainVolume;
}

/**
 * Mutes/unmutes a channel
 * @param channel {number} - The MIDI channel to use
 * @param isMuted {boolean} - If the channel should be muted or not
 * @this {Synthesizer}
 */
export function muteChannel(channel, isMuted)
{
    if(isMuted)
    {
        this.stopAll(channel, true);
    }
    this.workletProcessorChannels[channel].isMuted = isMuted;
}
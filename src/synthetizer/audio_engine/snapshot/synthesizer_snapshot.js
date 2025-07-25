import { SpessaSynthInfo } from "../../../utils/loggin.js";
import { consoleColors } from "../../../utils/other.js";
import { ChannelSnapshot } from "./channel_snapshot.js";
import { masterParameterType } from "../engine_methods/controller_control/master_parameters.js";

/**
 * Represents a snapshot of the synthesizer's state.
 */
export class SynthesizerSnapshot
{
    /**
     * The individual channel snapshots.
     * @type {ChannelSnapshot[]}
     */
    channelSnapshots;
    
    /**
     * Key modifiers.
     * @type {KeyModifier[][]}
     */
    keyMappings;
    
    /**
     * Main synth volume (set by MIDI), from 0 to 1.
     * @type {number}
     */
    mainVolume;
    
    /**
     * Master stereo panning, from -1 to 1.
     * @type {number}
     */
    pan;
    
    /**
     * The synth's interpolation type.
     * @type {interpolationTypes}
     */
    interpolation;
    
    /**
     * The synth's system. Values can be "gs", "gm", "gm2" or "xg".
     * @type {SynthSystem}
     */
    system;
    
    /**
     * The current synth transposition in semitones. Can be a float.
     * @type {number}
     */
    transposition;
    
    
    /**
     * Creates a snapshot of the synthesizer's state.
     * @param spessaSynthProcessor {SpessaSynthProcessor}
     * @returns {SynthesizerSnapshot}
     */
    static createSynthesizerSnapshot(spessaSynthProcessor)
    {
        const snapshot = new SynthesizerSnapshot();
        // channel snapshots
        snapshot.channelSnapshots =
            spessaSynthProcessor.midiAudioChannels.map((_, i) =>
                ChannelSnapshot.getChannelSnapshot(spessaSynthProcessor, i));
        
        // key mappings
        snapshot.keyMappings = spessaSynthProcessor.keyModifierManager.getMappings();
        // pan and volume
        snapshot.mainVolume = spessaSynthProcessor.masterGain;
        snapshot.pan = spessaSynthProcessor.pan;
        
        // others
        snapshot.system = spessaSynthProcessor.system;
        snapshot.interpolation = spessaSynthProcessor.interpolationType;
        snapshot.transposition = spessaSynthProcessor.transposition;
        
        // effect config is stored on the main thread, leave it empty
        snapshot.effectsConfig = {};
        return snapshot;
        
    }
    
    /**
     * Applies the snapshot to the synthesizer.
     * @param spessaSynthProcessor {SpessaSynthProcessor}
     * @param snapshot {SynthesizerSnapshot}
     */
    static applySnapshot(spessaSynthProcessor, snapshot)
    {
        // restore system
        spessaSynthProcessor.setSystem(snapshot.system);
        
        // restore pan and volume
        spessaSynthProcessor.setMasterParameter(masterParameterType.mainVolume, snapshot.mainVolume);
        spessaSynthProcessor.setMasterParameter(masterParameterType.masterPan, snapshot.pan);
        spessaSynthProcessor.transposeAllChannels(snapshot.transposition);
        spessaSynthProcessor.interpolationType = snapshot.interpolation;
        spessaSynthProcessor.keyModifierManager.setMappings(snapshot.keyMappings);
        
        // add channels if more needed
        while (spessaSynthProcessor.midiAudioChannels.length < snapshot.channelSnapshots.length)
        {
            spessaSynthProcessor.createMidiChannel();
        }
        
        // restore channels
        snapshot.channelSnapshots.forEach((channelSnapshot, index) =>
        {
            ChannelSnapshot.applyChannelSnapshot(spessaSynthProcessor, index, channelSnapshot);
        });
        
        SpessaSynthInfo("%cFinished restoring controllers!", consoleColors.info);
    }
}


import type { SynthSystem } from "../../types";
import { type SpessaSynthProcessor } from "../../processor";
import type { MIDIPatchNamed } from "../../../soundbank/basic_soundbank/midi_patch";

/**
 * Represents a snapshot of a single channel's state in the synthesizer.
 */
export class ChannelSnapshot {
    /**
     * The MIDI patch that the channel is using.
     */
    public patch: MIDIPatchNamed;

    /**
     * Indicates whether the channel's program change is disabled.
     */
    public lockPreset: boolean;

    /**
     * Indicates the MIDI system when the preset was locked
     */
    public lockedSystem: SynthSystem;

    /**
     * The array of all MIDI controllers (in 14-bit values) with the modulator sources at the end.
     */
    public midiControllers: Int16Array;

    /**
     * An array of booleans, indicating if the controller with a current index is locked.
     */
    public lockedControllers: boolean[];

    /**
     * Array of custom (not SF2) control values such as RPN pitch tuning, transpose, modulation depth, etc.
     */
    public customControllers: Float32Array;

    /**
     * Indicates whether the channel vibrato is locked.
     */
    public lockVibrato: boolean;

    /**
     * The channel's vibrato settings.
     * @property depth Vibrato depth, in gain.
     * @property delay Vibrato delay from note on in seconds.
     * @property rate Vibrato rate in Hz.
     */
    public channelVibrato: { depth: number; delay: number; rate: number };

    /**
     * Key shift for the channel.
     */
    public keyShift: number;

    /**
     * The channel's octave tuning in cents.
     */
    public octaveTuning: Int8Array;

    /**
     * Relative drum tuning, in cents.
     */
    public drumPitch: Int16Array;

    /**
     * Volume for every drum key.
     */
    public drumLevel: Int8Array;

    /**
     * Exclusive class for every drum key. 0 is none (use sound bank data)
     */
    public drumAssignGroup: Int8Array;

    /**
     * Pan for every drum key, 1-64-127, 0 is random. This adds to the channel pan!
     */
    public drumPan: Int8Array;

    /**
     * Relative reverb for every drum key, 0-127.
     */
    public drumReverb: Int8Array;

    /**
     * Relative chorus for every drum key, 0-127.
     */
    public drumChorus: Int8Array;

    /**
     * Indicates whether the channel is muted.
     */
    public isMuted: boolean;

    /**
     * Indicates whether the channel is a drum channel.
     */
    public drumChannel: boolean;

    /**
     * The channel number this snapshot represents.
     */
    public channelNumber: number;

    // Creates a new channel snapshot.
    public constructor(
        patch: MIDIPatchNamed,
        lockPreset: boolean,
        lockedSystem: SynthSystem,
        midiControllers: Int16Array,
        lockedControllers: boolean[],
        customControllers: Float32Array,
        lockVibrato: boolean,
        channelVibrato: {
            delay: number;
            depth: number;
            rate: number;
        },
        channelTransposeKeyShift: number,
        channelOctaveTuning: Int8Array,
        drumPitch: Int16Array,
        drumLevel: Int8Array,
        drumAssignGroup: Int8Array,
        drumPan: Int8Array,
        drumReverb: Int8Array,
        drumChorus: Int8Array,
        isMuted: boolean,
        drumChannel: boolean,
        channelNumber: number
    ) {
        this.patch = patch;
        this.lockPreset = lockPreset;
        this.lockedSystem = lockedSystem;
        this.midiControllers = midiControllers;
        this.lockedControllers = lockedControllers;
        this.customControllers = customControllers;
        this.lockVibrato = lockVibrato;
        this.channelVibrato = channelVibrato;
        this.keyShift = channelTransposeKeyShift;
        this.octaveTuning = channelOctaveTuning;
        this.drumPitch = drumPitch;
        this.drumLevel = drumLevel;
        this.drumAssignGroup = drumAssignGroup;
        this.drumPan = drumPan;
        this.drumReverb = drumReverb;
        this.drumChorus = drumChorus;
        this.isMuted = isMuted;
        this.drumChannel = drumChannel;
        this.channelNumber = channelNumber;
    }

    /**
     * Creates a copy of existing snapshot.
     * @param snapshot The snapshot to create a copy from.
     */
    public static copyFrom(snapshot: ChannelSnapshot) {
        return new ChannelSnapshot(
            { ...snapshot.patch },
            snapshot.lockPreset,
            snapshot.lockedSystem,
            snapshot.midiControllers.slice(),
            [...snapshot.lockedControllers],
            snapshot.customControllers.slice(),
            snapshot.lockVibrato,
            { ...snapshot.channelVibrato },
            snapshot.keyShift,
            snapshot.octaveTuning.slice(),
            snapshot.drumPitch.slice(),
            snapshot.drumLevel.slice(),
            snapshot.drumAssignGroup.slice(),
            snapshot.drumPan.slice(),
            snapshot.drumReverb.slice(),
            snapshot.drumChorus.slice(),
            snapshot.isMuted,
            snapshot.drumChannel,
            snapshot.channelNumber
        );
    }

    /**
     * Creates a snapshot of the channel's state.
     * @param spessaSynthProcessor The synthesizer processor containing the channel.
     * @param channelNumber The channel number to take a snapshot of.
     */
    public static create(
        spessaSynthProcessor: SpessaSynthProcessor,
        channelNumber: number
    ) {
        const channelObject = spessaSynthProcessor.midiChannels[channelNumber];

        return new ChannelSnapshot(
            {
                ...channelObject.patch,
                name: channelObject?.preset?.name ?? "undefined"
            },
            channelObject.lockPreset,
            channelObject.lockedSystem,
            channelObject.midiControllers.slice(),
            [...channelObject.lockedControllers],
            channelObject.customControllers.slice(),
            channelObject.lockGSNRPNParams,
            { ...channelObject.channelVibrato },
            channelObject.keyShift,
            channelObject.octaveTuning.slice(),
            channelObject.drumPitch.slice(),
            channelObject.drumLevel.slice(),
            channelObject.drumAssignGroup.slice(),
            channelObject.drumPan.slice(),
            channelObject.drumReverb.slice(),
            channelObject.drumChorus.slice(),
            channelObject.isMuted,
            channelObject.drumChannel,
            channelNumber
        );
    }

    /**
     * Applies the snapshot to the specified channel.
     * @param spessaSynthProcessor The processor containing the channel.
     */
    public apply(spessaSynthProcessor: SpessaSynthProcessor) {
        const channelObject =
            spessaSynthProcessor.midiChannels[this.channelNumber];
        channelObject.muteChannel(this.isMuted);
        channelObject.setDrums(this.drumChannel);

        // Restore controllers
        channelObject.midiControllers.set(this.midiControllers);
        channelObject.lockedControllers = this.lockedControllers;
        channelObject.customControllers.set(this.customControllers);
        channelObject.updateChannelTuning();

        // Restore vibrato and transpose
        channelObject.channelVibrato = this.channelVibrato;
        channelObject.lockGSNRPNParams = this.lockVibrato;
        channelObject.keyShift = this.keyShift;
        channelObject.octaveTuning.set(this.octaveTuning);
        channelObject.drumPitch.set(this.drumPitch);
        channelObject.drumLevel.set(this.drumLevel);
        channelObject.drumAssignGroup.set(this.drumAssignGroup);
        channelObject.drumPan.set(this.drumPan);
        channelObject.drumReverb.set(this.drumReverb);
        channelObject.drumChorus.set(this.drumChorus);

        // Restore preset and lock
        channelObject.setPresetLock(false);
        channelObject.setPatch(this.patch);
        channelObject.setPresetLock(this.lockPreset);
        channelObject.lockedSystem = this.lockedSystem;
    }
}

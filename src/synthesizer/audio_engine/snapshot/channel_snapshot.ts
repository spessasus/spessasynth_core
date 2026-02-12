import type { SynthSystem } from "../../types";
import { type SpessaSynthProcessor } from "../../processor";
import type { MIDIPatchNamed } from "../../../soundbank/basic_soundbank/midi_patch";
import { DrumParameters } from "../engine_components/drum_parameters";

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
     * Parameters for each drum instrument.
     */
    public drumParams: DrumParameters[];

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
        drumParams: DrumParameters[],
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
        this.drumParams = drumParams;
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
            snapshot.drumParams.map((d) => new DrumParameters().copyInto(d)),
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
            channelObject.drumParams.map((d) =>
                new DrumParameters().copyInto(d)
            ),
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
        for (let i = 0; i < 128; i++) {
            this.drumParams[i].copyInto(channelObject.drumParams[i]);
        }

        // Restore preset and lock
        channelObject.setPresetLock(false);
        channelObject.setPatch(this.patch);
        channelObject.setPresetLock(this.lockPreset);
        channelObject.lockedSystem = this.lockedSystem;
    }
}

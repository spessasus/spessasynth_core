import type { SynthSystem } from "../../types";
import { type SpessaSynthProcessor } from "../processor";

/**
 * Represents a snapshot of a single channel's state in the synthesizer.
 */
export class ChannelSnapshot {
    /**
     * The channel's MIDI program number.
     */
    public program: number;

    /**
     * The channel's bank number.
     */
    public bank: number;

    /**
     * If the bank is LSB. For restoring.
     */
    public isBankLSB: boolean;

    /**
     * The name of the patch currently loaded in the channel.
     */
    public patchName: string;

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
    public channelTransposeKeyShift: number;

    /**
     * The channel's octave tuning in cents.
     */
    public channelOctaveTuning: Int8Array;

    /**
     * Indicates whether the channel is muted.
     */
    public isMuted: boolean;

    /**
     * Overrides velocity if greater than 0, otherwise disabled.
     */
    public velocityOverride: number;

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
        program: number,
        bank: number,
        isBankLSB: boolean,
        patchName: string,
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
        isMuted: boolean,
        velocityOverride: number,
        drumChannel: boolean,
        channelNumber: number
    ) {
        this.program = program;
        this.bank = bank;
        this.isBankLSB = isBankLSB;
        this.patchName = patchName;
        this.lockPreset = lockPreset;
        this.lockedSystem = lockedSystem;
        this.midiControllers = midiControllers;
        this.lockedControllers = lockedControllers;
        this.customControllers = customControllers;
        this.lockVibrato = lockVibrato;
        this.channelVibrato = channelVibrato;
        this.channelTransposeKeyShift = channelTransposeKeyShift;
        this.channelOctaveTuning = channelOctaveTuning;
        this.isMuted = isMuted;
        this.velocityOverride = velocityOverride;
        this.drumChannel = drumChannel;
        this.channelNumber = channelNumber;
    }

    /**
     * Creates a snapshot of the channel's state.
     * @param spessaSynthProcessor The synthesizer processor containing the channel.
     * @param channelNumber The channel number to snapshot.
     */
    public static create(
        spessaSynthProcessor: SpessaSynthProcessor,
        channelNumber: number
    ) {
        const channelObject = spessaSynthProcessor.midiChannels[channelNumber];

        return new ChannelSnapshot(
            channelObject.preset?.program || 0,
            channelObject.getBankSelect(),
            channelObject.bank !== channelObject.getBankSelect(),
            channelObject.preset?.name || "undefined",
            channelObject.lockPreset,
            channelObject.lockedSystem,
            channelObject.midiControllers.slice(),
            [...channelObject.lockedControllers],
            channelObject.customControllers.slice(),
            channelObject.lockGSNRPNParams,
            { ...channelObject.channelVibrato },
            channelObject.channelTransposeKeyShift,
            channelObject.channelOctaveTuning.slice(),
            channelObject.isMuted,
            channelObject.velocityOverride,
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

        // restore controllers
        channelObject.midiControllers.set(this.midiControllers);
        channelObject.lockedControllers = this.lockedControllers;
        channelObject.customControllers.set(this.customControllers);
        channelObject.updateChannelTuning();

        // restore vibrato and transpose
        channelObject.channelVibrato = this.channelVibrato;
        channelObject.lockGSNRPNParams = this.lockVibrato;
        channelObject.channelTransposeKeyShift = this.channelTransposeKeyShift;
        channelObject.channelOctaveTuning = this.channelOctaveTuning;
        channelObject.velocityOverride = this.velocityOverride;

        // restore preset and lock
        channelObject.setPresetLock(false);
        channelObject.setBankSelect(this.bank, this.isBankLSB);
        channelObject.programChange(this.program);
        channelObject.setPresetLock(this.lockPreset);
        channelObject.lockedSystem = this.lockedSystem;
    }
}

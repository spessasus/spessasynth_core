import {
    DEFAULT_NRPN,
    DEFAULT_RPN
} from "../../synthesizer/audio_engine/synth_constants";
import { type MIDIController, MIDIControllers } from "../enums";
import { MIDIUtils } from "./midi_utils";

export type ParameterCC =
    | typeof MIDIControllers.registeredParameterMSB
    | typeof MIDIControllers.registeredParameterLSB
    | typeof MIDIControllers.nonRegisteredParameterMSB
    | typeof MIDIControllers.nonRegisteredParameterLSB;

interface ParameterController {
    /**
     * Value
     */
    v: number;
    /**
     * Track index
     */
    track: number;
    /**
     * Event index
     */
    event: number;
}

/**
 * A class for tracking RPN/NRPN messages
 */
export class ParameterTracker {
    public rpnMSB: ParameterController = {
        v: DEFAULT_RPN,
        track: 0,
        event: 0
    };
    public rpnLSB: ParameterController = {
        v: DEFAULT_RPN,
        track: 0,
        event: 0
    };
    public nrpnMSB: ParameterController = {
        v: DEFAULT_NRPN,
        track: 0,
        event: 0
    };
    public nrpnLSB: ParameterController = {
        v: DEFAULT_NRPN,
        track: 0,
        event: 0
    };
    public dataMSB: ParameterController = {
        v: 0,
        track: 0,
        event: 0
    };
    public dataLSB: ParameterController = {
        v: 0,
        track: 0,
        event: 0
    };
    public isRegistered = true;
    private readonly channel;

    public constructor(channel: number) {
        this.channel = channel;
    }

    public get paramMSB() {
        return this.isRegistered ? this.rpnMSB : this.nrpnMSB;
    }

    public get paramLSB() {
        return this.isRegistered ? this.rpnLSB : this.nrpnLSB;
    }

    /**
     * The controller numbers of the currently selected parameter as array: [MSB, LSB].
     */
    public get paramControllers() {
        return this.isRegistered
            ? ([
                  MIDIControllers.registeredParameterMSB,
                  MIDIControllers.registeredParameterLSB
              ] as const)
            : ([
                  MIDIControllers.nonRegisteredParameterMSB,
                  MIDIControllers.nonRegisteredParameterLSB
              ] as const);
    }

    /**
     * Returns the tracked selection controller.
     * @param cc the selection controller number
     */
    public getParameterSelect(cc: ParameterCC) {
        switch (cc) {
            case MIDIControllers.registeredParameterMSB: {
                return this.rpnMSB;
            }
            case MIDIControllers.registeredParameterLSB: {
                return this.rpnLSB;
            }
            case MIDIControllers.nonRegisteredParameterMSB: {
                return this.nrpnMSB;
            }
            case MIDIControllers.nonRegisteredParameterLSB: {
                return this.nrpnLSB;
            }
        }
    }

    /**
     * Keeps the cached event indexes valid when an event is deleted from a
     * track.
     * @param track the track number
     * @param index the index of the event
     */
    public deleteEvent(track: number, index: number) {
        this.shiftEvent(this.rpnMSB, track, index);
        this.shiftEvent(this.rpnLSB, track, index);
        this.shiftEvent(this.nrpnMSB, track, index);
        this.shiftEvent(this.nrpnLSB, track, index);
        this.shiftEvent(this.dataMSB, track, index);
        this.shiftEvent(this.dataLSB, track, index);
    }

    public reset() {
        this.isRegistered = true;
        this.rpnLSB.v = DEFAULT_RPN;
        this.rpnMSB.v = DEFAULT_RPN;
        this.nrpnMSB.v = DEFAULT_NRPN;
        this.nrpnLSB.v = DEFAULT_NRPN;
        this.resetData();
    }

    /**
     * Reset All Controllers (RP-15) sets the selection to null.
     * Mirrors the synth, which sends a controller change for every changed selection controller,
     * So the last changed one decides if the parameter is registered.
     */
    public resetAllControllers() {
        for (const [param, isRegistered, defaultValue] of [
            [this.rpnMSB, true, DEFAULT_RPN],
            [this.rpnLSB, true, DEFAULT_RPN],
            [this.nrpnMSB, false, DEFAULT_NRPN],
            [this.nrpnLSB, false, DEFAULT_NRPN]
        ] as const) {
            if (param.v === defaultValue) continue;
            param.v = defaultValue;
            this.isRegistered = isRegistered;
            this.resetData();
        }
    }

    public controllerChange(
        cc: MIDIController,
        v: number,
        track: number,
        event: number
    ) {
        switch (cc) {
            case MIDIControllers.registeredParameterMSB: {
                this.resetData();
                this.isRegistered = true;
                this.rpnMSB = {
                    v,
                    track,
                    event
                };
                break;
            }

            case MIDIControllers.registeredParameterLSB: {
                this.resetData();
                this.isRegistered = true;
                this.rpnLSB = {
                    v,
                    track,
                    event
                };
                break;
            }

            case MIDIControllers.nonRegisteredParameterMSB: {
                this.resetData();
                this.isRegistered = false;
                this.nrpnMSB = {
                    v,
                    track,
                    event
                };
                break;
            }

            case MIDIControllers.nonRegisteredParameterLSB: {
                this.resetData();
                this.isRegistered = false;
                this.nrpnLSB = {
                    v,
                    track,
                    event
                };
                break;
            }

            case MIDIControllers.dataEntryMSB: {
                this.dataMSB = {
                    v,
                    track,
                    event
                };
                return this.analyze();
            }

            case MIDIControllers.dataEntryLSB: {
                this.dataLSB = {
                    v,
                    track,
                    event
                };
                return this.analyze();
            }
        }
        return undefined;
    }

    /**
     *
     * @param param the parameter affected
     * @param track the track number
     * @param index the index of the event
     */
    private shiftEvent(
        param: ParameterController,
        track: number,
        index: number
    ) {
        // If an event before the tracked one was deleted, the index goes down
        if (param.track === track && param.event > index) {
            param.event--;
        }
    }

    private resetData() {
        // We call this in parameter set because
        // This is technically not a MIDI behavior,
        // But some MIDI files only send MSB data:
        // https://github.com/spessasus/spessasynth_core/pull/78#discussion_r3233413622
        this.dataLSB.v = 0;
        this.dataMSB.v = 0;
    }

    private analyze() {
        const v = (this.dataMSB.v << 7) | this.dataLSB.v;
        return this.isRegistered
            ? MIDIUtils.analyzeRPN(
                  this.channel,
                  (this.rpnMSB.v << 7) | this.rpnLSB.v,
                  v
              )
            : MIDIUtils.analyzeNRPN(
                  this.channel,
                  (this.nrpnMSB.v << 7) | this.nrpnLSB.v,
                  v
              );
    }
}

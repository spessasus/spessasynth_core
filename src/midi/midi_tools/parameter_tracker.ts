import { type MIDIController, MIDIControllers } from "../enums";
import { MIDIUtils } from "./midi_utils";
import {
    DEFAULT_NRPN,
    DEFAULT_RPN
} from "../../synthesizer/audio_engine/synth_constants";

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
    private readonly channel;
    private isRegistered = true;

    public constructor(channel: number) {
        this.channel = channel;
    }

    public get paramMSB() {
        return this.isRegistered ? this.rpnMSB : this.nrpnMSB;
    }

    public get paramLSB() {
        return this.isRegistered ? this.rpnLSB : this.nrpnLSB;
    }

    public reset() {
        this.isRegistered = true;
        this.rpnLSB.v = DEFAULT_RPN;
        this.rpnMSB.v = DEFAULT_RPN;
        this.nrpnMSB.v = DEFAULT_NRPN;
        this.nrpnLSB.v = DEFAULT_NRPN;
        this.resetData();
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

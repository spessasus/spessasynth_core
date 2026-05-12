import { type MIDIController, MIDIControllers } from "../enums";
import { MIDIUtils } from "./midi_utils";

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
        v: 0x7f,
        track: 0,
        event: 0
    };
    public rpnLSB: ParameterController = {
        v: 0x7f,
        track: 0,
        event: 0
    };
    public nrpnMSB: ParameterController = {
        v: 0x7f,
        track: 0,
        event: 0
    };
    public nrpnLSB: ParameterController = {
        v: 0x7f,
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
        this.rpnLSB.v = 0x7f;
        this.rpnMSB.v = 0x7f;
        this.nrpnMSB.v = 0x7f;
        this.nrpnLSB.v = 0x7f;
        this.dataLSB.v = 0;
        this.dataMSB.v = 0;
    }

    public controllerChange(
        cc: MIDIController,
        v: number,
        track: number,
        event: number
    ) {
        switch (cc) {
            case MIDIControllers.registeredParameterMSB: {
                this.isRegistered = true;
                this.rpnMSB = {
                    v,
                    track,
                    event
                };
                break;
            }

            case MIDIControllers.registeredParameterLSB: {
                this.isRegistered = true;
                this.rpnLSB = {
                    v,
                    track,
                    event
                };
                break;
            }

            case MIDIControllers.nonRegisteredParameterMSB: {
                this.isRegistered = false;
                this.nrpnMSB = {
                    v,
                    track,
                    event
                };
                break;
            }

            case MIDIControllers.nonRegisteredParameterLSB: {
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

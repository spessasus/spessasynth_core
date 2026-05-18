import {
    MIDIBuilder,
    type MIDIController,
    MIDIControllers,
    MIDIUtils
} from "../src";
import fs from "node:fs/promises";
import path from "node:path";

class EFXTest {
    private readonly builder;

    public constructor(
        builder: MIDITestMaker,
        channel: number,
        msb: number,
        lsb: number
    ) {
        this.builder = builder;

        // Type
        this.builder.gs(0x40, 0x03, 0x00, [msb, lsb]);
        // EFX to channel
        this.builder.gs(
            0x40,
            0x40 | MIDIUtils.channelToSyx(channel),
            0x22,
            [1]
        );
        // No reverb
        this.builder.gs(0x40, 0x03, 0x17, [0]);
    }

    public testEqAndLevel() {
        // Low gain
        this.sweepParam(0x13, 52, 76);
        // Hi gain
        this.sweepParam(0x14, 52, 76);
        // Level
        this.sweepParam(0x16, 0, 127, 480, 16);
    }

    public sweepParam(
        param: number,
        from: number,
        to: number,
        tickStep = 480,
        dataStep = 1
    ) {
        this.builder.sweepGS(0x40, 0x03, param, from, to, tickStep, dataStep);
    }
    public setParam(param: number, value: number) {
        this.builder.gs(0x40, 0x03, param, [value]);
    }
}

export class MIDITestMaker extends MIDIBuilder {
    public ticks = 480;
    private readonly name;
    private readonly channel;

    public constructor(name: string, channel = 0) {
        super({
            name
        });
        this.channel = channel;
        this.name = name.replaceAll(" ", "_").toLowerCase();
        this.tracks[0].addEvents(0, MIDIUtils.gsReset(0));
    }

    public testEFX(typeMSB: number, typeLSB: number) {
        return new EFXTest(this, this.channel, typeMSB, typeLSB);
    }

    // Can't be named controllerChange because then base calls it and this executes!!!
    public cc(controller: MIDIController, value: number) {
        super.controllerChange(this.ticks, 0, this.channel, controller, value);
    }

    public sweepGS(
        a1: number,
        a2: number,
        a3: number,
        from: number,
        to: number,
        tickStep = 480,
        dataStep = 1
    ) {
        let data = from;
        while (data <= to) {
            this.gs(a1, a2, a3, [Math.min(data, to)]);
            this.ticks += tickStep;
            data += dataStep;
        }
        this.gs(a1, a2, a3, [Math.min(data, to)]);
    }

    public sweepCC(
        cc: MIDIController,
        from: number,
        to: number,
        tickStep = 480,
        dataStep = 1
    ) {
        let data = from;
        while (data <= to) {
            this.cc(cc, Math.min(data, to));
            this.ticks += tickStep;
            data += dataStep;
        }
        this.cc(cc, Math.min(data, to));
    }

    public programChange(msb: number, lsb: number, program: number) {
        this.cc(MIDIControllers.bankSelectLSB, lsb);
        this.cc(MIDIControllers.bankSelect, msb);
        super.programChange(this.ticks, 0, this.channel, program);
    }

    public noteOff(midiNote: number, velocity = 64) {
        super.noteOff(this.ticks, 0, this.channel, midiNote, velocity);
    }

    public noteOn(midiNote: number, velocity: number) {
        super.noteOn(this.ticks, 0, this.channel, midiNote, velocity);
    }

    public gs(a1: number, a2: number, a3: number, data: number[]) {
        this.systemExclusive(this.ticks, 0, MIDIUtils.gsData(a1, a2, a3, data));
    }

    public rpn(rpn: number, val: number) {
        this.registeredParameter(this.ticks, 0, this.channel, rpn, val);
    }

    public make(dirname = "") {
        this.flush();

        const outPath = `files/${dirname}`;
        const resolve = path.resolve(import.meta.dirname, outPath);

        void fs
            .mkdir(resolve, { recursive: true })
            .then(() =>
                fs
                    .writeFile(
                        path.resolve(resolve, `${this.name}.mid`),
                        new Uint8Array(this.writeMIDI())
                    )
                    .then(() =>
                        console.info(
                            `File written to ${resolve}/${this.name}.mid`
                        )
                    )
            );
    }
}

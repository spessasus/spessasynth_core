import {
    type ChannelMIDIParameter,
    MIDIBuilder,
    type MIDIController,
    MIDIControllers,
    MIDIMessageTypes,
    type MIDISystem,
    MIDIUtils
} from "../../src";
import fs from "node:fs/promises";
import path from "node:path";
import { arrayToHexString } from "../../src/utils/other";
import { fillWithDefaults } from "../../src/utils/fill_with_defaults";

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
        return this;
    }

    public sweepParam(
        param: number,
        from: number,
        to: number,
        tickStep = 480,
        dataStep = 1
    ) {
        this.builder.sweepGS(0x40, 0x03, param, from, to, tickStep, dataStep);
        return this;
    }

    public setParam(param: number, value: number) {
        this.builder.gs(0x40, 0x03, param, [value]);
        return this;
    }
}

interface MIDITestOptions {
    startTicks: number;
    channel: number;
    system: MIDISystem;
}

const DEFAULT_MIDI_TEST_OPTIONS: MIDITestOptions = {
    startTicks: 480,
    channel: 0,
    system: "gs"
};

export class MIDITestMaker extends MIDIBuilder {
    private ticks;
    private readonly track;
    private readonly testName;
    private readonly channel;
    private system;

    public constructor(
        name: string,
        options: Partial<MIDITestOptions> = DEFAULT_MIDI_TEST_OPTIONS
    ) {
        super({
            name
        });
        const o = fillWithDefaults(options, DEFAULT_MIDI_TEST_OPTIONS);
        this.channel = o.channel;
        this.ticks = o.startTicks;
        this.testName = name;
        this.fileName = name.replaceAll(" ", "_").toLowerCase();
        this.system = o.system;
        this.track = this.tracks[0];
        this.track.addEvents(0, MIDIUtils.reset(0, o.system));
    }

    public reset(system: MIDISystem) {
        this.track.addEvents(
            this.track.events.length,
            MIDIUtils.reset(this.ticks, system)
        );
        this.system = system;
        return this.wait(480);
    }

    public setChannelMIDIParameter<P extends keyof ChannelMIDIParameter>(
        param: P,
        value: ChannelMIDIParameter[P]
    ) {
        this.track.addEvents(
            this.track.events.length,
            ...MIDIUtils.setChannelMIDIParameter(
                this.ticks,
                this.channel,
                this.system,
                param,
                value
            )
        );
        return this;
    }

    public efx(typeMSB: number, typeLSB: number) {
        return new EFXTest(this, this.channel, typeMSB, typeLSB);
    }

    public cc(controller: MIDIController, value: number) {
        super.controllerChange(this.ticks, 0, this.channel, controller, value);
        return this;
    }

    public text(text: string) {
        const enc = new TextEncoder();
        super.addEvent(this.ticks, 0, MIDIMessageTypes.text, enc.encode(text));
        return this;
    }

    public wait(ticks: number) {
        this.ticks += ticks;
        return this;
    }

    public note(midiNote: number, velocity: number, duration = 480) {
        return this.noteOn(midiNote, velocity).wait(duration).noteOff(midiNote);
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
            this.text(
                `GS sweep ${arrayToHexString([a1, a2, a3])} = ${Math.min(data, to).toString(16)}`
            );
            this.gs(a1, a2, a3, [Math.min(data, to)]);
            this.ticks += tickStep;
            data += dataStep;
        }
        this.gs(a1, a2, a3, [Math.min(data, to)]);

        return this;
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
            const v = Math.min(data, to);
            this.text(`CC Sweep ${cc} = ${v}`);
            this.cc(cc, v);
            this.ticks += tickStep;
            data += dataStep;
        }
        this.cc(cc, Math.min(data, to));
        return this;
    }

    public programChange(msb: number, lsb: number, program: number) {
        this.text(`Program change ${msb}:${lsb} - ${program}`);
        this.cc(MIDIControllers.bankSelectLSB, lsb);
        this.cc(MIDIControllers.bankSelect, msb);
        super.programChange(this.ticks, 0, this.channel, program);
        return this;
    }

    public noteOff(midiNote: number) {
        super.noteOff(this.ticks, 0, this.channel, midiNote);
        return this;
    }

    public noteOn(midiNote: number, velocity: number) {
        super.noteOn(this.ticks, 0, this.channel, midiNote, velocity);
        return this;
    }

    public gs(a1: number, a2: number, a3: number, data: number[]) {
        this.systemExclusive(this.ticks, 0, MIDIUtils.gs(a1, a2, a3, data));
        return this;
    }

    public xg(a1: number, a2: number, a3: number, data: number[]) {
        this.systemExclusive(this.ticks, 0, MIDIUtils.xg(a1, a2, a3, data));
        return this;
    }

    public rpn(rpn: number, val: number) {
        this.registeredParameter(this.ticks, 0, this.channel, rpn, val);
        return this;
    }

    public nrpn(nrpn: number, val: number) {
        this.nonRegisteredParameter(this.ticks, 0, this.channel, nrpn, val);
        return this;
    }

    public async make() {
        // Wait a little
        this.wait(960).cc(1, 1);
        this.flush();

        const outPath = `generated`;
        const resolve = path.resolve(import.meta.dirname, outPath);
        const outFile = path.resolve(resolve, `${this.fileName}.mid`);

        await fs.mkdir(resolve, { recursive: true });
        await fs.writeFile(outFile, new Uint8Array(this.writeMIDI()));

        console.info(`${this.testName} written as ${this.fileName}.mid`);
    }
}

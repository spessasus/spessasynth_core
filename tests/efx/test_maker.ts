import {
    IndexedByteArray,
    MIDIBuilder,
    midiControllers,
    midiMessageTypes
} from "../../src";
import fs from "fs/promises";

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
        this.builder.sendAddress(0x40, 0x03, 0x00, [msb, lsb]);
        // EFX to channel
        this.builder.sendAddress(
            0x40,
            0x40 |
                [1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 11, 12, 13, 14, 15][channel],
            0x22,
            [1]
        );
        // No reverb
        this.builder.sendAddress(0x40, 0x03, 0x17, [0]);
    }

    public sweepParam(
        param: number,
        from: number,
        to: number,
        tickStep = 480,
        dataStep = 1
    ) {
        let data = from;
        while (data <= to) {
            this.setParam(param, Math.min(data, to));
            this.builder.ticks += tickStep;
            data += dataStep;
        }
        this.setParam(param, Math.min(data, to));
    }
    public setParam(param: number, value: number) {
        this.builder.sendAddress(0x40, 0x03, param, [value]);
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
        this.addEvent(
            0,
            0,
            midiMessageTypes.systemExclusive,
            new IndexedByteArray([
                0x41, // Roland
                0x10, // Device ID (defaults to 16 on roland)
                0x42, // GS
                0x12, // Command ID (DT1) (whatever that means...)
                0x40, // System parameter - Address
                0x00, // Global parameter -  Address
                0x7f, // GS Change - Address
                0x00, // Turn on - Data
                0x41, // Checksum
                0xf7 // End of exclusive
            ])
        );
    }

    public testEFX(typeMSB: number, typeLSB: number) {
        return new EFXTest(this, this.channel, typeMSB, typeLSB);
    }

    public addControllerChange(
        controllerNumber: number,
        controllerValue: number
    ) {
        super.addControllerChange(
            this.ticks,
            0,
            this.channel,
            controllerNumber,
            controllerValue
        );
    }

    public addProgramChange(msb: number, lsb: number, program: number) {
        this.addControllerChange(midiControllers.bankSelectLSB, lsb);
        this.addControllerChange(midiControllers.bankSelect, msb);
        super.addProgramChange(this.ticks, 0, this.channel, program);
    }

    public addNoteOff(midiNote: number, velocity: number = 64) {
        super.addNoteOff(this.ticks, 0, this.channel, midiNote, velocity);
    }

    public addNoteOn(midiNote: number, velocity: number) {
        super.addNoteOn(this.ticks, 0, this.channel, midiNote, velocity);
    }

    public sendAddress(a1: number, a2: number, a3: number, data: number[]) {
        // Calculate checksum
        // https://cdn.roland.com/assets/media/pdf/F-20_MIDI_Imple_e01_W.pdf section 4
        const sum = a1 + a2 + a3 + data.reduce((sum, cur) => sum + cur, 0);
        const checksum = (128 - (sum % 128)) & 0x7f;
        this.addEvent(
            this.ticks,
            0,
            midiMessageTypes.systemExclusive,
            new IndexedByteArray([
                0x41, // Roland
                0x10, // Device ID (defaults to 16 on roland)
                0x42, // GS
                0x12, // Command ID (DT1) (whatever that means...)
                a1,
                a2,
                a3,
                ...data,
                checksum,
                0xf7 // End of exclusive
            ])
        );
    }

    public make() {
        this.flush();
        fs.mkdir("../files/efx", { recursive: true }).then(() =>
            fs
                .writeFile(
                    `../files/efx/${this.name}.mid`,
                    new Uint8Array(this.writeMIDI())
                )
                .then(() => console.info(`File written to ${this.name}.mid`))
        );
    }
}

import { IndexedByteArray, MIDIBuilder, midiMessageTypes } from "../../src";
import fs from "fs/promises";

export class EFXTestMaker extends MIDIBuilder {
    public ticks = 480;
    private readonly name;

    public constructor(name: string) {
        super({
            name
        });
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

    public addControllerChange(
        track: number,
        channel: number,
        controllerNumber: number,
        controllerValue: number
    ) {
        super.addControllerChange(
            this.ticks,
            track,
            channel,
            controllerNumber,
            controllerValue
        );
    }

    public addProgramChange(
        track: number,
        channel: number,
        programNumber: number
    ) {
        super.addProgramChange(this.ticks, track, channel, programNumber);
    }

    public addNoteOff(
        track: number,
        channel: number,
        midiNote: number,
        velocity: number = 64
    ) {
        super.addNoteOff(this.ticks, track, channel, midiNote, velocity);
    }

    public addNoteOn(
        track: number,
        channel: number,
        midiNote: number,
        velocity: number
    ) {
        super.addNoteOn(this.ticks, track, channel, midiNote, velocity);
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

    public setEFX(msb: number, lsb: number) {
        this.sendAddress(0x40, 0x03, 0x00, [msb, lsb]);
        // EFX to channel 1
        this.sendAddress(0x40, 0x41, 0x22, [1]);
        // No reverb
        this.sendAddress(0x40, 0x03, 0x17, [0]);
    }

    public sweepEFXParam(
        param: number,
        from: number,
        to: number,
        tickStep = 480,
        dataStep = 1
    ) {
        let data = from;
        while (data <= to) {
            this.setEFXParam(param, Math.min(data, to));
            this.ticks += tickStep;
            data += dataStep;
        }
    }

    public setEFXParam(param: number, value: number) {
        this.sendAddress(0x40, 0x03, param, [value]);
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

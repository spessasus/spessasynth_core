import fs from "node:fs/promises";
import { BasicMIDI, SpessaLog } from "../../../src";
import type {
    ChannelModification,
    ClearableParameter
} from "../../../src/midi/midi_tools/modify_midi";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <mid input path> <mid output path>");
    process.exit();
}

const mid = await fs.readFile(args[0]);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);

SpessaLog.setLogLevel(true, true, true);

const channels = new Map<number, ClearableParameter<ChannelModification>>([
    [
        0,
        {
            // Test these as they are relative
            keyShift: -1,
            fineTune: 20,
            midiParams: {
                velocitySenseOffset: 100,
                velocitySenseDepth: 0,
                pitchWheel: 6000,
                pitchWheelRange: 14,
                fineTune: -67
            }
        }
    ]
]);

for (let i = 1; i < 16; i++) {
    // -100 to 99 cents
    const tune = Math.floor(Math.random() * 200) - 100;
    console.info(`Testing relative tuning ONLY on ${i}. Cents:`, tune);
    channels.set(i, {
        keyShift: 0,
        fineTune: tune
    });
}

midi.modify({
    midiParams: {
        keyShift: -2,
        fineTune: 30,
        gain: 0.7,
        pan: -0.7
    },
    channels
});

await fs.writeFile(args[1], new Uint8Array(midi.writeMIDI()));

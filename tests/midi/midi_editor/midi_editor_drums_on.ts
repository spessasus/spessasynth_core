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
            patch: {
                program: 8,
                bankMSB: 0,
                bankLSB: 3,
                isGMGSDrum: true
            }
        }
    ]
]);

midi.modify({
    channels
});

await fs.writeFile(args[1], new Uint8Array(midi.writeMIDI()));

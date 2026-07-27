import fs from "node:fs/promises";
import { BasicMIDI, SpessaLog } from "../../../src";

const args = process.argv.slice(2);
if (args.length !== 2) {
    console.info("Usage: tsx index.ts <mid input path> <mid output path>");
    process.exit();
}

const mid = await fs.readFile(args[0]);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);

SpessaLog.setLogLevel(true, true, true);

function getBind(
    midiNote: number,
    program: number,
    level: number | undefined = undefined
) {
    return [
        midiNote,
        {
            program,
            level,
            sourceDrumSet: 3,
            sourceNoteNumber: midiNote
        }
    ] as const;
}

midi.modify({
    // Make drum channel use the custom drum set
    channels: new Map([
        [
            9,
            {
                patch: {
                    program: 64,
                    bankLSB: 0,
                    bankMSB: 0,
                    isGMGSDrum: true
                }
            }
        ]
    ]),

    userDrumSetParams: new Map([
        [
            0,
            new Map([
                // Kick
                getBind(36, 30),
                // Snare
                getBind(40, 17),
                // Cymbal
                getBind(42, 24),
                getBind(46, 30, 70),
                // Crash
                getBind(49, 16),
                // Toms
                getBind(41, 8),
                getBind(43, 8),
                getBind(45, 8),
                getBind(47, 8),
                getBind(48, 8),
                getBind(50, 8)
            ])
        ]
    ])
});

await fs.writeFile(args[1], new Uint8Array(midi.writeMIDI()));

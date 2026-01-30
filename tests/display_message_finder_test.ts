import { BasicMIDI, midiMessageTypes } from "../src";
import * as fs from "fs/promises";
import * as path from "node:path";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <midi dir path>");
    process.exit();
}
const midPath = args[0];

async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await walk(fullPath);
            continue;
        }

        if (
            path.extname(fullPath) !== ".mid" &&
            path.extname(fullPath) !== ".midi"
        )
            continue;
        try {
            checkMid(
                BasicMIDI.fromArrayBuffer((await fs.readFile(fullPath)).buffer),
                fullPath
            );
        } catch (e) {
            console.error(`Invalid MIDI file ${path.basename(fullPath)}`);
        }
    }
}

function checkMid(mid: BasicMIDI, path: string) {
    for (const track of mid.tracks) {
        for (const event of track.events) {
            if (event.statusByte !== midiMessageTypes.systemExclusive) continue;

            const syx = event.data;

            if (
                syx[0] === 0x41 &&
                syx[3] === 0x12 &&
                syx[2] === 0x45 &&
                syx[4] === 0x10
            ) {
                console.info(`${path} contains a GS Display message!`);
                return;
            } else if (
                syx[0] === 0x43 &&
                syx[2] === 0x4c &&
                (syx[3] === 0x07 || syx[3] === 0x06)
            ) {
                console.info(`${path} contains a XG Display message!`);
                return;
            }
        }
    }
}

await walk(midPath);

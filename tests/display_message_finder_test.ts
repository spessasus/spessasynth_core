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

const outPath = path.resolve(import.meta.dirname, "files/matched_files");
await fs.rm(outPath, { recursive: true, force: true });
await fs.mkdir(outPath, { recursive: true });

let checkedFiles = 0;

async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await walk(fullPath);
            continue;
        }

        const ext = path.extname(fullPath);
        if (ext !== ".mid" && ext !== ".midi") continue;
        try {
            if (
                checkMid(
                    BasicMIDI.fromArrayBuffer(
                        (await fs.readFile(fullPath)).buffer
                    ),
                    fullPath
                )
            ) {
                void fs.copyFile(fullPath, path.join(outPath, entry.name));
            }
            checkedFiles++;
        } catch (e) {
            // Pass
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
    return false;
}

await walk(midPath);
console.info(
    `Checked ${checkedFiles} files. Saved matching files to ${outPath}`
);

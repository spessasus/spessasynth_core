import * as fs from "fs/promises";
import * as path from "path";
import { BasicMIDI } from "../../src";

const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <folder>");
    process.exit();
}
const dir: string = args[0];

const files = await fs.readdir(dir);

await fs.mkdir(path.resolve(dir, "rmid"));
for (const file of files) {
    if (!file.endsWith(".mid")) {
        continue;
    }
    const fileBin = await fs.readFile(path.resolve(dir, file));
    let sfBin: Buffer;
    try {
        sfBin = await fs.readFile(
            path.resolve(dir, file.replace(".mid", ".sf2"))
        );
    } catch {
        console.warn(`No matching file for ${file}! Skipping!`);
        continue;
    }

    const midi = BasicMIDI.fromArrayBuffer(fileBin.buffer as ArrayBuffer);
    const outFile = path.resolve(dir, "rmid", file.replace(".mid", ".rmi"));
    await fs.writeFile(
        outFile,
        new Uint8Array(
            midi.writeRMIDI(sfBin.buffer as ArrayBuffer, {
                bankOffset: 1,
                correctBankOffset: false
            })
        )
    );
    console.info(`Wrote ${outFile}`);
}

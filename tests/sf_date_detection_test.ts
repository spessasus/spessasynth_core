import * as fs from "fs/promises";
import * as path from "node:path";
import { SoundBankLoader, SpessaSynthLogging } from "../src";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <directory path>");
    process.exit();
}
const midPath = args[0];

SpessaSynthLogging(false, false, false);

const entries = await fs.readdir(midPath, { recursive: true });

const dec = new TextDecoder();
for (const entry of entries) {
    const fullPath = path.join(midPath, entry);
    const stat = await fs.stat(fullPath);

    const ext = path.extname(fullPath).toLowerCase();
    if (
        stat.isFile() &&
        stat.size < 2147483648 &&
        (ext === ".sf2" ||
            ext === ".sf3" ||
            ext === ".dls" ||
            ext === ".sfogg" ||
            ext === ".dlp")
    ) {
        const bin = await fs.readFile(fullPath);
        if (dec.decode(bin.buffer.slice(0, 4)) !== "RIFF") continue;
        SoundBankLoader.fromArrayBuffer(bin.buffer);
    }
}

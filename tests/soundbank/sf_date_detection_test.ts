import * as fs from "node:fs/promises";
import path from "node:path";
import { SoundBankLoader, SpessaLog } from "../../src";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
    console.info("Usage: tsx index.ts <directory path>");
    process.exit();
}
const midPath = args[0];

SpessaLog.setLogLevel(false, false, false);

const entries = await fs.readdir(midPath, { recursive: true });

const dec = new TextDecoder();
for (const entry of entries) {
    const fullPath = path.join(midPath, entry);
    const stat = await fs.stat(fullPath);

    const ext = path.extname(fullPath).toLowerCase();
    if (
        !stat.isFile() ||
        stat.size >= 2_147_483_648 ||
        ![".sf2", ".sf3", ".dls", ".sfogg", ".dlp"].includes(ext)
    ) {
        continue;
    }
    const bin = await fs.readFile(fullPath);
    if (dec.decode(bin.subarray(0, 4)) !== "RIFF") continue;
    SoundBankLoader.fromArrayBuffer(bin.buffer);
}

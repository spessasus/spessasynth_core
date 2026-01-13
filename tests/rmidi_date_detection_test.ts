import * as fs from "fs/promises";
import * as path from "node:path";
import { BasicMIDI, SpessaSynthLogging } from "../src";

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

    if (stat.isFile()) {
        const bin = await fs.readFile(fullPath);
        if (dec.decode(bin.buffer.slice(8, 12)) !== "RMID") continue;
        const rmid = BasicMIDI.fromArrayBuffer(bin.buffer);
        if (!rmid.rmidiInfo.creationDate) continue;
        console.info(
            dec.decode(rmid.rmidiInfo.creationDate),
            " decoded as date -> ",
            rmid.getRMIDInfo("creationDate")!.toISOString()
        );
    }
}

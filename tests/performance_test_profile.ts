import { Session } from "node:inspector/promises";
import { writeFile } from "node:fs/promises";
import { runPerformanceTest } from "./performance_test";
import * as path from "node:path";

// Profiled performance test created by @Danielku15 on GitHub
// Modified slightly by spessasus

const soundFontFile = path.join(import.meta.dirname, "./files/profile.sf2");
const midiFile = path.join(import.meta.dirname, "./files/profile.mid");
const outfile = path.join(import.meta.dirname, "./files/profile.cpuprofile");

const session = new Session();
session.connect();

await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", {
    interval: 50 // microseconds
});
await session.post("Profiler.start");

await runPerformanceTest(soundFontFile, midiFile, 1);

const { profile } = await session.post("Profiler.stop");

console.log(`CPU profile written to: ${outfile}`);

await writeFile(outfile, JSON.stringify(profile));

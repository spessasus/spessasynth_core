import { audioToWav, wavToAudio } from "../../src";

const l = new Float32Array(1000).map((_, i) => Math.sin(i / 10) * 0.5);
const r = new Float32Array(1000).map((_, i) => Math.cos(i / 10) * 0.25);
const wav = audioToWav([l, r], 44_100, {
    normalizeAudio: false,
    loop: { start: 100 / 44_100, end: 900 / 44_100 }
});
const out = wavToAudio(wav);
console.info(
    out.sampleRate,
    out.audioData.length,
    out.audioData[0].length,
    out.loop
);
let err = 0;
for (let i = 0; i < 1000; i++)
    err = Math.max(
        err,
        Math.abs(out.audioData[0][i] - l[i]),
        Math.abs(out.audioData[1][i] - r[i])
    );
console.info("max error", err);
if (err > 1e-4 || out.loop?.start !== 100 || out.loop?.end !== 900)
    process.exit(1);

// A smpl chunk loop, its end point is inclusive in the file
const plain = new Uint8Array(
    audioToWav([l], 44_100, { normalizeAudio: false })
);
const smpl = new Uint8Array(8 + 60);
const smplView = new DataView(smpl.buffer);
smpl.set([0x73, 0x6d, 0x70, 0x6c]);
smplView.setUint32(4, 60, true);
smplView.setUint32(8 + 28, 1, true);
smplView.setUint32(8 + 36 + 8, 100, true);
smplView.setUint32(8 + 36 + 12, 899, true);
const withSmpl = new Uint8Array(plain.length + smpl.length);
withSmpl.set(plain);
withSmpl.set(smpl, plain.length);
new DataView(withSmpl.buffer).setUint32(4, withSmpl.length - 8, true);
const smplOut = wavToAudio(withSmpl.buffer);
console.info("smpl loop", smplOut.loop);
if (smplOut.loop?.start !== 100 || smplOut.loop?.end !== 900) process.exit(1);

# spessasynth_core
A SoundFont2 synthesizer library, made for use with node.js. A fork of [SpessaSynth](https://github.com/spessasus/SpessaSynth).

`npm install --save spessasynth_core`

> [!TIP]
> Looking for a browser version? Try [SpessaSynth](https://github.com/spessasus/SpessaSynth).

Example: render midi file to wav
```js
const fs = require('fs');
// spessasynth_core is an es6 module
import("spessasynth_core").then(core => {
    // usage: node test.js <sf path> <midi path> <output path>
    const [,, soundfontName, midiName, outputName] = process.argv;
    // read the input files
    const soundfont = fs.readFileSync(soundfontName);
    const mid = new core.MIDI(fs.readFileSync(midiName))

    // initialize synth and sequencer
    const synth = new core.SpessaSynthCore(soundfont, 44100);
    const seq = new core.Sequencer(synth);
    // load new song and disable the loop
    seq.loadNewSongList([mid]);
    seq.loop = false;

    // calculate length and allocate buffers
    const lengthSamples = mid.duration * 44100;
    const outLeft = new Float32Array(lengthSamples);
    const outRight = new Float32Array(lengthSamples);

    // wait for sf3 support to load and render
    synth.sf3supportReady.then(() => {
        // note: this discards reverb and chorus outputs!
        synth.render([outLeft, outRight]);
        // write output data
        const wav = core.rawDataToWav(44100, outLeft, outRight);
        fs.writeFileSync(outputName, Buffer.from(wav));
    });
});
```
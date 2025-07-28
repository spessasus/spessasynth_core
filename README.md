<!--suppress HtmlDeprecatedAttribute, HtmlRequiredAltAttribute, HtmlExtraClosingTag -->
<p align='center'>
<img src='https://raw.githubusercontent.com/spessasus/SpessaSynth/refs/heads/master/src/website/spessasynth_logo_rounded.png' width='300' alt='SpessaSynth logo'>
</p>

**A powerful SF2/DLS/MIDI TypeScript/JavaScript library. It works with any modern JS environment that supports
WebAssembly.**

It allows you to:

- Play MIDI files using SF2/SF3/DLS files!
- Read and write MIDI files!
- Write SF2/SF3 files!
- Convert DLS to SF2! (and back!)
- [and more!](#current-features)

### Install

```shell
npm install --save spessasynth_core
```

> **Tip:**
> Looking for an easy-to-use WebAudioAPI browser wrapper?
> Try [spessasynth_lib](https://github.com/spessasus/spessasynth_lib)!

### [Project site (consider giving it a star!)](https://github.com/spessasus/spessasynth_core)

### Made with spessasynth_core

- [SpessaSynth Online SF2/DLS MIDI Player](https://spessasus.github.io/SpessaSynth)
- [SpessaFont Online SoundFont/DLS Editor](https://spessasus.github.io/SpessaFont)

### [Documentation](https://spessasus.github.io/spessasynth_core)

### [Documentation (in progress!)](https://github.com/spessasus/spessasynth_core/wiki/Home)

**v3.28 TypeScript Update is here! The NPM package now contains type declarations for easier developing!**

**SpessaSynth Project index**

- [spessasynth_core](https://github.com/spessasus/spessasynth_core) (you are here) - SF2/DLS/MIDI library
- [spessasynth_lib](https://github.com/spessasus/spessasynth_lib) - spessasynth_core wrapper optimized for browsers and
  WebAudioAPI
- [SpessaSynth](https://github.com/spessasus/SpessaSynth) - online/local MIDI player/editor application
- [SpessaFont](https://github.com/spessasus/SpessaFont) - online SF2/DLS editor

## Current Features

### Easy Integration

- **Modular design:** *Easy integration into other projects (load what you need)*
- **Flexible:** *It's not just a MIDI player!*
- **Easy to Use:** *Basic setup is
  just [two lines of code!](https://spessasus.github.io/spessasynth_core/getting-started#minimal-setup)*
- **No dependencies:** *Batteries included!*
- **TypeScript definitions:** *Autocompletion in IDEs!*

### Powerful MIDI Synthesizer

- Suitable for both **real-time** and **offline** synthesis
- **Excellent SoundFont support:**
    - **Full Generator Support**
    - **Full Modulator Support:** *First (to my knowledge) JavaScript SoundFont synth with that feature!*
    - **GeneralUserGS Compatible:**
      *[See more here!](https://github.com/mrbumpy409/GeneralUser-GS/blob/main/documentation/README.md)*
    - **SoundFont3 Support:** Play compressed SoundFonts!
    - **Experimental SF2Pack Support:** Play soundfonts compressed with BASSMIDI! (*Note: only works with vorbis
      compression*)
    - **Can load very large SoundFonts:** up to 4GB! *Note: Only Firefox handles this well; Chromium has a hard-coded
      memory limit*
- **Great DLS Support:**
    - **DLS Level 1 Support**
    - **DLS Level 2 Support**
    - **Mobile DLS Support**
    - **Correct articulator support:** *Converts articulators to both modulators and generators!*
    - **Tested and working with gm.dls!**
    - **Correct volume:** *Properly translated to SoundFont volume!*
    - **A-Law encoding support**
    - **Both unsigned 8-bit and signed 16-bit sample support (24-bit theoretically supported as well!)**
    - **Detects special articulator combinations:** *Such as vibratoLfoToPitch*
- **Soundfont manager:** Stack multiple soundfonts!
- **Unlimited channel count:** Your CPU is the limit!
- **Excellent MIDI Standards Support:**
    - **MIDI Controller Support:** Default supported
      controllers [here](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#default-supported-controllers)
    - **Portamento Support:** *Smooth note gliding!*
    - **Sound Controllers:** *Real-time filter and envelope control!*
    - **MIDI Tuning Standard Support:**
      *[more info here](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#midi-tuning-standard)*
    - [Full **RPN** and limited **NRPN**
      support](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#supported-registered-parameters)
    - **SoundFont2 NRPN Support**
    - [**AWE32**
      NRPN Compatibility Layer](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#awe32-nrpn-compatibility-layer)
    - Supports some [**Roland GS** and **Yamaha XG**
      system exclusives](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#supported-system-exclusives)

### Powerful and Fast MIDI Sequencer

- **Supports MIDI formats 0, 1, and 2:** *note: format 2 support is experimental as it's very, very rare.*
- **[Multi-Port MIDI](https://spessasus.github.io/spessasynth_core/extra/about-multi-port) support:** *More than 16
  channels!*
- **Smart preloading:** Only preloads the samples used in the MIDI file for smooth playback *(down to key and
  velocity!)*
- **Lyrics support:** *Add karaoke to your program!*
- **Raw lyrics available:** Decode in any encoding! *(Kanji? No problem!)*
- **Loop points support:** *Ensures seamless loops!*

### Read and Write SoundFont and MIDI Files with Ease

#### Read and write MIDI files

- **Smart name detection:** *Handles incorrectly formatted and non-standard track names!*
- **Raw name available:** Decode in any encoding! *(Kanji? No problem!)*
- **Port detection during load time:** *Manage ports and channels easily!*
- **Used channels on track:** *Quickly determine which channels are used!*
- **Key range detection:** *Detect the key range of the MIDI!*
- **Easy MIDI editing:**
  Use [helper functions](https://spessasus.github.io/spessasynth_core/writing-files/midi#modifymidi) to modify the
  song to your needs!
- **Loop detection:** *Automatically detects loops in MIDIs (e.g., from **Touhou Project**)*
- **First note detection:** *Skip unnecessary silence at the start by jumping to the first note!*
- **Lyrics support:** *Both regular MIDI and .kar files!*
- **[Write MIDI files from scratch](https://spessasus.github.io/spessasynth_core/midi/creating-midi-files)**
- **Easy saving:** *Save with
  just [one function!](https://spessasus.github.io/spessasynth_core/writing-files/midi#writemidi)*

#### Read and write [RMID files with embedded sound banks](https://github.com/spessasus/sf2-rmidi-specification#readme)

- **[Level 4](https://github.com/spessasus/sf2-rmidi-specification#level-4) compliance:** Reads and writes *everything!*
- **Compression and trimming support:** *Reduce a MIDI file with a 1GB sound bank to **as small as 5MB**!*
- **DLS Version support:** *The original legacy format with bank offset detection!*
- **Automatic bank shifting and validation:** Every sound bank *just works!*
- **Metadata support:** Add title, artist, album name and cover and more! And of course, read them too! *(In any
  encoding!)*
- **Compatible with [Falcosoft Midi Player 6!](https://falcosoft.hu/softwares.html#midiplayer)**
- **Easy saving:**
  *[As simple as saving a MIDI file!](https://spessasus.github.io/spessasynth_core/writing-files/midi#writermidi)*

#### Read and write SoundFont2 files

- **Easy info access:** *Just
  an [object of strings!](https://spessasus.github.io/spessasynth_core/sound-bank#soundfontinfo)*
- **Smart trimming:** Trim the sound bank to only include samples used in the MIDI *(down to key and velocity!)*
- **SF3 conversion:** *Compress SoundFont2 files to SoundFont3 with variable quality!*
- **Easy saving:** *Also just [one function!](https://spessasus.github.io/spessasynth_core/sound-bank#write)*

#### Read and write SoundFont3 files

- Same features as SoundFont2 but with now with **Ogg Vorbis compression!**
- **Variable compression quality:** *You choose between file size and quality!*
- **Compression preserving:** *Avoid decompressing and recompressing uncompressed samples for minimal quality loss!*
- **Custom compression function:** *Want a different format than Vorbis? No problem!*

#### Read and write DLS Level One or Two files

- Read DLS (DownLoadable Sounds) files like SF2 files!
- **Native support:** *Saving it as sf2 is
  still [just one function!](https://spessasus.github.io/spessasynth_core/sound-bank#write)*
- *That's right, saving as DLS is
  also [just one function!](https://spessasus.github.io/spessasynth_core/sound-bank#writedls)*
- Converts articulators to both **modulators** and **generators**!
- Works with both unsigned 8-bit samples and signed 16-bit samples!
- **A-Law encoding support:** *Sure, why not?*
- **Covers special generator cases:** *such as modLfoToPitch*!
- **Correct volume:** *looking at you, Viena and gm.sf2!*
- Support built right into the synthesizer!
- **Convert SF2 to DLS:** [limited support](https://spessasus.github.io/spessasynth_core/extra/dls-conversion-problem)

### Export MIDI as WAV

- Save the MIDI file as WAV audio!
- **Metadata support:** *Embed metadata such as title, artist, album and more!*
- **Cue points:** *Write MIDI loop points as cue points!*
- **Loop multiple times:** *Render two (or more) loops into the file for seamless transitions!*
- *That's right, saving as WAV is
  also [just one function!](https://spessasus.github.io/spessasynth_core/writing-files/wav#audiobuffertowav)*

### Limitations

- Synth's performance may be questionable sometimes
- [SF2 to DLS Conversion limits](https://spessasus.github.io/spessasynth_core/extra/dls-conversion-problem)

#### TODO

- Improve the performance of the engine
- Potentially port the system to Emscripten

### Special Thanks

- [FluidSynth](https://github.com/FluidSynth/fluidsynth) - for the source code that helped implement functionality and
  fixes
- [Polyphone](https://www.polyphone-soundfonts.com/) - for the soundfont testing and editing tool
- [Meltysynth](https://github.com/sinshu/meltysynth) - for the initial low-pass filter implementation
- [RecordingBlogs](https://www.recordingblogs.com/) - for detailed explanations on MIDI messages
- [stbvorbis.js](https://github.com/hajimehoshi/stbvorbis.js) - for the Vorbis decoder
- [fflate](https://github.com/101arrowz/fflate) - for the MIT DEFLATE implementation
- [tsup](https://github.com/egoist/tsup) - for the TypeScript bundler
- [foo_midi](https://github.com/stuerp/foo_midi) - for useful resources on XMF file format
- [Falcosoft](https://falcosoft.hu) - for help with the RMIDI format
- [Christian Collins](https://schristiancollins.com) - for various bug reports regarding the synthesizer
- **And You!** - for checking out this project. I hope you like it :)

**If you like this project, consider giving it a star. It really helps out!**

### Short example: MIDI to wav converter

```ts
import * as fs from "node:fs";
import {
    audioToWav,
    BasicMIDI,
    SpessaSynthProcessor,
    SpessaSynthSequencer,
    SoundBankLoader
} from "spessasynth_core";

// process arguments
const args = process.argv.slice(2);
if (args.length !== 3) {
    console.info(
        "Usage: tsx index.ts <soundbank path> <midi path> <wav output path>"
    );
    process.exit();
}
const sf = fs.readFileSync(args[0]);
const mid = fs.readFileSync(args[1]);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);
const sampleRate = 44100;
const sampleCount = Math.ceil(44100 * (midi.duration + 2));
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEventSystem: false,
    effectsEnabled: false
});
synth.soundBankManager.reloadManager(
    SoundBankLoader.fromArrayBuffer(sf.buffer)
);
await synth.processorInitialized;
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.loop = false;
const outLeft = new Float32Array(sampleCount);
const outRight = new Float32Array(sampleCount);
const start = performance.now();
let filledSamples = 0;
// note: buffer size is recommended to be very small, as this is the interval between modulator updates and LFO updates
const BUFFER_SIZE = 128;
let i = 0;
const durationRounded = Math.floor(seq.midiData.duration * 100) / 100;
const outputArray = [outLeft, outRight];
while (filledSamples < sampleCount) {
    // process sequencer
    seq.processTick();
    // render
    const bufferSize = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
    synth.renderAudio(outputArray, [], [], filledSamples, bufferSize);
    filledSamples += bufferSize;
    i++;
    // log progress
    if (i % 100 === 0) {
        console.info(
            "Rendered",
            Math.floor(seq.currentTime * 100) / 100,
            "/",
            durationRounded
        );
    }
}
const rendered = Math.floor(performance.now() - start);
console.info(
    "Rendered in",
    rendered,
    `ms (${Math.floor(((midi.duration * 1000) / rendered) * 100) / 100}x)`
);
const wave = audioToWav([outLeft, outRight], sampleRate);
fs.writeFile(args[2], new Uint8Array(wave), () => {
    console.log(`File written to ${args[2]}`);
});
```

### Building

To build the NPM package, do:

```bash
npm install
npm run build
```

The files will be placed in the `dist` folder.

## License

Copyright © 2025 Spessasus
Licensed under the Apache-2.0 License.

#### Legal

This project is in no way endorsed or otherwise affiliated with the MIDI Manufacturers Association,
Creative Technology Ltd. or E-mu Systems, Inc., or any other organization mentioned.
SoundFont® is a registered trademark of Creative Technology Ltd.
All other trademarks are the property of their respective owners.

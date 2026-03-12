<!--suppress HtmlDeprecatedAttribute, HtmlRequiredAltAttribute, HtmlExtraClosingTag -->
<p align='center'>
<img src='https://raw.githubusercontent.com/spessasus/SpessaSynth/refs/heads/master/src/website/spessasynth_logo_rounded.png' width='300' alt='SpessaSynth logo'>
</p>

_A powerful SF2/DLS/MIDI TypeScript/JavaScript library. It works with any modern JS environment that supports
WebAssembly._

It allows you to:

- Play MIDI files using SF2/SF3/DLS files!
- Read and write MIDI files!
- Write SF2/SF3 files!
- Convert DLS to SF2! (and back!)
- [and more!](#current-features)

### v4.2.0 The Effects Update is here!

Featuring Reverb, Chorus, Delay, Insertion effects and more!

> **Tip:**
>
> Looking for an easy-to-use WebAudioAPI browser wrapper?
> Try [spessasynth_lib](https://github.com/spessasus/spessasynth_lib)!

### [Project site (consider giving it a star!)](https://github.com/spessasus/spessasynth_core)

### Made with spessasynth_core

- [SpessaSynth Online SF2/DLS MIDI Player](https://spessasus.github.io/SpessaSynth)
- [SpessaFont Online SoundFont/DLS Editor](https://spessasus.github.io/SpessaFont)

### [Documentation](https://spessasus.github.io/spessasynth_core)

**SpessaSynth Project index**

- [spessasynth_core](https://github.com/spessasus/spessasynth_core) (you are here) - SF2/DLS/MIDI library
- [spessasynth_lib](https://github.com/spessasus/spessasynth_lib) - spessasynth_core wrapper optimized for browsers and
  WebAudioAPI
- [SpessaSynth](https://github.com/spessasus/SpessaSynth) - online/local MIDI player/editor application
- [SpessaFont](https://github.com/spessasus/SpessaFont) - online SF2/DLS editor

## Current Features

### Easy Integration

- **Modular design:** _Easy integration into other projects (load what you need)_
- **Flexible:** _It's not just a MIDI player!_
- **Easy to Use:** _Basic setup is
  just [two lines of code!](https://spessasus.github.io/spessasynth_core/getting-started#minimal-setup)_
- **No dependencies:** _Batteries included!_
- **TypeScript definitions:** _Autocompletion in IDEs!_

### Powerful MIDI Synthesizer

- Suitable for both **real-time** and **offline** synthesis
- **Excellent SoundFont support:**
    - **Full Generator Support**
    - **Full Modulator Support:** _First (to my knowledge) JavaScript SoundFont synth with that feature!_
    - **GeneralUserGS Compatible:**
      _[See more here!](https://github.com/mrbumpy409/GeneralUser-GS/blob/main/documentation/README.md)_
    - **SoundFont3 Support:** Play compressed SoundFonts!
    - **Experimental SF2Pack Support:** Play soundfonts compressed with BASSMIDI! (_Note: only works with vorbis
      compression_)
    - **Can load very large SoundFonts:** up to 4GB! _Note: Only Firefox handles this well; Chromium has a hard-coded
      memory limit_
- **Great DLS Support:**
    - **DLS Level 1 Support**
    - **DLS Level 2 Support**
    - **Mobile DLS Support**
    - **Correct articulator support:** _Converts articulators to both modulators and generators!_
    - **Tested and working with gm.dls!**
    - **Correct volume:** _Properly translated to SoundFont volume!_
    - **A-Law encoding support**
    - **Both unsigned 8-bit and signed 16-bit sample support (24-bit theoretically supported as well!)**
    - **Detects special articulator combinations:** _Such as vibratoLfoToPitch_
- **Soundfont manager:** Stack multiple soundfonts!
- **Unlimited channel count:** Your CPU is the limit!
- **Built-in, configurable effects:**
    - **Reverb:** _Multiple characters including delay and panning delay!_
    - **Chorus:** _Modulated delay lines with multiple presets!_
    - **Delay:** _Three delay lines for all of your delay needs!_
    - **Insertion Effects:** _The ultimate effects, they can give your sounds a completely different character! (limited support)_
    - **Replaceable:** _Effects not to your taste? You can bring your own!_
- **Excellent MIDI Standards Support:**
    - **MIDI Controller Support:** Default supported
      controllers [here](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#default-supported-controllers)
    - **Portamento Support:** _Smooth note gliding!_
    - **Sound Controllers:** _Real-time filter and envelope control!_
    - **MIDI Tuning Standard Support:**
      _[more info here](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#midi-tuning-standard)_
    - [Full **RPN** and limited **NRPN**
      support](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#supported-registered-parameters)
    - **SoundFont2 NRPN Support**
    - [**AWE32**
      NRPN Compatibility Layer](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#awe32-nrpn-compatibility-layer)
    - [**Roland GS** and **Yamaha XG**
      support!](https://spessasus.github.io/spessasynth_core/extra/midi-implementation#supported-system-exclusives)
    - Built-in effects are GS-Compatible!

### Powerful and Fast MIDI Sequencer

- **Supports MIDI formats 0, 1, and 2:** _note: format 2 support is experimental as it's very, very rare._
- **[Multi-Port MIDI](https://spessasus.github.io/spessasynth_core/extra/about-multi-port) support:** _More than 16
  channels!_
- **Smart preloading:** Only preloads the samples used in the MIDI file for smooth playback _(down to key and
  velocity!)_
- **Lyrics support:** _Add karaoke to your program!_
- **Raw lyrics available:** Decode in any encoding! _(Kanji? No problem!)_
- **Loop points support:** _Ensures seamless loops!_

### Read and Write SoundFont and MIDI Files with Ease

#### Read and write MIDI files

- **Smart name detection:** _Handles incorrectly formatted and non-standard track names!_
- **Raw name available:** Decode in any encoding! _(Kanji? No problem!)_
- **Port detection during load time:** _Manage ports and channels easily!_
- **Used channels on track:** _Quickly determine which channels are used!_
- **Key range detection:** _Detect the key range of the MIDI!_
- **Easy MIDI editing:**
  Use [helper functions](https://spessasus.github.io/spessasynth_core/writing-files/midi#modifymidi) to modify the
  song to your needs!
- **Loop detection:** _Automatically detects loops in MIDIs (e.g., from **Touhou Project**)_
- **First note detection:** _Skip unnecessary silence at the start by jumping to the first note!_
- **Lyrics support:** _Both regular MIDI and .kar files!_
- **[Write MIDI files from scratch](https://spessasus.github.io/spessasynth_core/midi/creating-midi-files)**
- **Easy saving:** _Save with
  just [one function!](https://spessasus.github.io/spessasynth_core/writing-files/midi#writemidi)_

#### Read and write [RMID files with embedded sound banks](https://github.com/spessasus/sf2-rmidi-specification#readme)

- **[Level 4](https://github.com/spessasus/sf2-rmidi-specification#level-4) compliance:** Reads and writes _everything!_
- **Compression and trimming support:** _Reduce a MIDI file with a 1GB sound bank to **as small as 5MB**!_
- **DLS Version support:** _The original legacy format with bank offset detection!_
- **Automatic bank shifting and validation:** Every sound bank _just works!_
- **Metadata support:** Add title, artist, album name and cover and more! And of course, read them too! _(In any
  encoding!)_
- **Compatible with [Falcosoft Midi Player 6!](https://falcosoft.hu/softwares.html#midiplayer)**
- **Easy saving:**
  _[As simple as saving a MIDI file!](https://spessasus.github.io/spessasynth_core/writing-files/midi#writermidi)_

#### Read and write SoundFont2 files

- **Easy info access:** _Just
  an [object of strings!](https://spessasus.github.io/spessasynth_core/sound-bank#soundbankinfo)_
- **Smart trimming:** Trim the sound bank to only include samples used in the MIDI _(down to key and velocity!)_
- **SF3 conversion:** _Compress SoundFont2 files to SoundFont3 with variable quality!_
- **Easy saving:** _Also just [one function!](https://spessasus.github.io/spessasynth_core/sound-bank#write)_

#### Read and write SoundFont3 files

- Same features as SoundFont2 but with now with **Ogg Vorbis compression!**
- **Variable compression quality:** _You choose between file size and quality!_
- **Compression preserving:** _Avoid decompressing and recompressing uncompressed samples for minimal quality loss!_
- **Custom compression function:** _Want a different format than Vorbis? No problem!_

#### Read and write DLS Level One or Two files

- Read DLS (DownLoadable Sounds) files like SF2 files!
- **Native support:** _Saving it as sf2 is
  still [just one function!](https://spessasus.github.io/spessasynth_core/sound-bank#write)_
- _That's right, saving as DLS is
  also [just one function!](https://spessasus.github.io/spessasynth_core/sound-bank#writedls)_
- Converts articulators to both **modulators** and **generators**!
- Works with both unsigned 8-bit samples and signed 16-bit samples!
- **A-Law encoding support:** _Sure, why not?_
- **Covers special generator cases:** _such as modLfoToPitch_!
- **Correct volume:** _looking at you, Viena and gm.sf2!_
- Support built right into the synthesizer!
- **Convert SF2 to DLS:** [limited support](https://spessasus.github.io/spessasynth_core/extra/dls-conversion-problem)

### Export MIDI as WAV

- Save the MIDI file as WAV audio!
- **Metadata support:** _Embed metadata such as title, artist, album and more!_
- **Cue points:** _Write MIDI loop points as cue points!_
- **Loop multiple times:** _Render two (or more) loops into the file for seamless transitions!_
- _That's right, saving as WAV is
  also [just one function!](https://spessasus.github.io/spessasynth_core/writing-files/wav#audiobuffertowav)_

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
import * as fs from "fs/promises";
import {
    audioToWav,
    BasicMIDI,
    SoundBankLoader,
    SpessaSynthProcessor,
    SpessaSynthSequencer
} from "spessasynth_core";

// Process arguments
const args = process.argv.slice(2);
if (args.length !== 3) {
    console.info(
        "Usage: tsx index.ts <soundbank path> <midi path> <wav output path>"
    );
    process.exit();
}
const sf = await fs.readFile(args[0]);
const mid = await fs.readFile(args[1]);
const midi = BasicMIDI.fromArrayBuffer(mid.buffer);
const sampleRate = 44100;
const sampleCount = Math.ceil(44100 * (midi.duration + 2));
const synth = new SpessaSynthProcessor(sampleRate, {
    enableEventSystem: false,
    enableEffects: false
});
synth.soundBankManager.addSoundBank(
    SoundBankLoader.fromArrayBuffer(sf.buffer),
    "main"
);
await synth.processorInitialized;
const seq = new SpessaSynthSequencer(synth);
seq.loadNewSongList([midi]);
seq.play();

const outLeft = new Float32Array(sampleCount);
const outRight = new Float32Array(sampleCount);
const start = performance.now();
let filledSamples = 0;
// Note: buffer size is recommended to be very small, as this is the interval between modulator updates and LFO updates
const BUFFER_SIZE = 128;
let i = 0;
const durationRounded = Math.floor(seq.midiData!.duration * 100) / 100;
const outputArray = [outLeft, outRight];
while (filledSamples < sampleCount) {
    // Process sequencer
    seq.processTick();
    // Render
    const bufferSize = Math.min(BUFFER_SIZE, sampleCount - filledSamples);
    synth.renderAudio(outputArray, [], [], filledSamples, bufferSize);
    filledSamples += bufferSize;
    i++;
    // Log progress
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
await fs.writeFile(args[2], new Uint8Array(wave));
console.info(`File written to ${args[2]}`);
```

### Building

To build the NPM package, do:

```bash
npm install
npm run build
```

The files will be placed in the `dist` folder.

## License

Copyright © 2026 Spessasus
Licensed under the Apache-2.0 License.

#### Legal

This project is in no way endorsed or otherwise affiliated with the MIDI Manufacturers Association,
Creative Technology Ltd. or E-mu Systems, Inc., or any other organization mentioned.
SoundFont® is a registered trademark of Creative Technology Ltd.
All other trademarks are the property of their respective owners.

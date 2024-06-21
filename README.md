# spessasynth_core
A SoundFont2 synthesizer library, made for use with node.js. 
A fork of [SpessaSynth](https://github.com/spessasus/SpessaSynth).

`npm install --save spessasynth_core`

> [!TIP]
> Looking for a browser version? Try [SpessaSynth](https://github.com/spessasus/SpessaSynth).

## Features:
- SoundFont2 support (both modulators and generators)
- SoundFont3 support (vorbis compressed sf2)
- GS, XG, GM2, GM1 system exclusive support
- NRPN, RPN support
- Integrated sequencer
- Additional custom modulators
- Multi-port MIDIs support (more than 16 channels)
- No SoundFont size limit
- No dependencies

### Example: render midi file to wav
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
    const synth = new core.Synthesizer(soundfont, 44100);
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

## API reference
### Contents
 - [Importing the library](#importing-the-library)
 - [Synthesizer](#synthesizer)
 - [Sequencer](#sequencer)
 - [MIDI](#midi)
 - [SoundFont2](#soundfont2)

### Importing the library
spessasynth_core is an es6 package.
```js
// es6
import {Synthesizer} from "spessasynth_core"
// commonjs
import("spessasynth_core").then(core => {
    // use core.Synthesizer
})
```
## Synthesizer
The main synth module.
### Initialization
```js
const synth = new Synthesizer(soundFontBuffer, sampleRate, blockSize)
```
- soundFontBuffer - a `Buffer` or `ArrayBufferLike`, represents the soundfont file.
- sampleRate - number, the output sample rate in hertz.
- blockSize - optional, a number. Sets the interval of the synth updating parameters like the sequencer tick processing and modulation envelope.
Default value is 128, and it's recommended to leave it as the default.

### sf3supportReady
A promise that gets resolved when the vorbis decoder is ready. You must await it if you use sf3 soundfonts.
```js
await synth.sf3supportReady;
```

### render
Synthesizes audio the output buffers
```js
synth.render(outputChannels, reverbOutputChannels, chorusOutputChannels);
```
- outputChannels - two `Float32Arrays` that get filled with the audio data. Left is the left channel and right is the right channel. Can be any length. (except zero)
- reverbOutputChannels - two `Float32Arrays` that get filled with the unprocessed audio data for reverb processing. Left is the left channel and right is the right channel. Can be undefined.
- reverbOutputChannels - two `Float32Arrays` that get filled with the unprocessed audio data for chorus processing. Left is the left channel and right is the right channel. Can be undefined.
> [!IMPORTANT]
> All arrays must be the same length.

### noteOn

Plays the given note.

```js
synth.noteOn(channel, midiNote, velocity, enableDebugging);
```

- channel - the MIDI channel to use. Usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the note to play. Ranges from 0 to 127.
- velocity - controls how loud the note is. 127 is normal loudness and 1 is the quietest. Note that velocity of 0 has the same effect as using `noteOff`. Ranges from 0 to 127.
- enableDebugging - boolean, used only for debugging. When `true`, the console will print out tables of the soundfont generator data used to play the note.

### noteOff

Stops the given note.

```js
synth.noteOff(channel, midiNote);
```

- channel - the MIDI channel to use. Usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the note to play. Ranges from 0 to 127.
> [!TIP]
> To stop a note instantly, use `synth.killNote` (takes the same arguments)

### stopAllChannels

Stops all notes. Equivalent of MIDI "panic".

```js
synth.stopAllChannels(force);
```
- force - `boolean`, if true, ignores the release time and stops everything instantly. Defaults to false.
> [!TIP]
> To stop all notes on a specific channel, use `synth.stopAll(channel, force)`. channel is the channel number.

### programChange

Changes the preset for the given channel.

```js
synth.programChange(channel, programNumber);
```

- channel - the MIDI channel to change. Usually ranges from 0 to 15, but it depends on the channel count.
- programNumber - the MIDI program number to use. Ranges from 0 to 127. To use other banks, go to [controllerChange](#controllerchange).
> [!TIP]
> To lock the preset (prevent MIDI file from changing it) use `synth.workletProcessorChannels[channel].lockPreset = true;`

### pitchWheel

Changes the channel's pitch, including the currently playing notes.

```js
synth.pitchWheel(channel, MSB, LSB);
```

- channel - the MIDI channel to use. Usually ranges from 0 to 15, but it depends on the channel count.
- MSB and LSB. 7-bit numbers that form a 14-bit pitch bend value.
> [!TIP]
> [I highly recommend this article for more info.](https://www.recordingblogs.com/wiki/midi-pitch-wheel-message)

### systemExclusive

Handles a MIDI System Exclusive message.

```js
synth.systemExclusive(messageData);
```

- message data - Uint8Array, the message byte data **Excluding the 0xF0 byte!**
> [!TIP]
> Refer to [this table](https://github.com/spessasus/SpessaSynth/wiki/Synthetizer-Class#supported-system-exclusives) for the list of supported System Exclusives.

### setMainVolume
Sets the main volume of the synthesizer.
```js
synth.setMainVolume(volume);
```
- volume - the volume, ranges from 0 to 1.

### setMasterPan
Sets the master panning of the synthesizer.
```js
synth.setMasterPan(pan);
```
- pan - ranges from -1 to 1, -1 is left, 0 is middle, 1 is right.

### lockController

Causes the given midi channel to ignore controller messages for the given controller number.

```js
synth.lockController(channel, controllerNumber, isLocked);
```

- channel - the channel to lock. Usually ranges from 0 to 15, but it depends on the channel count.
- controllerNumber - the MIDI CC to lock. Ranges from 0 to 127.
- isLocked - boolean, if true then locked, if false then unlocked.

### muteChannel

Mutes or unmutes a given channel

```js
synth.muteChannel(channel, isMuted);
```

- channel - the channel to mute/unmute. Usually ranges from 0 to 15, but it depends on the channel count.
- isMuted - if the channel should be muted. boolean.

### transpose

Transposes the synth up or down in semitones. Floating point values can be used for more precise tuning.

```js
synth.transpose(semitones);
```

- semitones - the amount of semitones to transpose the synth by. Can be positive or negative or zero. Zero resets the pitch.

### controllerChange

Sets a given MIDI controller to a given value.

```js
synth.controllerChange(channel, controllerNumber, controllerValue);
```

- channel - the MIDI channel to use. Usually ranges from 0 to 15, but it depends on the channel count.
- controllerName - the MIDI CC number. Refer to [this table](https://github.com/spessasus/SpessaSynth/wiki/Synthetizer-Class#default-supported-controllers) for the list of controllers supported by default.
- controllerValue - the value to set the given controller to. Ranges from 0 to 127.
> [!NOTE]
> Note that theoreticallly all controllers are supported as it depends on the SoundFont's modulators.

### resetAllControllers
Resets all controllers and programs to their default values. Also resets the system.
```js
synth.resetAllControllers();
```

### addNewChannel

Adds a new channel.
```js
synth.addNewChannel();
```

### reloadSoundfont

Changes the soundfont of a Synthesizer's instance.

```js
synth.reloadSoundFont(soundFontBuffer);
```

- soundFont - the soundfont to change to, an `ArrayBuffer` instance of the file.

### setDrums
Sets the given channel to a drum channel.
```js
synth.setDrums(channel, isDrum);
```
- channel - the channel to change. Usually ranges from 0 to 15, but it depends on the channel count.
- isDrum - `boolean` indicates if the channel should be a drum channel.

### Accesing controller values
use `synth.workletProcessorChannels` to get the current values. A single channel is defined as follows:
```js
/**
 * @typedef {Object} WorkletProcessorChannel
 * @property {Int16Array} midiControllers - array of MIDI controller values
 * @property {boolean[]} lockedControllers - array indicating if a controller is locked
 * @property {boolean} holdPedal - indicates whether the hold pedal is active
 * @property {boolean} drumChannel - indicates whether the channel is a drum channel
 *
 * @property {Preset} preset - the channel's preset
 * @property {boolean} lockPreset - indicates whether the program on the channel is locked
 *
 * @property {boolean} lockVibrato - indicates whether the custom vibrato is locked
 * @property {Object} channelVibrato - vibrato settings for the channel
 * @property {number} channelVibrato.depth - depth of the vibrato effect (cents)
 * @property {number} channelVibrato.delay - delay before the vibrato effect starts (seconds)
 * @property {number} channelVibrato.rate - rate of the vibrato oscillation (Hz)

 * @property {boolean} isMuted - indicates whether the channel is muted
 * @property {WorkletVoice[]} voices - array of voices currently active on the channel
 * @property {WorkletVoice[]} sustainedVoices - array of voices that are sustained on the channel
 */

```
Note: this definition is stripped from internal values.

## Sequencer
### Initialization
```js
const sequencer = new Sequencer(synthesizer);
```
- synthesizer - a `Synthesizer` instance to play to.

### loadNewSongList
Loads a new song list.
```js
sequencer.loadNewSongList(parsedMidis);
```
- parsedMidis - an array of `MIDI` instances representing the songs to play. If there's only one, the loop will be enabled.

### play
Starts playing the sequence. If the sequence was paused, it won't change any controllers, but if it wasn't (ex. the time was changed) then it will go through all the controller changes from the start before playing. **This function does NOT modify the current playback time!**
```js
sequencer.play(resetTime);
```
- resetTime - boolean, if set to `true` then the playback will start from 0. Defaults to `false`;

### pause
Pauses the playback of the sequence.
```js
sequencer.pause();
```

### stop
Stops the playback of the sequence. Currently only used internally by the `pause` function.
```js
sequencer.stop();
```

### nextSong
Plays the next song in the list.
```js
sequencer.nextSong();
```

### previousSong
Plays the previous song in the list.
```js
sequencer.previousSong();
```

### paused
Read-only boolean, indicating that if the sequencer's playback is paused.
```js
if(sequencer.paused)
{
   console.log("Sequencer paused!");
}
else
{
   console.log("Sequencer playing or stopped!");
}
```

### loop
Boolean that controls if the sequencer loops.
```js
sequencer.loop = false; // the playback will stop after reaching the end
```

### currentTime
Property used for changing and reading the current playback time.
#### get
Returns the current playback time in seconds.
```js
console.log("The sequences is playing for"+sequencer.currentTime+" seconds.");
```
#### set
Sets the current playback time. Calls `stop` and then `play` internally.
```js
sequencer.currentTime = 0; // go to the start
```

### duration
Length of the track in seconds. Equivalent of `Audio.duration`;
```js
console.log(`The track lasts for ${sequencer.duration} seconds!`);
```

## MIDI
See [MIDI on SpessaSynth wiki](https://github.com/spessasus/SpessaSynth/wiki/MIDI-Class)

## SoundFont2
See [SoundFont2 on SpessaSynth wiki](https://github.com/spessasus/SpessaSynth/wiki/SoundFont2-Class)
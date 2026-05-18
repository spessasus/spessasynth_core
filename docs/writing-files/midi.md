# Writing MIDI Files

Below is a basic guide to writing .mid and .rmi files.

## Writing a MIDI file

!!! Important

    Also see [Creating MIDI Files From Scratch](../midi/creating-midi-files.md)

### writeMIDI

Writes the sequence as a Standard MIDI File.

```ts
midi.writeMIDI();
```

The returned value is an `ArrayBuffer` - a binary representation of the Standard MIDI File.

### Example

Below is a basic example of writing a modified MIDI file

```ts
// create your midi and synthesizer
const midi = BasicMIDI.fromArrayBuffer(yourBufferGoesHere);
const synth = new SpessaSynthProcessor(44100);

// ...

// get the snapshot and apply it
const snapshot = synth.getSnapshot();
midi.applySnapshot(snapshot);

// write midi
const midiBinary = midi.writeMIDI();

// save the file
const blob = new Blob([midiBinary.buffer], { type: "audio/midi" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = midi.name + ".mid";
a.click();
```

## Writing an .rmi file

### writeRMIDI

This function writes out an RMIDI file (MIDI + SF2).
[See more info about this format](https://github.com/spessasus/sf2-rmidi-specification#readme)

```ts
const rmidiBinary = midi.writeRMIDI(soundBankBinary, configuration);
```

The method is called on a `BasicMIDI` instance; that instance is the MIDI file to embed.

### Parameters

#### soundBankBinary

`ArrayBuffer` - The binary sound bank (SF2 or DLS) to embed into the file.

#### configuration

`Object`, optional - A partial options object. All properties are optional.

- **bankOffset** - `number` - The bank offset to apply to the file. Default `0`. [See this for more info](https://github.com/spessasus/sf2-rmidi-specification#dbnk-chunk)

- **soundBank** - `BasicSoundBank` - The sound bank instance that `soundBankBinary` contains. Used for correcting bank and program changes when `correctBankOffset` is enabled. If omitted, bank correction may be less accurate.

- **correctBankOffset** - `boolean` - If the function should correct all program-selects and bank-selects in the MIDI file to reflect the embedded sound bank (i.e., make it [self-contained](https://github.com/spessasus/sf2-rmidi-specification#self-contained-file)). Recommended unless a specific use-case is required. Default `true`.

- **metadata** - `Object` - The metadata of the file. If left undefined, some basic metadata (like the song's title) will be copied from the MIDI.

!!! Important

    All metadata properties below are *optional*.

- name - `string` - the name of the song.
- engineer - `string` - the engineer of the sound bank.
- artist - `string` - the artist of the song.
- album - `string` - the album's name.
- genre - `string` - the song's genre.
- comment - `string` - a comment about the song.
- creationDate - `Date` - the creation date of the file. If not provided, current day is used.
- copyright - `string` - the copyright string. If not provided, `midi.getExtraMetadata()` is used.
- picture - `ArrayBuffer` - the album cover of the song. Binary data of the image.
- midiEncoding - `string` - The encoding of the inner MIDI file. Make sure to pick a value acceptable by `TextDecoder`.

!!! Warning

    Providing *any* of the metadata fields overrides the info encoding with `utf-8`.
    This behavior is forced due to lack of support for other encodings by the `TextEncoder` class.

!!! Tip

    use [trim](../sound-bank/index.md#trim) to drastically reduce the file size.
    consider also using compression (like shown in example) to save even more space.
    (using these both methods, I managed to cram a 1GB soundfont into a 5MB RMIDI!)

### Example

Below is a simple example for exporting an RMIDI file

```html
<label for="soundfont_upload">Upload soundfont</label>
<input type="file" id="soundfont_upload" />
<label for="midi_upload">Upload MIDI</label>
<input type="file" id="midi_upload" />
<button id="export">Export</button>
```

!!! Note

    This example uses soundfont3 compression.
    Make sure you've [read this](../sound-bank/index.md#compressionfunction)

```ts
const sfInput = document.getElementById("soundfont_upload");
const midiInput = document.getElementById("midi_upload");
document.getElementById("export").onchange = async () => {
    // get the files
    const soundBank = SoundBankLoader.fromArrayBuffer(
        await sfInput.files[0].arrayBuffer()
    );
    const midi = BasicMIDI.fromArrayBuffer(
        await midiInput.files[0].arrayBuffer()
    );

    // trim the soundfont
    soundBank.trim(midi);
    // write out with compression to save space (0.5 is medium quality)
    await soundBank.setSampleFormat({
        format: "compressed",
        compressionFunction: SampleEncodingFunction // Remember to get your compression function
    });
    const soundfontBinary = soundBank.writeSF2();
    // get the rmidi
    const rmidiBinary = midi.writeRMIDI(soundfontBinary, {
        soundBank,
        metadata: {
            name: "A cool song",
            artist: "John",
            creationDate: new Date(),
            album: "John's songs",
            genre: "Rock",
            comment: "My favorite!"
        }
    });

    // save the file
    const blob = new Blob([rmidiBinary.buffer], { type: "audio/rmid" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = midi.name + ".rmi";
    a.click();
};
```

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

### modify

Allows easily modifying the sequence's programs and controllers.
All parameters are optional.

```ts
midi.modify({
    programChanges,
    controllerChanges,
    channelsToClear,
    channelsToTranspose,
    clearDrumParams,
    reverbParams,
    chorusParams,
    delayParams,
    insertionParams
});
```

- programChanges - an array of objects, defined as follows (note the `extends MIDIPatch`):

```ts
interface DesiredProgramChange extends MIDIPatch {
    /**
     * The channel number.
     */
    channel: number;
}
```

- controllerChanges - an array of objects, defined as follows:

```ts
interface DesiredControllerChange {
    /**
     * The channel number.
     */
    channel: number;

    /**
     * The MIDI controller number.
     */
    controllerNumber: number;

    /**
     * The new controller value.
     */
    controllerValue: number;
}
```

- channelsToClear - an array of numbers, indicating the channel number to effectively mute.

!!! Warning

    Clearing the channel removes the messages rather than setting volume to 0! This operation is irreversible if the
    original midi file is lost.

- channelsToTranspose - an array of objects, defined as follows:

```ts
interface DesiredChannelTranspose {
    /**
     * The channel number.
     */
    channel: number;

    /**
     * The number of semitones to transpose.
     * This can use floating point numbers, which will be used to fine-tune the pitch in cents using RPN.
     */
    keyShift: number;
}
```

- clearDrumParams - `boolean`, if the drum editing parameters (such as pitch, pan, etc.) should be removed. Both XG and GS.
- reverbParams - `ReverbProcessorSnapshot`, the desired GS reverb params, leave undefined for no change.
- chorusParams - `ChorusProcessorSnapshot`, the desired GS chorus params, leave undefined for no change.
- delayParams - `DelayProcessorSnapshot`, the desired GS delay params, leave undefined for no change.
- insertionParams - `InsertionProcessorSnapshot`, the desired GS insertion params, leave undefined for no change.
  Object is defined as follows:

```ts
interface InsertionProcessorSnapshot {
    type: number;
    /**
     * Parameters for the effect, 255 means "no change"
     */
    params: Uint8Array;

    /**
     * 0-127
     * This parameter sets the amount of insertion sound that will be sent to the reverb.
     * Higher values result in more sound being sent.
     */
    sendLevelToReverb: number;

    /**
     * 0-127
     * This parameter sets the amount of insertion sound that will be sent to the chorus.
     * Higher values result in more sound being sent.
     */
    sendLevelToChorus: number;

    /**
     * 0-127
     * This parameter sets the amount of insertion sound that will be sent to the delay.
     * Higher values result in more sound being sent.
     */
    sendLevelToDelay: number;

    /**
     * A boolean list for channels that have the insertion effect enabled.
     */
    channels: boolean[];
}
```

### applySnapshot

Applies a [SynthesizerSnapshot](../spessa-synth-processor/synthesizer-snapshot.md) to the sequence _in place_.
This means changing the programs and controllers if they are locked.

```ts
midi.applySnapshot(snapshot);
```

- snapshot - the `SynthesizerSnapshot` to use.

For example, if channel 1 has locked preset on `Drawbar Organ`,
this will remove all program changes for channel 1 and add one at the start to change the program to `Drawbar organ`.

### Example

Below is a basic example of writing a modified MIDI file

```ts
// create your midi and synthesizer
const midi = BasicMIDI.fromArrayBuffer(yourBufferGoesHere);
const synth = new SpessaSynthProcessor(44100);

// ...

// get the snapshot and apply it
const snapshot = SynthesizerSnapshot.create(synth);
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

    use [trimSoundBank](../sound-bank/index.md#trimsoundbank) to drastically reduce the file size.
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
    soundBank.trimSoundBank(midi);
    // write out with compression to save space (0.5 is medium quality)
    const soundfontBinary = await soundBank.writeSF2({
        compress: true,
        compressionFunction: SampleEncodingFunction // Remember to get your compression function
    });
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

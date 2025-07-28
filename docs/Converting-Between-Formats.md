# Converting between various file formats

This guide demonstrates how to convert various file formats using `spessasynth_core`.
Whether you're working with SoundFont files (SF2, SF3),
Downloadable Sounds (DLS), or MIDI-related formats (RMI, MIDI), these examples will help you perform conversions quickly
and efficiently.

!!! Important

    The input file binary is named `input` 
    and the output binary file is named `output`
    in the examples.

## SF2 To SF3

!!! Note

    This example uses soundfont3 compression.
    Make sure you've [read this](Sound-Bank.md#compressionfunction)

```js
const sfont = loadSoundFont(input);
const output = await sfont.write({
    compress: true,
    compressionFunction: SampleEncodingFunction // make sure to get the function for compression
});
```

## DLS to SF2

```js
const sfont = loadSoundFont(input);
const output = await sfont.write();
```

## SF2 To DLS

Make sure to read about [the DLS conversion problem](DLS-Conversion-Problem.md)

```js
const sfont = loadSoundFont(input);
const output = await sfont.writeDLS();
```

## RMI To MIDI

```js
const RMID = new MIDI(input);
const output = await RMID.writeMIDI();
```

## RMI To SF2/SF3

```js
const RMID = new MIDI(input);
const sfont = loadSoundFont(RMID.embeddedSoundFont);
const output = await sfont.write();
```

## SF2/DLS + MIDI To RMI

This uses two inputs, `input1` for MIDI and `input2` for SoundFont.

```js
const mid = new MIDI(input1);
const sfont = loadSoundFont(input2);
// compress this if you want
const sfontBinary = await sfont.write();
const output = mid.writeRMIDI(
    sfontBinary,
    sfont,
    0, // bank offset: adjust this if necessary
    "utf-8", // encoding: utf-8 recommended
    {
        // all the values below are examples, showing how to copy MIDI data to the RMI file
        name: mid.midiName,
        copyright: mid.copyright,
        engineer: sfont.soundFontInfo["IENG"],
    },
    true // adjust program changes: recommended for self-contained files
);
````

## DLS RMI To SF2 RMI

```js
const dlsRMID = new MIDI(input);
const sfont = loadSoundFont(dlsRMID.embeddedSoundFont);
const sfontBinary = await sfont.write();
const output = dlsRMID.writeRMIDI(
    sfontBinary,
    sfont,
    dlsRMID.bankOffset, // bank offset gets detected for DLS rmi
    "utf-8", // encoding: utf-8 recommended
    {
        // here we try to extract the metadata from the file, then fall back to embedded MIDI
        name: dlsRMID.RMIDInfo["INAM"] || dlsRMID.midiName,
        copyright: dlsRMID.RMIDInfo["ICOP"] || dlsRMID.copyright,
        engineer: sfont.soundFontInfo["IENG"],
        artist: dlsRMID.RMIDInfo["IART"],
        // both IPRD and IALB represent album name
        album: dlsRMID.RMIDInfo["IPRD"] || dlsRMID.RMIDInfo["IALB"],
        genre: dlsRMID.RMIDInfo["IGNR"],
        comment: dlsRMID.RMIDInfo["ICMT"],
        // either use the embedded one or today                     
        creationDate: dlsRMID.RMIDInfo["ICRD"] || new Date().toDateString()
    },
    false // adjust program changes: I recommend false for that one
);
```
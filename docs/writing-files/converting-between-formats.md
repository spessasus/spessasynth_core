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
    Make sure you've [read this](../sound-bank/index.md#compressionfunction)

```ts
const sfont = SoundBankLoader.fromArrayBuffer(input);
const output = await sfont.writeSF2({
    compress: true,
    compressionFunction: SampleEncodingFunction // make sure to get the function for compression
});
```

## DLS to SF2

```ts
const sfont = SoundBankLoader.fromArrayBuffer(input);
const output = await sfont.writeSF2();
```

## SF2 To DLS

Make sure to read about [the DLS conversion problem](../extra/dls-conversion-problem.md)

```ts
const sfont = SoundBankLoader.fromArrayBuffer(input);
const output = await sfont.writeDLS();
```

## RMI To MIDI

```ts
const rmid = BasicMIDI.fromArrayBuffer(input);
const output = await rmid.writeSF2();
```

## RMI To SF2/SF3

```ts
const rmid = BasicMIDI.fromArrayBuffer(input);
const sfont = SoundBankLoader.fromArrayBuffer(rmid.embeddedSoundBank);
const output = await sfont.writeSF2();
```

## SF2/DLS + MIDI To RMI

This uses two inputs, `input1` for MIDI and `input2` for the sound bank.

```ts
const mid = BasicMIDI.fromArrayBuffer(input1);
const sfont = SoundBankLoader.fromArrayBuffer(input2);
// compress this if you want
const sfontBinary = await sfont.writeSF2();
const output = mid.writeRMIDI(
    sfontBinary,
    sfont,
    0, // bank offset: adjust this if necessary
    "utf-8", // encoding: utf-8 recommended
    {
        // all the values below are examples, showing how to copy MIDI data to the RMI file
        name: mid.getName(),
        copyright: mid.getExtraMetadata(),
        engineer: sfont.soundBankInfo.engineer,
    },
    true // adjust program changes: recommended for self-contained files
);
````

## DLS RMI To SF2 RMI

```ts
const dlsRMID = BasicMIDI.fromArrayBuffer(input);
const sfont = SoundBankLoader.fromArrayBuffer(dlsRMID.embeddedSoundBank);
const sfontBinary = await sfont.writeSF2();
const output = dlsRMID.writeRMIDI(
    sfontBinary,
    sfont,
    dlsRMID.bankOffset, // bank offset gets detected for DLS rmi
    "utf-8", // encoding: utf-8 recommended
    {
        // here we try to extract the metadata from the file, then fall back to embedded MIDI
        name: dlsRMID.getName(),
        copyright: dlsRMID.rmidiInfo.copyright || dlsRMID.getExtraMetadata(),
        engineer: sfont.soundBankInfo.engineer,
        artist: dlsRMID.getRMIDInfo("artist"),
        album: dlsRMID.getRMIDInfo("album"),
        genre: dlsRMID.getRMIDInfo("genre"),
        comment: dlsRMID.getRMIDInfo("comment"),
        // either use the embedded one or today                     
        creationDate: dlsRMID.getRMIDInfo("creationDate") ?? new Date()
    },
    false // adjust program changes: I recommend false for that one
);
```
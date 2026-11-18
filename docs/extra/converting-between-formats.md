---
title: Converting between various file formats
---

# Converting between various file formats

This guide demonstrates how to convert various file formats using `spessasynth_core`.
Whether you're working with SoundFont files (SF2, SF3),
Downloadable Sounds (DLS), or MIDI-related formats (RMI, MIDI), these examples will help you perform conversions.

> **Important**
>
> In the examples, the input file binary is an `ArrayBuffer` named `input`,
> and the output file binary is named `output`.
> All the classes used are imported from `spessasynth_core` like this:
>
> ```ts
> import { BasicMIDI, SoundBankLoader } from "spessasynth_core";
> ```

## SF2 To SF3

> **Note**
>
> This example uses SoundFont3 compression.
> You need to provide your own compression function. See {@link SampleEncodingFunction} for more information.

```ts
const sfont = SoundBankLoader.fromArrayBuffer(input);
await sfont.setSampleFormat({
    format: "compressed",
    // Your function that encodes the samples.
    compressionFunction: encodeVorbis
});
const output = sfont.writeSF2();
```

## SF3 To SF2

```ts
const sfont = SoundBankLoader.fromArrayBuffer(input);
await sfont.setSampleFormat({
    format: "pcm"
});
const output = sfont.writeSF2();
```

## SF2 To SFe

```ts
const sfont = SoundBankLoader.fromArrayBuffer(input);
const output = sfont.writeSFe();
```

> **Note**
>
> The bank model is SFe, so an SF2 file is converted when it is loaded (see
> [section 9.2 of the SFe specification](https://spessasus.github.io/spessasynth_sfe/spec.html#92-conversion-from-soundfont-2)) and converted back when it is
> written as SF2 ([section 9.1](https://spessasus.github.io/spessasynth_sfe/spec.html#91-conversion-to-soundfont-2)). An SF2 file that is loaded and written
> again changes once, and nothing after that. An attenuation value (SF2 stores 2.5 times the centibels) may change by
> one unit. A send of the default form with a file amount above 200 comes back as 200.
>
> A bank that is written as SF2 and loaded again changes too. The amount of a send of the default form becomes a
> multiple of 5 and at most 1000, so 503 becomes 505. The amount of a mod wheel vibrato that follows the Modulation
> Depth Range becomes a multiple of 32, limited to -32736 to 32736. A mod wheel vibrato without the range and with an
> amount from -1023 to 1023 comes back with the range and 32 times the amount. What section 9.1 drops is gone, unless
> the bank was written without `DMOD`, because loading then gives the whole list of section 7.3 back. Use
> {@link BasicSoundBank.getSF2Losses} to see what a bank loses when written as SF2.

## DLS To SF2

```ts
const sfont = SoundBankLoader.fromArrayBuffer(input);
const output = sfont.writeSF2();
```

## SF2 To DLS

Make sure to read about [the DLS conversion problem](dls-conversion-problem.md).

```ts
const sfont = SoundBankLoader.fromArrayBuffer(input);
const output = sfont.writeDLS();
```

## RMI To MIDI

```ts
const rmid = BasicMIDI.fromArrayBuffer(input);
const output = rmid.writeMIDI();
```

## RMI To SF2/SF3

```ts
const rmid = BasicMIDI.fromArrayBuffer(input);
if (!rmid.embeddedSoundBank) {
    throw new Error("This RMI file does not contain a sound bank!");
}
const sfont = SoundBankLoader.fromArrayBuffer(rmid.embeddedSoundBank);
const output = sfont.writeSF2();
```

## SF2/DLS + MIDI To RMI

This uses two inputs, `input1` for MIDI and `input2` for the sound bank.

```ts
const mid = BasicMIDI.fromArrayBuffer(input1);
const sfont = SoundBankLoader.fromArrayBuffer(input2);
// Compress this if you want
const sfontBinary = sfont.writeSF2();
const output = mid.writeRMIDI(sfontBinary, {
    soundBank: sfont,
    // Adjust this if necessary
    bankOffset: 0,
    // All the values below are examples, showing how to copy MIDI data to the RMI file
    metadata: {
        name: mid.getName(),
        copyright: mid.getExtraMetadata().join("\n"),
        engineer: sfont.soundBankInfo.engineer
    },
    // Recommended for self-contained files
    correctBankOffset: true
});
```

## Tracker module (MOD/XM/S3M/IT) To RMI

Tracker modules are loaded as MIDI files with an embedded sound bank.

```ts
const mid = BasicMIDI.fromArrayBuffer(input);
const output = mid.writeRMIDI(mid.embeddedSoundBank!, {
    // The presets of the converted sound bank are already in the right banks
    correctBankOffset: false
});
```

## DLS RMI To SF2 RMI

```ts
const dlsRMID = BasicMIDI.fromArrayBuffer(input);
if (!dlsRMID.embeddedSoundBank) {
    throw new Error("This RMI file does not contain a sound bank!");
}
const sfont = SoundBankLoader.fromArrayBuffer(dlsRMID.embeddedSoundBank);
const sfontBinary = sfont.writeSF2();
// The existing RMIDI metadata is kept. Only the provided fields get overwritten
const output = dlsRMID.writeRMIDI(sfontBinary, {
    soundBank: sfont,
    // The bank offset gets detected for DLS RMI files
    bankOffset: dlsRMID.bankOffset,
    metadata: {
        engineer: sfont.soundBankInfo.engineer,
        // Either use the embedded date or today
        creationDate: dlsRMID.getRMIDInfo("creationDate") ?? new Date()
    },
    // Recommended to be disabled for this conversion
    correctBankOffset: false
});
```

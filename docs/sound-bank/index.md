# BasicSoundBank

This module handles parsing and writing SoundFont2 (`.sf2`, `.sf3` and `.sfogg`) files.

It also contains support for `.dls` files.

!!! Tip

    If you encounter any errors in this documentation, please **open an issue!**

### Specifications

- [SoundFont2 Specification](http://www.synthfont.com/sfspec24.pdf)
- [SoundFont3 Description](https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format)
- [DLS Level 2 Specification](https://midi.org/dls)

## Initialization

```ts
const soundBank = SoundBankLoader.fromArrayBuffer(buffer);
```

- `buffer` - An `ArrayBuffer` representing the binary file data either DLS level 1/2 or SoundFont2.

The returned value is the parsed `BasicSoundBank`, described below.

## Properties

### isSF3DecoderReady

A Promise object indicating if the SF3/SF2Pack decoder is ready.
Make sure to await it if you are loading SF3/SF2Pack files.
It only needs to be awaited once, globally. Then all banks can be loaded synchronously.

!!! Note

    this property is _static_.

### soundBankInfo

The metadata of this sound bank as an object with properties described below.

#### name

The sound bank's name.

#### version

The sound bank's version, stored as an object:

- major - the major revision, number.
- minor - the minor revision, number.

#### creationDate

The creation date of this sound bank, a `Date` object.

!!! Note

    Note that if the date text is invalid, the current date will be used instead.
    If you have a valid date in your sound bank, and it still fails to parse, please open an issue!

#### soundEngine

The sound engine name.

!!! Note

    The other properties of soundBankInfo listed below are all *optional*!
    They may be undefined.

#### engineer

The engineer (creator) of the sound bank.

#### product

The product information.

#### copyright

The copyright information.

#### comment

The comment, usually the description.

#### subject

The subject of the file. This only appears in DLS files.

#### romInfo

ROM Bank information. (SF2 only)

#### romVersion

A tag that only applies to SF2 and will usually be undefined. (SF2 only)

Stored like the `version` field.

#### software

Software used to edit the file.

### presets

An array of all presets in the bank, ordered by bank and preset number.
An array of `BasicPreset`s.

### instruments

An array of all instruments in the bank.
An array of `BasicInstrument`s.

### samples

An array of all samples in the bank.
An array of `BasicSample`s.

### defaultModulators

All the default modulators for this bank. A list of [`Modulator`s](modulator.md)

### customDefaultModulators

A boolean,
indicating if the bank uses
the [DMOD chunk.](https://github.com/spessasus/soundfont-proposals/blob/main/default_modulators.md)

### isXGBank

Checks for XG drum sets and considers if this sound bank is XG-compatible.

## Methods

### mergeSoundBanks

Merges multiple sound banks, adding (not replacing) presets on top of the previous ones, and returns a new soundBank.

```ts
BasicSoundBank.mergeSoundBanks(
    soundbank1,
    soundbank2,
    soundbank3 /* more here... */
);
```

- parameters - `BasicSoundBank` instances. The first is used as a base, and the rest are
  added on top.

The return value is a new `BasicSoundBank`.

The INFO data is taken from the first sound bank.

!!! Note

    This method is _static_.

### getDummySoundBankFile

Creates a simple sound bank with a single saw wave preset.

```ts
const sfBinary = await BasicSoundBank.getDummySoundBankFile();
```

The returned value is an `ArrayBuffer` - the binary representation of an .sf2 file.

!!! Note

    This method is _static_ and _asynchronous_

### copyFrom

Copies a given sound bank.

```ts
BasicSoundBank.copyFrom(bank);
```

- bank - the bank to copy.

### addCompletePresets

Adds complete presets along with their instruments and samples.

```ts
bank.addCompletePresets(presets);
```

- presets - an array of `BasicPreset`s to add.

### writeDLS

Writes out a DLS Level 2 sound bank. The returned value is an `ArrayBuffer` - the binary of the file.

```ts
const dls = await soundBank.writeDLS(options);
```

- `options` - An optional object:
    - `progressFunction` - [See this for a detailed explanation](#progressfunction)

!!! Danger

    This method is limited.
    [See this for more info.](../extra/dls-conversion-problem.md)

!!! Important

    This method is _asynchronous._

!!! Warning

    This method is memory and CPU intensive with large sound banks.

### writeSF2

Write out an SF2 or SF3 file. The return value is an `ArrayBuffer` - the binary of the file.

```ts
const binary = await soundBank.writeSF2(options);
```

- `options` - An optional object:
    - `writeDefaultModulators` - a `boolean` indicating if
      the [DMOD chunk](https://github.com/spessasus/soundfont-proposals/blob/main/default_modulators.md) should be
      written.
      Defaults to true.
    - ` writeExtendedLimits` - if
      the [xdta chunk](https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md) should be written
      to allow virtually infinite parameters.
      Defaults to true.
    - `compress` - A `boolean` indicating if any uncompressed samples should be compressed using the lossy Ogg Vorbis
      codec. This significantly reduces file size.
      Defaults to false.
    - `decompress` - A `boolean` indicating if any compressed samples should be decompressed.
      If false, the compressed samples are preserved which results in faster write time and no quality loss.
      Defaults to false and not recommended.
    - `progressFunction` - [See this for a detailed explanation](#progressfunction)
    - `compressionFunction` - [See this for a detailed explanation](#compressionfunction)

!!! Important

    This method is _asynchronous._

!!! Note

    If the sound bank was already compressed, it will not be decompressed to avoid losing quality.

!!! Warning

    This method is memory and CPU intensive with large sound banks, especially if compression is enabled.

### addPresets

Adds presets to the sound bank.

### addInstruments

Adds instruments to the sound bank.

### addSamples

Adds samples to the sound bank.

### cloneSample

Clones the sample into this sound bank.

- sample - the sample to copy.

Returns the copied sample, if a sample exists with that name, it is returned instead.

### cloneInstrument

Recursively clones an instrument into this sound bank, as well as its samples.

- instrument - the instrument to copy.

Returns the copied instrument, if an instrument exists with that name, it is returned instead.

### clonePreset

Recursively clones a preset into this sound bank, as well as its instruments and samples.

- preset - the preset to copy.

Returns the copied preset, if a preset exists with that name, it is returned instead.

### flush

Updates internal values. Call after updating the preset list.

### trimSoundBank

Trims a sound bank to only contain samples in a given MIDI file.

```ts
soundBank.trimSoundBank(midi);
```

- `midi` - `BasicMIDI` - The MIDI file for which to trim the soundBank.

### removeUnusedElements

Removes all unused elements (samples and instruments)

### deleteInstrument

Deletes a given instrument from the sound bank.

### deletePreset

Deletes a given preset from the sound bank.

### deleteSample

Deletes a given sample from the sound bank.

### getPreset

Returns the matching [`BasicPreset` class](preset.md) instance.

```ts
soundBank.getPreset(patch, system);
```

- patch - the [MIDI Patch](../spessa-synth-processor/midi-patch.md) to select.
- system - the MIDI system to select for (`gm`, `gs`, `xg`, `gm2`). If you're unsure, pick `gs`.

### destroySoundBank

Deletes everything irreversibly.

## Extra info

### progressFunction

This _optional_ function gets called after every sample has been written.
It can be useful for displaying progress for long writing operations.

It takes the following arguments:

- name - `string` - sample's name.
- writtenCount - `number` - the count of written samples so far.
- totalSampleCount - `number` - the total number of samples.

Please note that it's usually only effective when writing with compression, as raw writing is inlined for speed.

### compressionFunction

This function must be provided if `compress` is enabled.

The function takes the following arguments:

- audioData: a `Float32Array` with the sample data.
- sampleRate: in Hertz.

The function is recommended to be asynchronous.
It must return an `Uint8Array` instance containing the compressed bitstream.

!!! Note

    Note that using a custom function allows for using *any* type of compression for the SF3 soundBank.
    This is allowed by the [RFC describing SF3 spec](https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format),
    but SpessaSynth can only read Ogg Vorbis compression.

Import your function:

```ts
import { encodeVorbis } from "./libvorbis/encode_vorbis.js"; // adjust the path if necessary
```

Then pass it to the write method:

```ts
const file = await soundBank.writeSF2({
    compress: true,
    compressionFunction: encodeVorbis
});
```

**Why is it not bundled?**

Importing it into the package would increase the size with the entire **1.1MB** encoder,
which would be unnecessary if the functionality is not used.
This approach ensures that only software that uses this functionality can rely on this large file.

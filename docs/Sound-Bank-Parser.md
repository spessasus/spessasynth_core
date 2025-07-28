# Sound Bank Parser

This module handles parsing and writing SoundFont2 (`.sf2`, `.sf3` and `.sfogg`) files.

It also contains support for `.dls` files.

> [!TIP]
> If you encounter any errors in this documentation, please **open an issue!**

### Specifications
 - [SoundFont2 Specification](http://www.synthfont.com/sfspec24.pdf)
 - [SoundFont3 Description](https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format)
 - [DLS Level 2 Specification](https://midi.org/dls)

## Table of Contents
<!-- TOC -->
* [Sound Bank Parser](#sound-bank-parser)
    * [Specifications](#specifications)
  * [Table of Contents](#table-of-contents)
  * [Initialization](#initialization)
  * [Methods](#methods)
    * [getPreset](#getpreset)
    * [getPresetByName](#getpresetbyname)
    * [write](#write)
    * [writeDLS](#writedls)
    * [mergeSoundfonts](#mergesoundfonts)
    * [trimSoundBank](#trimsoundbank)
    * [getDummySoundfontFile](#getdummysoundfontfile)
  * [Properties](#properties)
    * [isSF3DecoderReady](#issf3decoderready)
    * [presets](#presets)
    * [instruments](#instruments)
    * [samples](#samples)
    * [soundFontInfo](#soundfontinfo)
    * [defaultModulators](#defaultmodulators)
    * [customDefaultModulators](#customdefaultmodulators)
  * [SoundFont Internal Structure](#soundfont-internal-structure)
    * [BasicSoundBank structure](#basicsoundbank-structure)
    * [progressFunction](#progressfunction)
    * [compressionFunction](#compressionfunction)
<!-- TOC -->


> [!TIP]
> Using the npm package? Make sure you've read [this](Npm-Size-Reduction)

## Initialization
```js
const soundFont = loadSoundFont(buffer);
```
- `buffer` - An `ArrayBuffer` representing the binary file data either DLS level 1/2 or SoundFont2.

The returned value is the parsed `BasicSoundBank`, described below.

## Methods

### getPreset
Returns the matching [`Preset` class](Preset-Class) instance.
```js
const preset = soundBank.getPreset(bankNr, presetNr);
```
- `bankNr` - MIDI bank number, typically set with the `Bank Select` controller.
- `presetNr` - MIDI program number, usually set with the `Program Change` message.

If the matching preset is not found, the first preset will be returned.
If the requested bank is 128, the first preset with bank 128 will be returned (drums).

### getPresetByName
Returns the matching [`Preset` class](Preset-Class) instance.
```js
const preset = soundBank.getPresetByName(presetName);
```
- `presetName` - The name of the preset as a string. If not found, the first preset will be returned.

### write
Write out an SF2 or SF3 file. The return value is an `Uint8Array` - the binary of the file.
```js
const binary = await soundBank.write(options);
```
- `options` - An optional object:
  - `writeDefaultModulators` - a `boolean` indicating if the [DMOD chunk](https://github.com/spessasus/soundfont-proposals/blob/main/default_modulators.md) should be written.
  Defaults to true.
  - ` writeExtendedLimits` - if the [xdta chunk](https://github.com/spessasus/soundfont-proposals/blob/main/extended_limits.md) should be written to allow virtually infinite parameters. 
  Defaults to true.
  - `compress` - A `boolean` indicating if any uncompressed samples should be compressed using the lossy Ogg Vorbis codec. This significantly reduces file size.
  Defaults to false.
  - `decompress` - A `boolean` indicating if any compressed samples should be decompressed. 
  If false, the compressed samples are preserved which results in faster write time and no quality loss.
  Defaults to false and not recommended.
  - `progressFunction` - [See this for a detailed explanation](#progressfunction)
  - `compressionFunction` - [See this for a detailed explanation](#compressionfunction)
  
> [!IMPORTANT]
> This function is _asynchronous._

> [!IMPORTANT]
> If the SoundFont was already compressed, it will not be decompressed to avoid losing quality.

> [!WARNING]
> This method is memory and CPU intensive with large SoundFonts, especially if compression is enabled.

### writeDLS
Writes out a DLS Level 2 sound bank. The returned value is an `Uint8Array` - the binary of the file.
```js
const dls = await soundBank.writeDLS(options);
```

- `options` - An optional object:
  - `progressFunction` - [See this for a detailed explanation](#progressfunction)


> [!CAUTION]
> This method is experimental and may produce corrupted files.
> [See this for more info.](DLS-Conversion-Problem)

> [!WARNING]
> This method is _asynchronous._

> [!WARNING]
> This method is memory and CPU intensive with large SoundFonts.



### mergeSoundfonts
Merges multiple SoundFonts, adding (not replacing) presets on top of the previous ones, and returns a new soundBank.
```js
BasicSoundBank.mergeSoundBanks(soundfont1, soundfont2, soundfont3, /* more here... */);
```
- `soundfonts` - `BasicSoundBank` instances, with any number of inputs. The first is used as a base, and the rest are added on top.

The return value is a new `BasicSoundBank`.

The INFO data is taken from the first sound bank

> [!NOTE]
> This method is _static_.

### trimSoundBank
Trims the SoundFont _in place_ to only include samples used in the MIDI sequence,
down to the exact key-velocity combinations.
```js
soundBank.trimSoundBank(midi);
```
- `midi` - `MIDI` - The MIDI file for which to trim the soundBank.


### getDummySoundfontFile
Creates a fake soundfont with a single saw wave preset.
Useful when a synthesizer initialization is needed but the proper soundfont is not ready yet.

```js
const sfBinary = await BasicSoundBank.getDummySoundfontFile();
```

- the returned value is an `ArrayBuffer` - the binary represenation of a soundfont file.

> [!NOTE]
> This method is _static_ and _asynchronous_


## Properties

### isSF3DecoderReady
A Promise object indicating if the SF3/SF2Pack decoder is ready.
Make sure to await it if you are loading SF3/SF2Pack files.
It only needs to be awaited once, globally. Then all banks can be loaded synchronously.

> [!NOTE]
> this property is _static_.

### presets
An array of all presets in the bank, ordered by bank and preset number.
```js
console.log(soundBank.presets);
```

### instruments
An array of all instruments in the bank, not ordered.
```js
console.log(soundBank.instruments);
```

### samples
An array of all samples in the bank, not ordered.

An array of all instruments in the bank, not ordered.
```js
console.log(soundBank.instruments);
```

### soundFontInfo
Represents the SoundFont2's `INFO` chunk data. Stored as an object like this:
```js
const infoData = {
    chunk: /* the read's 4-letter code, e.g. */ "INAM",
    infoText: /* the read's data as text, e.g. */ "My cool SoundFont"
}
```
Check out [this website](https://mrtenz.github.io/soundfont2/getting-started/soundfont2-structure.html#info-chunk) for more information.

> [!IMPORTANT]
> `ifil` and `iver` are stored as strings like this: `major.minor`.
> For example, major 2 minor 1 will be `2.1`


### defaultModulators
All the default modulators for this bank. A list of [Modulator Objects](Modulator-Class)

### customDefaultModulators
A boolean,
indicating if the bank uses the [DMOD chunk.](https://github.com/spessasus/soundfont-proposals/blob/main/default_modulators.md)

## SoundFont Internal Structure

The following describes the internal structure of a SoundFont and includes some methods not mentioned above. Useful for editing the soundBank.

**Legend:**

- **Methods:** `methodName (argumentName: type) -> description`
- **Properties:** `propertyName (type) -> description`

> [!WARNING]
> Internal values not described here, such as `modulatorZoneSize`, should not be tampered with.

### BasicSoundBank structure
- `soundFontInfo` (described above)
- `deletePreset` (preset: Preset) -> Deletes a given preset.
- `deleteInstrument` (instrument: Instrument) -> Deletes a given instrument. Cannot delete it if it's used.
- `deleteSample` (sample: Sample) -> Deletes a given sample. Cannot delete it if it's used.
- `instruments` (Instrument[]) -> All instruments.
- `samples` ([Sample](Sample-Class)[]) -> All samples.
- `presets` ([Preset](Preset-Class)[]) -> All presets. Note: Some methods are omitted. Click the link for the full description of the `Preset` class.
  - `presetName` (string) -> The name of the preset.
  - `program` (number) -> The preset's MIDI program.
  - `bank` (number) -> The preset's MIDI bank.
  - `library` (number) -> Generally unused but preserved.
  - `genre` (number) -> Generally unused but preserved.
  - `morphology` (number) -> Generally unused but preserved.
  - `preload` (keyMin: number, keyMax: number) -> Preloads all samples for the given range.
  - `deleteZone` (index: number) -> Deletes a given preset zone and instrument if not used by anything else.
  - `globalZone` (BasicZone) -> The global zone of this preset.
  - `presetZones` (PresetZone[]) -> All zones of the preset.
    - `keyRange` ({min: number, max: number}) -> Key range of the zone.
    - `velRange` ({min: number, max: number}) -> Velocity range of the zone.
    - `generators` ([Generator](Generator-Class)[]) -> Generators of the zone.
    - `modulators` ([Modulator](Modulator-Class)[]) -> Modulators of the zone.
    - `isGlobal` (boolean) -> If true, `instrument` is undefined.
    - `instrument` (Instrument) -> The zone's instrument. Undefined if global.
      - `instrumentName` (string) -> The name of the instrument.
      - `safeDeleteZone` (index: number) -> `deleteZone` but only if the instrument's use count is 0. Useful to ensure the instrument is not deleted when used by other presets.
      - `deleteZone` (index: number) -> Deletes a given preset zone and instrument if not used by anything else.
      - `globalZone` (BasicZone) -> The global zone of this instrument.
      - `linkedPresets` (BasicPreset[]) -> All the presets that are using this instrument.
Note that there may be duplicates of the same preset if it uses the sample multiple times.
  
      - `instrumentZones` (InstrumentZone[]) -> All zones of the instrument.
        - `keyRange` ({min: number, max: number}) -> Key range of the zone.
        - `velRange` ({min: number, max: number}) -> Velocity range of the zone.
        - `generators` ([Generator](Generator-Class)[]) -> Generators of the zone.
        - `modulators` ([Modulator](Modulator-Class)) -> Modulators of the zone.
        - `isGlobal` (boolean) -> If true, `sample` is undefined.
        - `sample` (Sample) -> The sample of the zone. Undefined if global.
          - See [Sample class](Sample-Class)

### progressFunction
This _optional_ function gets called after every sample has been written.
It can be useful for displaying progress for long writing operations.

It takes the following arguments:
- sampleName - `string` - sample's name.
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

> [!NOTE]
> Note that using a custom function allows for using *any* type of compression for the SF3 soundBank.
> This is allowed by the [RFC describing SF3 spec](https://github.com/FluidSynth/fluidsynth/wiki/SoundFont3Format)
>, but SpessaSynth can only read Ogg Vorbis compression.

Import your function:
```js
import { encodeVorbis } from './libvorbis/encode_vorbis.js'; // adjust the path if necessary
```

Then pass it to the write method:
```js
const file = await soundBank.write({
  compress: true,
  compressionFunction: encodeVorbis
});
```

**Why is it not bundled?**

Importing it into the package would increase the size with the entire **1.1MB** encoder, 
which would be unnecessary if the functionality is not used. 
This approach ensures that only software that uses this functionality can rely on this large file.

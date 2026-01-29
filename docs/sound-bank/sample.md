# BasicSample

Represents a single sample, a chunk of audio data.

## EmptySample

A helper constructor for creating samples.

```ts
import { EmptySample } from "./basic_sample";
const sample = new EmptySample();
```

!!! Danger

    Properties and methods not listed here are internal only and should not be used.

## Properties

### name

The sample's name as string.

### sampleRate

The sample rate of the sample, in Hertz.
A number.

### originalKey

The MIDI key number of the recorded pitch for this sample.
A number.

### pitchCorrection

The pitch correction to apply in cents. It can be negative.
A number.

### linkedSample

The other linked sample of the stereo pair.
`BasicSample` or `undefined` if the sample has no link.

### sampleType

The type of the sample, as defined per SF2 specification:

> The value in sfSampleType is an enumeration with eight defined values: monoSample = 1, rightSample = 2, leftSample = 4,
> linkedSample = 8, RomMonoSample = 32769, RomRightSample = 32770, RomLeftSample = 32772, and
> RomLinkedSample = 32776. It can be seen that this is encoded such that bit 15 of the 16 bit value is set if the sample is in
> ROM, and reset if it is included in the SoundFont compatible bank. The four LS bits of the word are then exclusively set
> indicating mono, left, right, or linked.

!!! Warning

    Do not change this value directly. use `setSampleType`, `setLinkedSample` and `unlinkSample` instead.

### loopStart

The sample's loop start index. In sample data points, relative to the start of the sample.

### loopEnd

The sample's loop end index. In sample data points, relative to the start of the sample.

### linkedTo

Sample's linked instruments (the instruments that use it).
Tote that duplicates are allowed since one instrument can use the same sample multiple times.

An array of `BasicInstrument`s.

### isCompressed

Indicates if the sample is compressed.
A boolean.

### isLinked

If the sample is linked to another sample.
A boolean.

## Methods

### setSampleType

Sets the sample type and unlinks if needed.

```ts
sample.setSampleType(type);
```

- type - the type to set it to. `sampleTypes` enum contains all valid types.

### unlinkSample

Unlinks the sample from its stereo link if it has any.

### setLinkedSample

Links a stereo sample.

```ts
sample.setLinkedSample(sample, type);
```

- sample - the BasicSample to link to.
- type - the type to set it to. `sampleTypes` enum contains all valid types.

### getAudioData

Gets the PCM `Float32Array` audio data and stores it internally for reuse. It decodes compressed samples if necessary.

The returned value is a `Float32Array` containing the PCM audio data for the sample.

### resampleData

Resamples the audio data to a given sample rate.

```ts
sample.resampleData(newSampleRate);
```

- newSampleRate - the new sample rate, in Hertz.

### setAudioData

Replaces the audio data _in-place_.

```ts
sample.setAudioData(audioData, sampleRate);
```

- audioData - the new audio data as Float32Array.
- sampleRate - the new sample rate, in Hertz.

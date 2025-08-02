# Sample class

Represents a single sample.

## EmptySample

A helper constructor for creating samples.

```ts
import { EmptySample } from './basic_sample' 
const sample = new EmptySample();
```

## Methods

### getAudioData

Gets the PCM `Float32Array` audio data and stores it internally for reuse. It decodes compressed samples if necessary.

```ts
const data = sample.getAudioData();
```

The returned value is a `Float32Array` containing the PCM audio data for the sample.

All other methods are internal.

## Properties

### name

The sample's name.

```ts
console.log(sample.name); // "Standard SnareL"
```

### loopStart

The sample's loop start index. In sample data points, relative to the start of the sample.

```ts
console.log(sample.loopStart); // 5834
```

### loopEnd

The sample's loop end index. In sample data points, relative to the start of the sample.

```ts
console.log(sample.loopEnd); // 8968
```

### sampleType

The sample type.

```ts
console.log(sample.sampleType); // 2 -> this means "right sample"
```

### isCompressed

Indicates if the sample is compressed (SF3).

```ts
console.log(sample.isCompressed); // true
```

### sampleRate

The sample rate of the sample, in hertz.

```ts
console.log(sample.sampleRate); // 44100
```

### originalKey

The MIDI key number of the recorded pitch for this sample.

```ts
console.log(sample.originalKey); // 60 (Middle C)
```

### pitchCorrection

The pitch correction to apply in cents. It can be negative.

```ts
console.log(sample.pitchCorrection); // -4 (4 cents down)
```

### linkedSample

`BasicSample` or `undefined`. The other linked sample of the stereo pair.

### linkedInstruments

`BasicInstrument[]`. All the instruments that are using this sample.
Note that there may be duplicates of the same instrument if it uses the sample multiple times.

All other properties are internal.
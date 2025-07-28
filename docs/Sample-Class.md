# Sample class
Represents a single SoundFont2 sample.

The class should not be initialized on its own as it's used internally by the [`SoundFont2` class](Sound-Bank-Parser).

## Methods
### getAudioData()
Gets the PCM `Float32Array` audio data and stores it internally for reuse. It decodes compressed samples if necessary.
```js
const data = sample.getAudioData();
```
The returned value is a `Float32Array` containing the PCM audio data for the sample.

All other methods are internal.

## Properties
### sampleName
The sample's name.
```js
console.log(sample.sampleName); // "Standard SnareL"
```

### sampleLoopStartIndex
The sample's loop start index. In sample data points, relative to the start of the sample.
```js
console.log(sample.sampleLoopStartIndex); // 5834
```

### sampleLoopEndIndex
The sample's loop end index. In sample data points, relative to the start of the sample.
```js
console.log(sample.sampleLoopEndIndex); // 8968
```

### sampleType
The sample type.
```js
console.log(sample.sampleType); // 2 -> this means "right sample"
```

### isCompressed
Indicates if the sample is compressed (SF3).
```js
console.log(sample.isCompressed); // true
```

### sampleRate
The sample rate of the sample, in hertz.
```js
console.log(sample.sampleRate); // 44100
```

### samplePitch
The MIDI key number of the recorded pitch for this sample.
```js
console.log(sample.samplePitch); // 60 (Middle C)
```

### samplePitchCorrection
The pitch correction to apply in cents. It can be negative.
```js
console.log(sample.samplePitchCorrection); // -4 (4 cents down)
```

### linkedSample
`BasicSample` or `undefined`. The other linked sample of the stereo pair.

### linkedInstruments
`BasicInstrument[]`. All the instruments that are using this sample. 
Note that there may be duplicates of the same instrument if it uses the sample multiple times.

All other properties are internal.
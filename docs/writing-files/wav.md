# Writing Wave files

SpessaSynth has a helper function for writing wave files.

## audioToWav

Converts PCM audio data into a fully valid wave file.

```ts
const file = audioToWav(audioData, sampleRate, options);
```

- `audioData` - an `Array` of `Float32Array`s representing the data. For stereo, pass `[leftData, rightData]`.
- `sampleRate` - `number` the sample rate, in Hertz.
- `options` - an optional `Object`, described below:
    - `normalizeAudio` - optional `boolean` - if true, the gain of the entire song will be adjusted, so the max sample is
      always 32,767 or min is always -32,768 (whichever is greater). Recommended.
    - `metadata` - optional `Object` described below. All options are string and are optional:
        - `title` - the song's title
        - `artist` - the song's artist
        - `album` - the song's album
        - `genre` - the song's genre
    - `loop` - optional `Object` that will write loop points to the file (using the `cue ` chunk)
        - `start` - start time in seconds
        - `end` - end time in seconds

The metadata uses the `INFO` chunk to write the information. It is encoded with `utf-8`

## Example code

Refer to `examples/midi_to_wav_node.ts` for an example of rendering audio data to a wav file.

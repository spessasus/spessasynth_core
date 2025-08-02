# Preset class

Represents a singe SoundFont2 preset.

## Methods

### getSamplesAndGenerators

Returns the samples and their generators (and modulators) for the given midiNote.
The name is kept from the time that SpessaSynth did not support modulators.

```ts
const samplesAndGenerators = preset.getSampleAndGenerators(midiNote);
```

- midiNote - the note to get generators from. Ranges from 0 to 127.

The returned value is as follows:

```ts
const samplesAndGenerators = [
    {
        instrumentGenerators: [Generator, /*...*/ Generator], // only the instrument generators, local replace global
        presetGenerators: [Generator, /*...*/ Generator], // only the preset generators, local replace global
        modulators: [Modulator, /*...*/ Modulator], // summed and replaced modulators, ready to use
        sample: Sample // the sample object
    },

    /*...*/

    {
        instrumentGenerators: [Generator, /*...*/ Generator],
        presetGenerators: [Generator, /*...*/ Generator],
        modulators: [Modulator, /*...*/ Modulator], // summed and replaced modulators, ready to use
        sample: Sample
    }
];
```

More info about the `Generator` class is [here](generator.md)

## Properties

### name

The preset's name as string.

```ts
console.log(preset.name); // for example: "Drawbar Organ"
```

### bank

The preset's bank number. Used in MIDI `Bank Select` controller.

```ts
console.log(preset.bank); // for example: 0
```

### program

The preset's MIDI program number. Used in MIDI `Program Change` message.

```ts
console.log(preset.program); // for example: 16
```
# Key Modifier Manager

This powerful tool allows modifying each key on each channel to your needs.

Currently, it supports overriding:

- the velocity of that note
- the preset used on that note
- the key's linear gain

## Accessing

It is accessible via the `keyModifierManager` property of the [SpessaSynthProcessor class](index.md).

## Properties

### addMapping

Modify a single key.

```ts
synth.keyModifierManager.addMapping(channel, midiNote, mapping);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the MIDI note to modify. Ranges from 0 to 127.
- mapping - a `KeyModifier` to apply.

### deleteMapping

Clear the modifier from a note, making it behave normally.

```ts
synth.keyModifierManager.deleteMapping(channel, midiNote);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the MIDI note to modify. Ranges from 0 to 127.

### getPatch

Get the key modifier for a given key on a given channel. Returns `undefined` if there's none.

```ts
synth.keyModifierManager.getPatch(channel, midiNote);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the MIDI note to modify. Ranges from 0 to 127.

The returned value is a `KeyModifier` object.

### clearMappings

Clears ALL modifiers in this synthesizer instance.

### getMappings

Returns the current key mappings.

The data is stored as follows:

```ts
const mappings = manager.getMappings();
const mapping: KeyModifier | undefined = mappings[channelNumber][midiNote];
```

### getVelocity

Get the velocity override for a MIDI key.

```ts
manager.getVelocity(channel, midiNote);
```

- channel - number - The MIDI channel number.
- midiNote - number - The MIDI note number (0-127).

Returns the velocity override, or -1 if no override is set.

### getGain

Get the gain override for a MIDI key.

Parameters are the same as `getVelocity`.

Returns the gain override, or 1 if no override is set.

### hasOverridePatch

Check if a MIDI key has an override for the patch.

Parameters are the same as `getVelocity`.

Returns true if the key has an override patch, false otherwise.

### getPatch

Get the patch override for a MIDI key.

Parameters are the same as `getVelocity`.

Returned value is a [MIDI Patch](midi-patch.md)

This method throws an error if no modifier is defined for the key.

## KeyModifier

A basic class for specifying a modification for a single key.

#### velocity

The override MIDI velocity to use. Pass -1 to leave it unchanged.

#### gain

The linear gain to use, 1 means regular volume.

#### patch

The [MIDI Patch](midi-patch.md) this key uses. -1 on bankMSB property means unchanged.

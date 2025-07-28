## Synthesizer Key Modifier Manager
This powerful tool allows modifying each key on each channel to your needs.

It is accessible via the `keyModifierManager` property of the [SpessaSynthProcessor class](SpessaSynthProcessor-Class).

Currently, it supports overriding:
- the velocity of that note
- the preset used on that note
- the key's linear gain

### Adding a key modifier

This function modifies a single key.

```js
synth.keyModifierManager.addModifier(channel, midiNote, mapping);
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the MIDI note to modify. Ranges from 0 to 127.
- mapping - a `KeyModifier` to apply.

### Removing a key modifier

Clears the modifier from a note, making it behave normally.

```js
synth.keyModifierManager.deleteModifier(channel, midiNote)
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the MIDI note to modify. Ranges from 0 to 127.

### Retrieving a key modifier

Get the key modifier for a given key on a given channel. Returns `undefined` if there's none.

```js
synth.keyModifierManager.getModifier(channel, midiNote)
```

- channel - the MIDI channel to use. It usually ranges from 0 to 15, but it depends on the channel count.
- midiNote - the MIDI note to modify. Ranges from 0 to 127.

The returned value is a `KeyModifier` object.

### Clearing all modifiers

Clears ALL modifiers in this synthesizer instance.

```js
synth.keyModifierManager.clearModifiers();
```

### KeyModifier
A basic class for specifying a modification for a single key.

```js
const modifier = new KeyModifier(velocity, bank, program, gain);
```
- velocity - the override MIDI velocity to use. Pass -1 to leave it unchanged.
- bank - the override MIDI bank number to use. Pass -1 to leave it unchanged.
- program - the override MIDI program number to use. Pass -1 to leave it unchanged.
- gain - the linear gain to use, 1 means regular volume.
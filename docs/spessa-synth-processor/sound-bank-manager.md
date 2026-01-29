# Sound Bank Manager

Manages the sound banks of the parent `SpessaSynthProcessor` instance.

## Accessing

Access it through the `soundBankManager` property.

```ts
processor.soundBankManager.doSomething();
```

## Methods

### deleteSoundBank

This method removes a sound bank with a given ID from the sound bank list.

```ts
function deleteSoundBank(id: number) {}
```

- `id` - `string` - the ID of the sound bank to remove.

### addSoundBank

This method adds a new sound bank with a given ID to the list,
or replaces an existing one.

```ts
function addSoundBank(soundBank: BasicSoundBank, id: string, bankOffset = 0) {}
```

- `soundBank` - the new sound bank to add.
- `id` - the ID of the sound bank. If it already exists, it will be replaced.
- `bankOffset` - the bank number offset of the sound bank, set to 0 for no change.

### getPreset

This method gets a given preset from the sound bank stack.

```ts
function getPreset(patch: MIDIPatch, system: SynthSystem) {}
```

- patch - the MIDI patch to search for.
- system - the MIDI system to select the preset for. (`gm`, `gs`, `xg`, `gm2`)

### destroy

This method clears the sound bank list and destroys all sound banks.

## Properties

### presetList

The list of all presets in the sound bank stack with bank offsets applied.

Each item is a preset list entry:

- The properties of a [MIDI Patch](midi-patch.md).
- `name`: `string` - The name of the preset.
- `isAnyDrums`: `boolean` - if this preset is a drum preset. \*This is the correct way of distinguishing between drum and melodic presets.

### priorityOrder

The IDs of the sound banks in the current order. (from the most important to last)

This can be used to set or retrieve the current order.

Presets in the first bank override the second bank if they have the same MIDI patch and so on.

### soundBankList

A list of the sound banks, as objects. Each object has three properties:

- id - the unique string identifier of the sound bank.
- soundBank - the `BasicSoundBank` instance.
- bankOffset - the bank MSB offset.

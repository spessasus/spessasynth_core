# Sound Bank Manager
Manages the sound banks of the parent `SpessaSynthProcessor` instance.

## Accessing
Access it through the `soundfontManager` property.
```ts
processor.soundfontManager.doSomething();
```

## Lookup behavior
The sound bank priority is defined as follows:
The list is ordered from the most important sound bank to the least important.
(e.g., first soundfont is used as a base, and the other sound banks get added on top (not override))

The lookup behavior itself is defined as follows:
1. The program looks for the first sound bank that has the requested program:bank combo and uses it.
2. If not found, the program looks for the first sound bank that has the requested program number and uses it.
3. If not found, the program uses the first preset of the first sound bank.

Please note that if the requested preset is a drum preset, step 2 will try to find the first drum preset.

## Methods
### getPresetList
Returns a complete preset list.
That is, a list of objects:
- `bank` - `number` - the MIDI bank number.
- `program` - `number` - the MIDI program number.
- `name` - `string` - the preset's name.

### reloadManager
This method clears _all_ loaded sound banks and replaces them with a new one, 
with an ID `main` and bank offset of 0.

```ts
processor.soundfontManager.reloadManager(soundBank);
```
- `soundBank` - `BasicSoundBank` - the new sound bank to replace the old list with.

### deleteSoundFont
This method removes a sound bank with a given ID from the sound bank list.

```ts
processor.soundfontManager.deleteSoundFont(id);
```
- `id` - `string` - the ID of the sound bank to remove.

### addNewSoundFont
This method adds a new sound bank with a given ID to the list,
or replaces an existing one.

```ts
processor.soundfontManager.addNewSoundFont(soundBank, id, bankOffset);
```
- `soundBank` - `BasicSoundBank` - the new sound bank to add.
- `id` - `string` - the ID of the sound bank. If it already exists, it will be replaced.
- `bankOffset` - `number` - the bank number offset of the sound bank, set to 0 for no change.

### getCurrentSoundFontOrder
This method gets the current sound bank priority order.

```ts
const order = processor.soundfontManager.getCurrentSoundFontOrder();
```
The returned value is `string[]` - the sound bank IDs in the descending priority.

### rearrangeSoundFonts
This function edits the sound bank priority.

```ts
synth.soundfontManager.rearrangeSoundFonts(newOrderedList);
```

- newOrderedList - array of `string` - The new list of the sound bank IDs, in the desired order.
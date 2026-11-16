---
title: Modulator Information
---

# Modulator Information

Modulators are an SF2 feature fully supported in `spessasynth_core`,
allowing for real-time parameter manipulation with MIDI commands.

Below is useful information regarding the implementation of modulators in `spessasynth_core`.

## Modulator sources

Below is the table of modulator sources if the CC flag is not set.
If it is set, the index is the MIDI controller number.

| Index | Name               | Description                                                                                                                                                                                                         |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | No controller = 1  | Always returns 1.                                                                                                                                                                                                   |
| 2     | Note on velocity   | The MIDI velocity the note was pressed with.                                                                                                                                                                        |
| 3     | Note on key number | The MIDI key number received.                                                                                                                                                                                       |
| 10    | Poly pressure      | The MIDI poly pressure message received for this note number.                                                                                                                                                       |
| 13    | Channel pressure   | The MIDI channel pressure message received for this channel.                                                                                                                                                        |
| 14    | Pitch Wheel        | The pitch wheel value, 14-bit.                                                                                                                                                                                      |
| 16    | Pitch Wheel range  | The range of the pitch wheel, in semitones.                                                                                                                                                                         |
| 127   | Link (UNSUPPORTED) | Other modulator. This feature is underspecified and not implemented, [similarly to fluidsynth](https://github.com/FluidSynth/fluidsynth/wiki/SoundFont#fluidsynths-implementation-details-of-the-soundfont-2-spec). |

## Modulator curve types

Below are the defined curve types of modulators:

- 0 Linear - normal linear scale
- 1 Concave - logarithmic ramp
- 2 Convex - exponential ramp, the inverse of concave
- 3 Switch - 0.5 and below is 0 (or -1 for bipolar), above is 1
- 4 Custom (SFe) - a curve stored in the bank, see [SFe Format](sfe-format.md#721-custom-curves)

## Default Modulators

`spessasynth_core` follows the [SpessaSynth SFe 4 specification](sfe-format.md):

- The default modulators of a new bank are the list of
  [section 7.3](sfe-format.md#73-default-modulators), with its two custom curves. They are available as
  {@link SPESSASYNTH_DEFAULT_MODULATORS}, and every bank owns a copy in {@link BasicSoundBank.defaultModulators}.
- SF2 and SF3 files are converted when they are loaded, as
  [section 9.2](sfe-format.md#92-conversion-from-soundfont-2) describes: the reverb and chorus send amounts are
  multiplied by 5, the default modulators SF2 can't store are added, and every CC 71 to resonance modulator gets its
  CC 71 to gain compensator.
- Writing a bank as SF2 follows [section 9.1](sfe-format.md#91-conversion-to-soundfont-2).
- The reasons behind the list and the conversion are in
  [section 10](sfe-format.md#10-design-rationale).

It also implements the
[default modulators proposal](https://github.com/spessasus/soundfont-proposals/blob/main/default_modulators.md)
(the `DMOD` chunk) for SF2 files.

## Notes for spessasynth_core

What follows is specific to this library and not part of the format.

### SF2 files stay the same

Loading an SF2 file and writing it again as SF2 gives the same file:

- A converted send modulator remembers the amount the file had, and that amount is written back. A send modulator
  that did not come from an SF2 file is written with a fifth of its amount when it is below `1000`. A full send of
  `1000` stays `1000` in a zone and becomes `200` in the default modulators (`DMOD`).
- The CC 71 to gain compensators and the added default modulators are left out, and added again on the next load.

{@link BasicSoundBank.getSF2Losses} counts what a bank would lose when written as SF2.

### Envelope time modulators in SF2

An SF2 file can't store custom curves, which has two consequences:

- An SF2 bank can't name the envelope time modulators in a zone, so it can't override them there. It can replace the
  whole list with a `DMOD` chunk instead.
- If the default modulators are changed and the bank is written as SF2, the written `DMOD` chunk leaves them out.
  When that file is loaded, they are added back, unless the chunk is empty or has a CC 72, 73 or 75 modulator of its
  own (one with amount 0 is enough to keep them out). Writing the bank as SFe keeps them as they are.

### DLS files

- DLS files get the CC 71 to gain compensators when they are loaded, like SF2 files. The DLS writer leaves them out.
- The send amounts of DLS files are not converted, since their default is already `1000`.
- An SF2 bank written as DLS stores the converted amounts. A file amount of `350` is a full send here, which is the
  DLS default, so it is written as a full send and no longer as `350`.

### Differences from versions before SFe 4

- A DLS file with a send amount of its own below `1000` used to be multiplied by 5 as well, and is now played as
  written.
- A preset zone send modulator that adds to an instrument zone one is converted on its own. The sum used to be
  multiplied and capped as a whole, so two amounts that add up to more than `200` in the file now give a steeper
  send.

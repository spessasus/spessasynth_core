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

| Index | Name                   | Description                                                                                                                                                                                                                                                                                                                              |
| ----- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | No controller = 1      | Always returns 1.                                                                                                                                                                                                                                                                                                                        |
| 2     | Note on velocity       | The MIDI velocity the note was pressed with.                                                                                                                                                                                                                                                                                             |
| 3     | Note on key number     | The MIDI key number received.                                                                                                                                                                                                                                                                                                            |
| 10    | Poly pressure          | The MIDI poly pressure message received for this note number.                                                                                                                                                                                                                                                                            |
| 13    | Channel pressure       | The MIDI channel pressure message received for this channel.                                                                                                                                                                                                                                                                             |
| 14    | Pitch Wheel            | The pitch wheel value, 14-bit.                                                                                                                                                                                                                                                                                                           |
| 16    | Pitch Wheel range      | The range of the pitch wheel, in semitones.                                                                                                                                                                                                                                                                                              |
| 17    | Modulation Depth Range | The modulation depth range (RPN 5), where 16 semitones is full. The default mod wheel vibrato modulator uses it as its amount source.                                                                                                                                                                                                    |
| 127   | Link (RESERVED)        | Other modulator. This feature is underspecified and not implemented, [similarly to fluidsynth](https://github.com/FluidSynth/fluidsynth/wiki/SoundFont#fluidsynths-implementation-details-of-the-soundfont-2-spec). A modulator that uses it as a source or amount source, or has a destination with bit 15 set, is ignored (see below). |

## Modulator curve types

Below are the defined curve types of modulators:

- 0 Linear - normal linear scale
- 1 Concave - logarithmic ramp
- 2 Convex - exponential ramp, the inverse of concave
- 3 Switch - below 0.5 is 0 (or -1 for bipolar), 0.5 and above is 1. The negative direction is the opposite
- 4 Custom (SFe) - a curve stored in the bank, see [SFe Format](https://spessasus.github.io/spessasynth_sfe/spec.html#721-custom-curves)

## Ignored modulators

[Section 7.4 of the SFe specification](https://spessasus.github.io/spessasynth_sfe/spec.html#74-ignored-modulators) lists the modulators that a reader ignores:
a linked modulator, an unknown transform type, an unknown destination, an unknown source type, an illegal or reserved controller as a source and a custom curve that
is missing or invalid. The SF2 and SFe readers set the destination of such a modulator to
{@link GeneratorTypes.invalid} and keep it in its zone, so it supersedes nothing and does nothing.

In an SFe file the transform enumerator of a modulator has the extended flag in bit 15, which every modulator that uses
a custom curve must have ([section 5.5.1](https://spessasus.github.io/spessasynth_sfe/spec.html#551-the-extended-modulator-records)). The flag is not part of
{@link Modulator.transformType}, which only holds the transform. The SFe writer sets it when a modulator uses a custom
curve, and the SF2 writer never does.

## Default Modulators

`spessasynth_core` follows the [SpessaSynth SFe 4 specification](https://spessasus.github.io/spessasynth_sfe/spec.html):

- The default modulators of a new bank are the list of
  [section 7.3](https://spessasus.github.io/spessasynth_sfe/spec.html#73-default-modulators), with its two custom curves. They are available as
  {@link SPESSASYNTH_DEFAULT_MODULATORS}, and every bank owns a copy in {@link BasicSoundBank.defaultModulators}.
- SF2 and SF3 files are converted when they are loaded, as
  [section 9.2](https://spessasus.github.io/spessasynth_sfe/spec.html#92-conversion-from-soundfont-2) describes: the initial attenuation generators are
  multiplied by 0.4 and rounded, the reverb and chorus send amounts are multiplied by 5, the default modulators SF2
  can't store are added, every CC 71 to resonance modulator gets its
  CC 71 to gain compensator, and a CC 1 to `modLfoToPitch` or `vibLfoToPitch` modulator with no amount source (amount
  from -1023 to 1023) gets the Modulation Depth Range as its amount source and 32 times its amount.
- The mod wheel vibrato follows RPN 5 (and the GS MOD LFO1 PITCH DEPTH and XG MW LFO PMOD DEPTH messages, which set it)
  only through the Modulation Depth Range source. The engine does not scale any other modulator by it.
- Writing a bank as SF2 follows [section 9.1](https://spessasus.github.io/spessasynth_sfe/spec.html#91-conversion-to-soundfont-2).
- The reasons behind the list and the conversion are in
  [section 10](https://spessasus.github.io/spessasynth_sfe/spec.html#10-design-rationale).

It also implements the
[default modulators proposal](https://github.com/spessasus/soundfont-proposals/blob/main/default_modulators.md)
(the `DMOD` chunk) for SF2 files.

## Notes for spessasynth_core

What follows is specific to this library and not part of the format.

### SF2 round trips are not exact

Loading an SF2 file and writing it again as SF2 can change a few values once, and nothing after that. Writing a bank
as SF2 and loading it again can change values too, as the end of the list says.

- Every `initialAttenuation` generator is converted on load (multiplied by 0.4 and rounded) and on write (divided by
  0.4, rounded and limited to -32768 to 32767), so a value of the file may change by one unit. The bank holds true
  centibels, the same as `gain`. The amounts of the modulators that target it are not changed.
- A send modulator of the default form (CC 91 to the reverb send or CC 93 to the chorus send) is written with a fifth
  of its amount, rounded. This applies to zones and to the default modulators (`DMOD`), so a full send of `1000` is
  `200` in both. A file amount above `200` reads as a full send, and so it is written back as `200`. Other SF2
  synthesizers then play the default send where the file asked for more.
- The CC 71 to gain compensators and the added default modulators are left out, and added again on the next load.
- A modulator with the Modulation Depth Range as its source is dropped. The mod wheel vibrato that has it as its amount
  source and a destination of `modLfoToPitch` or `vibLfoToPitch` (the default one has the amount `1600`) is written
  without the amount source and with its amount divided by 32, rounded to the nearest whole number and limited to -1023
  to 1023, so the default `1600` is `50`. Any other modulator that uses the range is dropped. The loss report counts
  all of these.
- For a bank that is written as SF2 and loaded again, the attenuation comes back exactly (from -13107 to 13107). The
  amount of a send of the default form becomes a multiple of 5 and at most 1000, so `503` becomes `505`. The amount of
  the converted mod wheel vibrato becomes a multiple of 32, limited to -32736 to 32736. A mod wheel vibrato without the
  range and with an amount from -1023 to 1023 comes back with the range and 32 times the amount, so it follows RPN 5
  afterwards.

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

- The synthesizer multiplied the sum of the preset and instrument `initialAttenuation` by 0.4 and rounded it down.
  The SF2 reader now converts each generator by itself (rounded to the nearest whole number), so a preset and an
  instrument value of 7 give 6 centibels where they gave 5.

- A DLS file with a send amount of its own below `1000` used to be multiplied by 5 as well, and is now played as
  written.
- A preset zone send modulator that adds to an instrument zone one is converted on its own. The sum used to be
  multiplied and capped as a whole, so two amounts that add up to more than `200` in the file now give a steeper
  send.

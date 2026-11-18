---
title: SFe Format
---

# SFe Format

> **Note**
>
> SpessaSynth SFe (with a lowercase "e") is not SFE (with an uppercase "E") by the
> [SFE Team](https://sfe-team-was-taken.github.io/SFE/). Here, SFe always means the SpessaSynth format,
> and SFE only means the SFE Team's format. This is not an official specification of SFE.
>
> The two formats share a name and many ideas, and SpessaSynth SFe is heavily inspired by SFE. They are still
> different formats, so a bank made for one is not a valid bank for the other.
>
> SpessaSynth SFe grew out of
> [What SFe 4.0 should have been](https://github.com/spessasus/soundfont-proposals/blob/main/sfe4.md).

## The specification

The SFe 4.0 specification is no longer part of this documentation. It lives in its own repository,
[spessasynth_sfe](https://github.com/spessasus/spessasynth_sfe), together with the compliance test suite:

**[SpessaSynth SFe 4.0 specification](https://spessasus.github.io/spessasynth_sfe/spec.html)**

The section numbers below refer to that document.

## Using SFe in spessasynth_core

This section is informative and not part of the format.

> **Warning**
>
> At the time of writing, `spessasynth_core` is the only software that can read SFe files.
> Use SF2 or SF3 when other synthesizers need to load the bank.

- {@link SoundBankLoader.fromArrayBuffer} loads SFe files like any other bank. The loaded bank's
  {@link BasicSoundBank.type} is `"sfe"`.
- {@link BasicSoundBank.writeSFe} writes one, with {@link SFeWriteOptions}. Any bank can be written as SFe, no
  matter which format it was loaded from. The `rf64` option selects 64-bit chunk sizes, which are only needed for
  banks over 4 GB. It is off by default.
- The generators are listed in [Generator Types](generator-types.md), {@link GeneratorTypes} and
  {@link GeneratorLimits}.
- {@link BasicSoundBank.getSF2Losses} counts what a bank would lose when written as SoundFont 2.
- Core holds a voice for 30 ms before a note off ends it and for 70 ms before its exclusive class ends it (section
  8.1.6). It reads the envelope generators once, as that section allows.
- The bank model is SFe, so a SoundFont 2 file is read into it as section 9.2 describes, and written back as
  section 9.1 describes. Core always loads SoundFont 2 files in the extended compatibility mode and has no SoundFont 2
  compatibility mode. So every rule of the specification applies to them, as section 9.2 says.
- The three rules that section 7.1 gives for SFe files only (the zero time rule, `sampleModes` as an enumeration and
  the wider `fineTune` and `exclusiveClass` ranges) are applied to SoundFont 2 files as well, as a choice of core.
- The custom curves are in {@link BasicSoundBank.customCurves}, as {@link CustomCurve}s. A {@link ModulatorSource}
  uses one through its `curve`, so editing a curve with {@link CustomCurve.setPoints} changes every modulator using it.

```ts
const bank = SoundBankLoader.fromArrayBuffer(input);
const sfe = bank.writeSFe();
```

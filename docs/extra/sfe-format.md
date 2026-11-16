---
title: SFe Format
---

# SFe Format

> **Note**
>
> SpessaSynth SFe (with a lowercase "e") is not SFE (with an uppercase "E") by the
> [SFE Team](https://sfe-team-was-taken.github.io/SFE/). In this document, SFe always means the SpessaSynth format,
> and SFE only means the SFE Team's format. This is not an official specification of SFE.
>
> The two formats share a name and many ideas, and SpessaSynth SFe is heavily inspired by SFE. They are still
> different formats, so a bank made for one is not a valid bank for the other.
>
> SpessaSynth SFe grew out of
> [What SFe 4.0 should have been](https://github.com/spessasus/soundfont-proposals/blob/main/sfe4.md).

## 1. About This Document

This document is the technical specification of SpessaSynth SFe (SF-Enhanced) version 4.0, a sound bank format that extends
the SoundFont 2.04 format. It only describes what SFe adds or changes. Everything not described here is defined by
the [SoundFont 2.04 specification](https://musescore.org/sites/musescore.org/files/2023-01/sfspec24.pdf). A section
that extends a part of SoundFont 2 names that part.

## 2. Introduction

### 2.1 Scope and Intended Purpose of This Document

This document is intended for developers of software that reads, writes or plays SFe files.

The terms BYTE, CHAR, WORD, SHORT, DWORD, FOURCC, chunk and sub-chunk have the same meaning as in SoundFont 2
sections 2 and 3. WORD and DWORD are unsigned. A QWORD is an unsigned 64-bit integer. All values are little-endian.

A reader is software that loads a file, a writer is software that stores one, and a synthesizer is software that
plays one. "Must" marks a requirement on a reader, a writer or a synthesizer. "Should" marks a recommendation, and
"may" marks something that is allowed.

### 2.2 SFe Objectives

SFe extends the SoundFont 2 synthesis model and does not add a second one. Every SFe feature:

1. Extends an existing SoundFont 2 stage (an envelope, the filter, an LFO, a modulator) instead of replacing it.
2. Defaults to exactly the SoundFont 2 behavior, so a SoundFont 2 bank renders the same in an SFe synthesizer.
3. Is generally useful, and also lets a bank reproduce the behavior of classic General MIDI hardware.

SFe also includes the SoundFont 2 SpessaSynth extensions `DMOD` and `xdta`, described in
[soundfont-proposals](https://github.com/spessasus/soundfont-proposals).

An SFe file differs from a SoundFont 2 file only where this document says so. A bank without any SFe feature can
always be written as a valid SoundFont 2 file (see section 9).

The MIDI behavior of a synthesizer (which messages it receives and what they do beyond the modulators of the bank)
is outside this specification.

## 3. RIFF Structure

### 3.1 64-bit Chunk Sizes

This section extends the RIFF rules of SoundFont 2 section 3.

RIFF chunk sizes are DWORDs, which limits a file to 4 GB. An SFe file may use 64-bit chunk sizes instead. Such a
file starts with the FOURCC `RIFS` in place of `RIFF`. In a `RIFS` file, every chunk (the RIFF chunk, all `LIST`
chunks and all sub-chunks) has a 12-byte header: the FOURCC followed by a QWORD size.

All other RIFF rules are unchanged. The size does not include the header or the pad byte, a chunk of odd size is
followed by one pad byte, and the data of a `LIST` chunk starts with its four-character list type.

A writer may use either form. A reader must detect the form from the first FOURCC of the file
and must support both forms.

Only the chunk sizes grow. The sample addresses of the sample headers stay DWORDs (section 6.2), so the smpl
sub-chunk still holds at most 2^32 sample data points.

## 4. SFe RIFF File Format

### 4.1 SFe RIFF File Format Level 0

This section replaces SoundFont 2 section 4.1.

```
<SFe-form> -> RIFF ('sfen'              ; RIFS in a file with 64-bit chunk sizes
                {
                    <INFO-list>
                    <sdta-list>
                    <pdta-list>
                }
             )
```

The RIFF chunk of an SFe file has the form type `sfen` instead of `sfbk`. The form type differs on purpose, so that
a SoundFont 2 reader rejects the file instead of playing it incorrectly.

### 4.2 SFe RIFF File Format Level 1

This section extends SoundFont 2 section 4.2.

```
<INFO-list> -> LIST ('INFO'
                {
                    <ifil-ck>           ; Version, major 4
                    <isng-ck>
                    <INAM-ck>
                    [<irom-ck>]
                    [<iver-ck>]
                    [<ICRD-ck>]
                    [<IENG-ck>]
                    [<IPRD-ck>]
                    [<ICOP-ck>]
                    [<ICMT-ck>]
                    [<ISFT-ck>]
                    <DMOD-ck>           ; Default modulators, see section 7.3
                    [<XMOD-ck>]         ; Extended records of the default modulators
                    [<CURV-ck>]         ; Custom curves
                    [<xdta-list>]       ; Extended hydra
                }
             )
```

The `sdta-list` and `pdta-list` chunks and their sub-chunks are the same as in SoundFont 2.

### 4.3 SFe RIFF File Format Level 2

This section extends SoundFont 2 section 4.3.

```
<DMOD-ck> -> DMOD(<pmod-rec>)           ; The default modulators, like pmod
<XMOD-ck> -> XMOD(<xmod-rec>)           ; The extended records of DMOD
<CURV-ck> -> CURV(wCurveCount:WORD      ; The number of curves
                  <curv-rec>)           ; The curves
<xdta-list> -> LIST ('xdta'
                {
                    <phdr-ck>           ; The nine sub-chunks of pdta, in the same order
                    <pbag-ck>
                    <pmod-ck>           ; Holds <xmod-rec> records
                    <pgen-ck>
                    <inst-ck>
                    <ibag-ck>
                    <imod-ck>           ; Holds <xmod-rec> records
                    <igen-ck>
                    <shdr-ck>
                }
             )
```

### 4.4 SFe RIFF File Format Level 3

This section extends SoundFont 2 section 4.4.

```
<xmod-rec> -> struct sfModExtension
              {
                  WORD wSourceCurve;
                  WORD wAmountCurve;
                  WORD wReserved1;
                  WORD wReserved2;
                  WORD wReserved3;
              };

<curv-rec> -> struct sfCurve
              {
                  CHAR achCurveName[40];
                  WORD wPointCount;
                  struct sfCurvePoint
                  {
                      WORD x;
                      WORD y;
                  } points[wPointCount];
              };
```

## 5. The INFO-list Chunk

### 5.1 The ifil Sub-chunk

This section extends SoundFont 2 section 5.1.

An SFe file is a file with the form type `sfen` and an `ifil` `wMajor` of 4. This document defines version 4.0, so a
writer must write `wMajor` 4 and `wMinor` 0. Later minor versions only add generators, source types and sub-chunks.
A reader must load a file with a higher `wMinor` than it knows, and ignore the generators, source types and
sub-chunks it does not understand, as SoundFont 2 asks. A `wMajor` above 4 is not defined by this document, and a
reader should reject such a file.

A file with the form type `sfen` and a `wMajor` below 4 was written to an earlier, incompatible draft of SFe. A
reader should read it as a SoundFont 2 file, ignoring all generators and modulator destinations above 60.

### 5.2 The isng Sub-chunk

This section extends SoundFont 2 section 5.2.

A bank made for this specification should hold the string "SFe 4" in its `isng` sub-chunk.

### 5.3 The XMOD Sub-chunk

The XMOD sub-chunk holds the extended records of the default modulators in `DMOD`. Each record is an
`sfModExtension` structure, 10 bytes in length:

```
struct sfModExtension
{
    WORD wSourceCurve;
    WORD wAmountCurve;
    WORD wReserved1;
    WORD wReserved2;
    WORD wReserved3;
};
```

The sub-chunk contains one record for each modulator of `DMOD` that uses a custom curve, in the same order, followed
by a terminal record with zero in all fields. The fields are defined in section 5.5.1, and the records are matched
to the modulators as that section describes.

The sub-chunk is optional. A writer must write it when a modulator of `DMOD` uses a custom curve. If the XMOD
sub-chunk is missing, or its record count does not match, every default modulator that uses a custom curve must be
ignored. `DMOD` itself is unchanged, so readers that do not know XMOD keep reading it.

### 5.4 The CURV Sub-chunk

The CURV sub-chunk is an optional sub-chunk holding the custom curves of the bank (section 7.2.1). It starts with
the WORD `wCurveCount`, the number of curves, followed by that many `sfCurve` structures of variable length:

```
struct sfCurvePoint
{
    WORD x;
    WORD y;
};

struct sfCurve
{
    CHAR achCurveName[40];
    WORD wPointCount;
    sfCurvePoint points[wPointCount];
};
```

Curves are numbered from 0 in the order they are stored. A curve may be stored even if no modulator uses it, and a
reader must keep it.

The ASCII character field `achCurveName` contains the name of the curve, terminated by a zero valued byte unless it
fills all 40 bytes. Curve names need not be unique and may be empty.

The WORD `wPointCount` must be at least 2. The `x` values range from 0 to 16383 and must never decrease from one
point to the next. The `y` values range from 0 to 16384.

A curve that breaks these rules is invalid, and it keeps its number. If the sub-chunk ends before all `wCurveCount`
curves are read, the curves that are not fully read are missing. Every modulator that refers to an invalid or
missing curve must be ignored.

### 5.5 The xdta-list Chunk

The optional `xdta-list` chunk is a `LIST` chunk inside the INFO-list chunk. It is defined by the SoundFont 2
extended limits proposal, and SFe keeps its layout and gives its `pmod` and `imod` records a meaning (section
5.5.1). It lifts these SoundFont 2 limits:

- Names of presets, instruments and samples may be up to 40 characters long.
- The bag indices of the preset and instrument headers, the generator and modulator indices of the bags, and
  `wSampleLink` are 32 bits wide.

The `instrument` and `sampleID` generators stay 16 bits wide, so a bank holds at most 65536 instruments and 65536
samples.

The chunk must contain nine sub-chunks in this order, each with the same record size as its counterpart in `pdta`.
`phdr`, `pbag`, `inst`, `ibag` and `shdr` hold one record for each record of their counterpart, including the
terminal record. `pmod` and `imod` hold fewer records (section 5.5.1):

| Sub-chunk | Fields used                                                                         |
| --------- | ----------------------------------------------------------------------------------- |
| `phdr`    | `achPresetName`: characters 21 to 40 of the name. `wPresetBagNdx`: the top 16 bits. |
| `pbag`    | `wGenNdx` and `wModNdx`: the top 16 bits.                                           |
| `pmod`    | The extended modulator records (below).                                             |
| `pgen`    | Only the terminal record.                                                           |
| `inst`    | `achInstName`: characters 21 to 40 of the name. `wInstBagNdx`: the top 16 bits.     |
| `ibag`    | `wInstGenNdx` and `wInstModNdx`: the top 16 bits.                                   |
| `imod`    | The extended modulator records (below).                                             |
| `igen`    | Only the terminal record.                                                           |
| `shdr`    | `achSampleName`: characters 21 to 40 of the name. `wSampleLink`: the top 16 bits.   |

All other fields must be 0. A name continues in `xdta` only when it is longer than 20 characters, and the two halves
are joined. An index is `(top << 16) | bottom`, with the bottom 16 bits in `pdta`.

If the nine sub-chunks are not all present in this order, or if `phdr`, `pbag`, `inst`, `ibag` or `shdr` differs in
size from its `pdta` counterpart, the `xdta-list` chunk is structurally unsound and the whole chunk must be ignored.

#### 5.5.1 The Extended Modulator Records

Only modulators that use a custom curve need an extended record, so the records are sparse. The `pmod` and `imod`
sub-chunks of `xdta` hold one `sfModExtension` record (section 5.3) for each modulator of their `pdta` counterpart
that uses a custom curve, followed by a terminal record with zero in all fields. A modulator uses a custom curve
when its source or its amount source has the source type 4 (section 7.2.1).

A reader matches them in order. It walks the modulators of the `pdta` sub-chunk in order, without the terminal
record, and every modulator that uses a custom curve takes the next record. Every such modulator counts, including
one the reader ignores for another reason (an unknown destination, for example), so all readers match the records
the same way. The number of records without the terminal must equal the number of modulators that use a custom
curve. If it does not, or if the size of the sub-chunk is not a multiple of 10 bytes, the records cannot be matched,
and every modulator of that sub-chunk that uses a custom curve must be ignored.

- The WORD `wSourceCurve` is the index into the CURV sub-chunk of the curve used by the modulator's source, when the
  source's type is 4 (section 7.2.1). Otherwise, it must be 0.
- The WORD `wAmountCurve` is the same for the modulator's amount source.
- The WORDs `wReserved1` to `wReserved3` are reserved for later versions. Writers must write 0. A reader that finds
  a non-zero reserved WORD must ignore that modulator, since a later version may have changed what it does.

If the `xdta-list` chunk is missing or ignored, the modulators of `pmod` and `imod` have no extended records, and
every one of them that uses a custom curve must be ignored. SoundFont 2 files with extended limits hold only the
terminal record, which is the correct count for a list without custom curves.

The XMOD and CURV sub-chunks and the extended modulator records must be ignored in a file that is not an SFe file.

## 6. The pdta-list Chunk

### 6.1 The PHDR Sub-chunk

This section extends SoundFont 2 section 7.2.

In an SFe file, the WORD `wBank` of each preset header holds three values:

| Bits | Value                 |
| ---- | --------------------- |
| 0-6  | bank MSB (MIDI CC 0)  |
| 7    | the drum flag         |
| 8-14 | bank LSB (MIDI CC 32) |
| 15   | reserved              |

A preset with the drum flag is a percussion preset, selected for a percussion channel as a preset at bank 128 is in
SoundFont 2. Bit 15 must be written as 0 and must be ignored when read.

For example, a preset at bank MSB 0 and LSB 66 is stored as 0x4200, and a drum preset at bank MSB 0 and LSB 0 is
stored as 0x0080.

A SoundFont 2 `wBank` from 0 to 128 decodes to the same bank with this layout, so a reader may decode `wBank` this
way in SoundFont 2 files too.

### 6.2 The SHDR Sub-chunk

This section extends SoundFont 2 section 7.10.

A sample in an SFe file may be compressed. A compressed sample has bit 4 (0x10) set in its `sfSampleType`. Its data
in the smpl sub-chunk is an Ogg Vorbis stream, its `dwStart` and `dwEnd` are byte offsets into the smpl sub-chunk,
and its `dwStartloop` and `dwEndloop` are sample data points relative to the start of the decoded sample. A reader
must decide per sample from this flag and must not use `ifil`.

SFe 4.0 defines Ogg Vorbis as the only compression. A writer must not store sample data compressed in any other
way.

The four sample addresses stay DWORDs, and `xdta` does not extend them.

## 7. Enumerators

### 7.1 Generator and Modulator Destination Enumerators

This section extends SoundFont 2 section 8.1.

SoundFont 2 defines generators up to 60 (`endOper`). SFe defines the generators 61 to 89. They must be handled as
SoundFont 2 value generators, and they are valid modulator destinations. In a file that is not an SFe file, a reader
must ignore them, as SoundFont 2 asks for unknown generators.

The generators `filterType`, `modLfoWaveform`, `vibLfoWaveform` and `ignoreNoteOff` are only valid at the instrument
level and must be ignored in preset zones. They are enumerated. A stored value outside the defined values must be
treated as the default. When a modulator targets one of them, the value after the modulators is clamped to the
generator's range and truncated toward zero.

SFe widens the range of two SoundFont 2 generators. `exclusiveClass` ranges from 0 to 32767, where SoundFont 2 stops
at 127, and `fineTune` ranges from -12700 to 12700 cents, where SoundFont 2 stops at -99 and 99. Both apply to
SoundFont 2 files read by an SFe synthesizer too.

All delay, attack, hold and fade times follow the rule SoundFont 2 gives for its delays, where -32768 means zero
time. It applies to the SoundFont 2 generators `delayModLFO`, `delayVibLFO`, `delayModEnv`, `attackModEnv`,
`holdModEnv`, `delayVolEnv`, `attackVolEnv` and `holdVolEnv`, and to the SFe generators `fadeModLFO`, `fadeVibLFO`,
`delayModEnv2`, `attackModEnv2`, `holdModEnv2` and `delayVoice`:

- The value is taken after the preset offset and the modulators, and before key scaling (`keynumToModEnvHold`,
  `keyNumToModEnv2Hold` and `keynumToVolEnvHold`).
- A value of -32768 or lower means exactly zero time.
- A value from -32767 to -12001 must be treated as -12000, as in the SoundFont 2 table. As a result, a negative
  preset offset or modulator only makes these times shorter than 1 ms when the sum reaches -32768.
- The defaults of the SoundFont 2 generators do not change.

A synthesizer may round a time that is shorter than the period at which it updates its envelopes and LFOs.

> **Important**
>
> This applies to SoundFont 2 banks too, since it is the behavior the SoundFont 2 text describes. An SFe synthesizer
> must play -32768 as zero time in every bank, SoundFont 2 or SFe, and not as 1 ms.

When both the delay and the attack of the Volume Envelope are zero, the voice must start at its peak level, without
a fade in.

SFe treats `sampleModes` as an enumeration of the whole value, where SoundFont 2 reads its two lowest bits as flags:

- **0, 1 and 3** are as in SoundFont 2.
- **2, start on release.** SoundFont 2 reads this value as no loop. The voice is silent while the key is held, and
  its envelopes and LFOs run from the note on. At the note off, the sample starts from its first sample data point
  and plays once, without looping.
- **4, alternating loop.** The playback position moves forward from the loop start point (`dwStartloop` plus its
  offsets) to the sample data point before the loop end (`dwEndloop` minus 1, plus its offsets), then backward to
  the loop start point, and repeats. Each turn point is played once, so the loop takes `2 * (end - start - 1)`
  sample data points per round trip, where `end` is exclusive as in SoundFont 2. The sample data points are played
  as stored in both directions. The voice loops through the release phase too, like the value 1. A loop of a single
  sample data point plays like the value 1.
- **Any other value** must be treated as 0.

Past a turn point, interpolation must use the sample data points the playback position reaches next, not the ones
stored beyond the loop.

This applies to SoundFont 2 files read by an SFe synthesizer too.

> **Note**
>
> The value 2 was introduced by Polyphone.

The `initialAttenuation` generator is scaled: an SFe synthesizer must multiply its value (the instrument value plus
the preset value, before the modulators) by 0.4. Modulator amounts and the `gain` generator are not scaled. This
applies to SoundFont 2 files too.

#### 7.1.1 Generator Enumerators Defined

##### 61 filterType

The response of the voice filter.

- 0 is the lowpass filter defined by the SoundFont 2 specification.
- 1 is a highpass filter.
- 2 is a bandpass filter.
- 3 is a peak filter.
- 4 is a notch filter.

All other filter parameters drive every type in the same way: `initialFilterFc`, `initialFilterQ`, `filterQOffset`,
`maxFilterFc`, their modulators, the LFOs and the Modulation Envelopes.

The responses are defined as follows, with `s` the Laplace variable, `w` the cutoff, `Q` the linear Q and
`D = s^2 + w * s / Q + w^2`:

| Type     | Response          | Notes                                        |
| -------- | ----------------- | -------------------------------------------- |
| lowpass  | `w^2 / D`         | The SoundFont 2 filter.                      |
| highpass | `s^2 / D`         |                                              |
| bandpass | `w * s / D`       | Gain Q at the cutoff.                        |
| peak     | `(w^2 - s^2) / D` | Gain 2 * Q at the cutoff and 1 at both ends. |
| notch    | `(w^2 + s^2) / D` | A zero at the cutoff.                        |

A synthesizer may realize these responses in any way that approximates them closely. The bilinear transform with a
prewarped cutoff is recommended.

The linear Q is `10^((r - 30.1) / 200)`, with `r` the resonance in centibels (see `filterQOffset`). SFe defines Q this
way, so an `r` of 0 gives a Butterworth response with no peak. It puts the lowpass peak about 3 dB below the literal
wording of SoundFont 2.

The response is scaled by `10^(-r / 400)`, the SoundFont 2 DC gain reduction of half the resonance (`r / 20` dB). It
applies to every type and scales the whole response. For example, the ends of the peak and notch filters sit at
`-r / 20` dB, and a negative `r` raises them.

For every type, `initialFilterFc` plus its modulators is clamped to 1500 to 13500 absolute cents, as in SoundFont 2.
The excursions of the LFOs and the Modulation Envelopes are added after that clamp.

SoundFont 2 states that the filter does not affect the signal when the cutoff exceeds 20 kHz and the Q is zero. So a
synthesizer may skip the lowpass filter when the cutoff is at 13500 absolute cents and `r` is 0. The other types must
always be computed, because at 13500 absolute cents a highpass or bandpass filter is not neutral.

##### 62 maxFilterFc

The highest cutoff the voice filter can reach, in absolute cents.

The ceiling applies to the final cutoff (`initialFilterFc` plus its modulators, the LFOs and the Modulation
Envelopes), before the filter is computed. A value of 13500, the default, is defined as "no ceiling". The final
cutoff then has no limit other than what the synthesizer can compute at its sample rate.

For example, with a ceiling of 9000 neither the velocity nor an envelope can open the filter past about 1.5 kHz.

##### 63 filterQOffset

An offset, in centibels, added to the resonance of the voice filter. The resonance is:

```
r = clamp(initialFilterQ + its modulators, 0, 960) + clamp(filterQOffset + its modulators, -960, 960)
```

This generator allows for a Q lower than 0.707 (a negative `r`) and a resonance above the SoundFont 2 maximum. It
applies to every filter type, and the sum is not clamped further. The DC gain reduction of `r / 20` dB becomes a
boost for a negative `r`.

> **Note**
>
> For a negative `r` the response falls off from about `w * Q`, so at -300 it starts more than 5 octaves below the
> cutoff. Above 960 the filter rings for a very long time.

##### 64 vibLfoToFilterFc

The degree, in cents, to which a full scale excursion of the Vibrato LFO influences the filter cutoff. It works exactly like
`modLfoToFilterFc` does for the Modulation LFO.

##### 65 vibLfoToVolume

The degree, in centibels, to which a full scale excursion of the Vibrato LFO influences the volume. It works exactly like
`modLfoToVolume` does for the Modulation LFO.

##### 66 modLfoToAmplitude

The degree, in 0.1 % units, to which the Modulation LFO changes the voice amplitude linearly.

The two linear depths (66 and 67) are summed before one clamp. The voice output is multiplied by:

```
clamp(1 + lfo_mod * modLfoToAmplitude / 1000 + lfo_vib * vibLfoToAmplitude / 1000, 0, 2)
```

where `lfo_mod` and `lfo_vib` are the LFO outputs from -1 to 1 after the LFO delay and fade. A depth of 1000 swings
the voice from silence to twice its amplitude, and a negative depth starts by turning the voice down.

The factor applies together with the Volume Envelope, after the filter. It is separate from the centibel depths
(`modLfoToVolume`, `vibLfoToVolume`).

##### 67 vibLfoToAmplitude

The same as `modLfoToAmplitude`, for the Vibrato LFO.

##### 68 fadeModLFO

The time, in absolute timecents, over which the output of the Modulation LFO ramps linearly from zero to full after
its delay (`delayModLFO`) ends. It scales all the depths of that LFO. The default of -32768 is zero time, so there is
no fade.

##### 69 fadeVibLFO

The same as `fadeModLFO`, for the Vibrato LFO and `delayVibLFO`.

##### 70 modLfoWaveform

The waveform of the Modulation LFO.

With `p` the position in the cycle, from 0 to 1, the output is:

| Value | Waveform                 | Output                                                                |
| ----- | ------------------------ | --------------------------------------------------------------------- |
| 0     | The SoundFont 2 triangle | `4p` for `p < 0.25`, `2 - 4p` for `p < 0.75`, `4p - 4` from there on. |
| 1     | A rising sawtooth        | `2p` for `p < 0.5`, `2p - 2` from there on.                           |
| 2     | A sine                   | `sin(2 * pi * p)`                                                     |
| 3     | A square wave            | 1 for `p < 0.5`, -1 from there on.                                    |

Every waveform is at zero and rising at `p = 0`, except the square, which begins its half at 1. The LFO starts at
the position given by the start phase (`modLfoStartPhase`).

##### 71 vibLfoWaveform

The same as `modLfoWaveform`, for the Vibrato LFO.

##### 72 modLfoStartPhase

The position in its cycle, in degrees, where the Modulation LFO starts: `p = modLfoStartPhase / 360`, with `p` as
in `modLfoWaveform`. A value of 0 is the SoundFont 2 start, and 360 is the same as 0. For the triangle and the sine,
90 starts at the peak, 180 at zero and falling, and 270 at the trough.

The value is read once, when the voice starts.

##### 73 vibLfoStartPhase

The same as `modLfoStartPhase`, for the Vibrato LFO.

##### 74 modEnv2ToPitch

The degree, in cents, to which a full scale excursion of the second Modulation Envelope influences pitch. It works
like `modEnvToPitch`.

##### 75 modEnv2ToFilterFc

The degree, in cents, to which a full scale excursion of the second Modulation Envelope influences the filter cutoff.
It works like `modEnvToFilterFc`.

##### 76 to 83 The Second Modulation Envelope

The parameters of the second Modulation Envelope. Each is defined like the generator of the first Modulation
Envelope in the same row:

| #   | Generator              | SoundFont 2 equivalent |
| --- | ---------------------- | ---------------------- |
| 76  | `delayModEnv2`         | `delayModEnv`          |
| 77  | `attackModEnv2`        | `attackModEnv`         |
| 78  | `holdModEnv2`          | `holdModEnv`           |
| 79  | `decayModEnv2`         | `decayModEnv`          |
| 80  | `sustainModEnv2`       | `sustainModEnv`        |
| 81  | `releaseModEnv2`       | `releaseModEnv`        |
| 82  | `keyNumToModEnv2Hold`  | `keynumToModEnvHold`   |
| 83  | `keyNumToModEnv2Decay` | `keynumToModEnvDecay`  |

Only the defaults differ from the first envelope (see section 7.1.2).

The second envelope is independent of the first, so a zone can have separate pitch and filter envelopes. With
`modEnv2ToPitch` and `modEnv2ToFilterFc` at 0 (the default) it has no effect and its computation may be skipped.

##### 84 decay2VolEnv

The time, in absolute timecents, of a second decay segment of the Volume Envelope. It is measured like
`decayVolEnv`, as the time for a change of 960 cB. SFe fixes the "100% change" of the SoundFont 2 decay and release
times at 960 cB too.

After the decay reaches `sustainVolEnv`, the level continues in a straight line in centibels to the end level,
`sustainVolEnv + sustain2VolEnv`, which is clamped to 0 to 960 cB. A `sustainVolEnv` above 960 counts as 960, both
as the start of the segment and in this sum.

As with the decay, shorter distances take proportionally less time, and `keynumToVolEnvDecay` scales this time too.
A release during the segment starts from the current level.

##### 85 sustain2VolEnv

The end of the second decay segment, in centibels relative to `sustainVolEnv`. A negative value makes the level rise
back up. The default of 0 means there is no second segment.

##### 86 gain

This is the gain, in centibels, added to the level of the voice. A positive value is louder. The total attenuation
of the voice is:

```
clamp(initialAttenuation + its modulators, 0, 1440) - clamp(gain + its modulators, -1440, 1440)
```

The result is not clamped at 0, so a voice can play above unity. The 0.4 scaling of `initialAttenuation` (section
7.1) must not be applied to `gain`.

##### 87 delayVoice

The time, in absolute timecents, by which the start of the whole voice is delayed after its note on: the sample,
all three envelopes and both LFOs. The voice is silent before that. A synthesizer should start the voice as close to
that time as it can. The value is read once, at the note on.

A note off before the voice starts does not cancel it. The voice still starts at its time and then releases at once,
as if the note off arrived when it started. The voice takes part in its exclusive class from the note on, not from
its delayed start. The default of -32768 is zero time, so there is no delay.

##### 88 ignoreNoteOff

If 1, a note off does not release the voice and the sustain pedal does not hold it. The voice plays until its Volume
Envelope or its sample ends, even for very short notes. The value is read when the note off arrives.

Actions that stop all notes or all sound still end the voice, and so does another note in the same exclusive class.

For example, a drum zone can then play its whole Volume Envelope however short the note is.

##### 89 variationEffectsSend

The degree, in 0.1 % units, to which the audio output of the voice is sent to the variation effects processor. It
works like `reverbEffectsSend` and `chorusEffectsSend` do for their processors.

Support for this generator is optional. If the synthesizer has an additional effects processor beyond reverb and
chorus, such as a delay or a user-selectable effect, this generator sets how much of the voice is sent to it. A
synthesizer without such a processor must ignore this generator and the modulators that target it.

#### 7.1.2 Generator Summary

| #   | Name                   | Unit                       | Min    | Min useful      | Max   | Max useful       | Default           |
| --- | ---------------------- | -------------------------- | ------ | --------------- | ----- | ---------------- | ----------------- |
| 61  | `filterType` +         | type                       | 0      | lowpass         | 4     | notch            | 0 (lowpass)       |
| 62  | `maxFilterFc`          | absolute cents             | 1500   | 20 Hz           | 13500 | 20 kHz           | 13500 (none)      |
| 63  | `filterQOffset`        | cB                         | -960   | -300 (Q 0.02)   | 960   | 960 (Q 44600)    | 0                 |
| 64  | `vibLfoToFilterFc`     | cents fs                   | -12000 | -10 octaves     | 12000 | 10 octaves       | 0                 |
| 65  | `vibLfoToVolume`       | cB fs                      | -960   | -96 dB          | 960   | 96 dB            | 0                 |
| 66  | `modLfoToAmplitude`    | 0.1 % fs                   | -1000  | -100 %          | 1000  | 100 %            | 0                 |
| 67  | `vibLfoToAmplitude`    | 0.1 % fs                   | -1000  | -100 %          | 1000  | 100 %            | 0                 |
| 68  | `fadeModLFO`           | timecents                  | -32768 | 0 s             | 5000  | 18 s             | -32768 (no fade)  |
| 69  | `fadeVibLFO`           | timecents                  | -32768 | 0 s             | 5000  | 18 s             | -32768 (no fade)  |
| 70  | `modLfoWaveform` +     | waveform                   | 0      | triangle        | 3     | square           | 0 (triangle)      |
| 71  | `vibLfoWaveform` +     | waveform                   | 0      | triangle        | 3     | square           | 0 (triangle)      |
| 72  | `modLfoStartPhase` @   | degrees                    | 0      | 0 degrees       | 360   | 360 degrees      | 0                 |
| 73  | `vibLfoStartPhase` @   | degrees                    | 0      | 0 degrees       | 360   | 360 degrees      | 0                 |
| 74  | `modEnv2ToPitch`       | cents fs                   | -12000 | -10 octaves     | 12000 | 10 octaves       | 0                 |
| 75  | `modEnv2ToFilterFc`    | cents fs                   | -12000 | -10 octaves     | 12000 | 10 octaves       | 0                 |
| 76  | `delayModEnv2`         | timecents                  | -32768 | 0 s             | 5000  | 18 s             | -32768 (no delay) |
| 77  | `attackModEnv2`        | timecents                  | -32768 | 0 s             | 8000  | 101.6 s          | -32768 (instant)  |
| 78  | `holdModEnv2`          | timecents                  | -32768 | 0 s             | 5000  | 18 s             | -32768 (no hold)  |
| 79  | `decayModEnv2`         | timecents                  | -12000 | 1 ms            | 8000  | 101.6 s          | -12000 (1 ms)     |
| 80  | `sustainModEnv2`       | 0.1 % decrease             | 0      | 100 %           | 1000  | 0 %              | 0 (100 %)         |
| 81  | `releaseModEnv2`       | timecents                  | -12000 | 1 ms            | 8000  | 101.6 s          | -12000 (1 ms)     |
| 82  | `keyNumToModEnv2Hold`  | timecents per key          | -1200  | doubles per key | 1200  | halves per key   | 0                 |
| 83  | `keyNumToModEnv2Decay` | timecents per key          | -1200  | doubles per key | 1200  | halves per key   | 0                 |
| 84  | `decay2VolEnv`         | timecents                  | -12000 | 1 ms            | 8000  | 101.6 s          | -12000 (1 ms)     |
| 85  | `sustain2VolEnv`       | cB relative to the sustain | -1440  | -960 (96 dB up) | 1440  | 960 (96 dB down) | 0 (none)          |
| 86  | `gain`                 | cB                         | -1440  | -144 dB         | 1440  | 144 dB           | 0                 |
| 87  | `delayVoice` @         | timecents                  | -32768 | 0 s             | 5000  | 18 s             | -32768 (no delay) |
| 88  | `ignoreNoteOff` +      | switch                     | 0      | off             | 1     | on               | 0 (off)           |
| 89  | `variationEffectsSend` | 0.1 %                      | 0      | 0 %             | 1000  | 100 %            | 0                 |

- "+" marks a generator that is only valid at the instrument level.
- "@" marks a generator that is read once, when the voice starts, and does not follow its modulators after that.

The per-key directions of 82 and 83 are for rising keys: SoundFont 2 adds `value * (60 - key)` timecents, so 1200
halves the time for each key upward.

### 7.2 Modulator Source Enumerators

This section extends SoundFont 2 section 8.2.

An SFe synthesizer takes every source value as a 14-bit number `x`, from 0 to 16383, for all source types:

- A 7-bit value `v` is `v * 128`, so 64 is exactly 8192. This applies to the Note-On Velocity, the Note-On Key
  Number, the Poly Pressure, the Channel Pressure and the 7-bit MIDI controllers.
- The MIDI controllers 1 to 31 are `msb * 128 + lsb`, with the LSB from the controllers 33 to 63.
- The Pitch Wheel is its 14-bit value, 8192 at the center.
- The Pitch Wheel Sensitivity is `semitones * 128` rounded down, at most 16383.
- The No Controller source evaluates to 16383.

The controller indices that SoundFont 2 section 8.2.1 calls illegal stay illegal.

#### 7.2.1 Custom Curves

In SFe, the source type field (bits 10 to 15 of the source enumerator) may hold the value 4, a custom curve. The
index, the CC flag, the direction and the polarity select the source as in SoundFont 2. The curve itself is the one
in the CURV sub-chunk given by the modulator's extended record (section 5.5.1).

The value of a source with a custom curve is computed as follows:

1. The source value is taken as the 14-bit number `x` (section 7.2).
2. If the direction is negative, `x` becomes `16384 - x`, as SoundFont 2 reverses a source (`1 - x / 16384`). So
   64 stays exactly 8192, and 0 becomes 16384.
3. The curve is evaluated at `x`. Between two points, `y` is interpolated linearly. Below the first point, `y` is the
   first point's `y`, and above the last point it is the last point's `y`. Where several points share the same `x`
   (a vertical step), the last point with that `x` gives the value at that `x`.
4. A unipolar source outputs `y / 16384`, a bipolar source outputs `(y - 8192) / 8192`.

Unlike the SoundFont 2 curves, a bipolar custom curve is not mirrored around its center, so a curve can be
asymmetric.

In a file that is not an SFe file, a modulator with source type 4 must be ignored, as SoundFont 2 asks for unknown
source types. The same applies when its custom curve is missing or invalid.

Two modulators with custom curves are identical (SoundFont 2 section 7.4) only if their curves have the same points.

### 7.3 Default Modulators

This section replaces SoundFont 2 section 8.4 for SFe files.

An SFe file must hold a `DMOD` sub-chunk in its INFO-list chunk, with the same records as `pmod` and a terminal
record. When a default modulator uses a custom curve, the extended records are in `XMOD` (section 5.3). The
modulators of `DMOD` are the whole default list, so an SFe bank never depends on the defaults of the synthesizer
that plays it. A reader must treat an SFe file without `DMOD` as having no default modulators.

The `DMOD` modulators act as the SoundFont 2 default modulators do. They apply at the instrument level, and an
identical modulator in an instrument zone supersedes them. A modulator that is ignored supersedes nothing.

The list below is the one an SFe writer should start from, for a new bank and when converting a SoundFont 2
bank that has no default modulators of its own. Section 9.2 describes the conversion of SoundFont 2 files, and
section 10 gives the reasons behind the list.

The Transform Enumeration is 0 (Linear) for all of them. "Type" gives the source type, polarity and direction.

| Source                  | Source enum | Type                             | Amount source                            | Destination            | Amount |
| ----------------------- | ----------- | -------------------------------- | ---------------------------------------- | ---------------------- | ------ |
| Note-On Velocity        | 0x0502      | Negative Unipolar Concave        | -                                        | `initialAttenuation`   | 960    |
| CC 1 (modulation wheel) | 0x0081      | Positive Unipolar Linear         | -                                        | `vibLfoToPitch`        | 50     |
| CC 7 (volume)           | 0x0587      | Negative Unipolar Concave        | -                                        | `initialAttenuation`   | 960    |
| Channel Pressure        | 0x000D      | Positive Unipolar Linear         | -                                        | `vibLfoToPitch`        | 50     |
| Pitch Wheel             | 0x020E      | Positive Bipolar Linear          | Pitch Wheel Sensitivity (0x0010)         | `fineTune`             | 12700  |
| CC 10 (pan)             | 0x028A      | Positive Bipolar Linear          | -                                        | `pan`                  | 500    |
| CC 11 (expression)      | 0x058B      | Negative Unipolar Concave        | -                                        | `initialAttenuation`   | 960    |
| CC 91 (reverb)          | 0x00DB      | Positive Unipolar Linear         | -                                        | `reverbEffectsSend`    | 1000   |
| CC 93 (chorus)          | 0x00DD      | Positive Unipolar Linear         | -                                        | `chorusEffectsSend`    | 1000   |
| CC 73 (attack time)     | 0x12C9      | Positive Bipolar Custom, curve A | -                                        | `attackVolEnv`         | 9600   |
| CC 75 (decay time)      | 0x12CB      | Positive Bipolar Custom, curve B | -                                        | `decayVolEnv`          | 9600   |
| CC 72 (release time)    | 0x12C8      | Positive Bipolar Custom, curve B | -                                        | `releaseVolEnv`        | 9600   |
| CC 74 (brightness)      | 0x02CA      | Positive Bipolar Linear          | -                                        | `initialFilterFc`      | 9600   |
| CC 71 (resonance)       | 0x02C7      | Positive Bipolar Linear          | -                                        | `initialFilterQ`       | 250    |
| CC 71 (resonance)       | 0x02C7      | Positive Bipolar Linear          | CC 71, Positive Unipolar Switch (0x0CC7) | `gain`                 | 125    |
| CC 67 (soft pedal)      | 0x0CC3      | Positive Unipolar Switch         | -                                        | `initialFilterFc`      | -1200  |
| CC 94 (variation)       | 0x00DE      | Positive Unipolar Linear         | -                                        | `variationEffectsSend` | 1000   |

The Pitch Wheel Sensitivity is a Positive Unipolar Linear source. The differences from the SoundFont 2 list:

- There is no Note-On Velocity to `initialFilterFc` modulator.
- The pan amount is 500, not the literal 1000 of SoundFont 2 section 8.4.6. With a bipolar source, 500 reaches the full
  range of `pan`. This was confirmed with a real SoundBlaster card.
- The reverb and chorus send amounts are 1000, a full send at the highest controller value, where SoundFont 2 has 200.
- The CC 71 to `gain` modulator gives back the level the filter loses with resonance (`r / 20` dB), so CC 71 changes
  the resonance without making the sound quieter.

The two custom curves are listed as `(CC value, y)` pairs, with `x = CC value * 128`. Below 64 both shorten the time
by 150 timecents per step. Above 64 they lengthen it, and a higher value never makes the time shorter.

- Curve A (attack): (0, 0), (64, 8192), (69, 8192), (70, 8260), (72, 8453), (74, 8661), (77, 8988), (81, 9444),
  (87, 10149), (95, 11112), (105, 12337), (119, 14075), (127, 15074).
- Curve B (decay and release): (0, 0), (64, 8192), (65, 8263), (66, 8290), (67, 8297), (110, 8297), (111, 8309),
  (113, 8387), (114, 8434), (115, 8488), (116, 8548), (117, 8618), (118, 8697), (119, 8789), (120, 8896), (121, 9023),
  (122, 9176), (123, 9363), (124, 9601), (125, 9919), (126, 10384), (127, 11205).

## 8. Parameters and Synthesis Model

This section extends SoundFont 2 section 9. It describes the SFe voice as a whole and adds no rules of its own. The
generator definitions in section 7.1.1 are the normative text.

### 8.1 Synthesis Model

This section extends SoundFont 2 section 9.1.

An SFe voice has the same signal path as a SoundFont 2 voice:

```
                 +------------+    +--------+    +-----------+          +-----+
 Sample data --> | Wavetable  | -> | Filter | -> | Amplifier | ---+---> | Pan | --> Output
                 | Oscillator |    +--------+    +-----------+    |     +-----+
                 +------------+                                   +---> Reverb send
                                                                  +---> Chorus send
                                                                  +---> Variation send
```

It is driven by two LFOs and three envelopes, where SoundFont 2 has two envelopes:

| Source                     | Pitch | Filter cutoff | Volume (cB) | Amplitude (linear) |
| -------------------------- | ----- | ------------- | ----------- | ------------------ |
| Modulation LFO             | yes   | yes           | yes         | SFe                |
| Vibrato LFO                | yes   | SFe           | SFe         | SFe                |
| Modulation Envelope        | yes   | yes           | -           | -                  |
| Second Modulation Envelope | SFe   | SFe           | -           | -                  |
| Volume Envelope            | -     | -             | yes         | -                  |

"SFe" marks a path that SFe adds. With every SFe generator at its default, all of these paths are off and the voice
is a SoundFont 2 voice.

The whole voice (the oscillator, the three envelopes and both LFOs) starts `delayVoice` after its note on.

#### 8.1.1 Wavetable Oscillator

This section extends SoundFont 2 sections 9.1.1 and 9.1.2.

The oscillator is unchanged. `sampleModes` selects one of five ways to play the sample (section 7.1): no loop, a
forward loop, a forward loop that ends at the note off, start on release, and the alternating loop.

The pitch is the SoundFont 2 pitch plus the excursion of the second Modulation Envelope (`modEnv2ToPitch`).

#### 8.1.2 Filter

This section extends SoundFont 2 section 9.1.3.

The filter stays a second order resonant filter. `filterType` selects its response, and the lowpass is the
SoundFont 2 filter. The cutoff and the resonance are computed in this order:

1. `initialFilterFc` plus its modulators, clamped to 1500 to 13500 absolute cents.
2. The excursions of both LFOs (`modLfoToFilterFc`, `vibLfoToFilterFc`) and both Modulation Envelopes
   (`modEnvToFilterFc`, `modEnv2ToFilterFc`) are added.
3. The sum is limited to the ceiling `maxFilterFc`, unless the ceiling is 13500.
4. The resonance `r` is `initialFilterQ` plus its modulators, clamped to 0 to 960 cB, plus `filterQOffset` plus its
   modulators, clamped to -960 to 960 cB.
5. The response of the selected type is computed from the cutoff and `r`, and scaled by `10^(-r / 400)`.

#### 8.1.3 Amplifier

This section extends SoundFont 2 section 9.1.4.

The level of the voice is the product of these factors:

- The attenuation: `initialAttenuation` (scaled by 0.4, plus its modulators, clamped to 0 to 1440 cB) minus `gain`
  (plus its modulators, clamped to -1440 to 1440 cB). The difference can be negative, so a voice can play above
  unity.
- The Volume Envelope.
- The LFO volume excursions in centibels (`modLfoToVolume`, `vibLfoToVolume`).
- The LFO amplitude factor (`modLfoToAmplitude`, `vibLfoToAmplitude`), which is linear and summed for both LFOs
  before one clamp to 0 to 2.

#### 8.1.4 Effects Sends

This section extends SoundFont 2 section 9.1.5.

A voice has three sends: `reverbEffectsSend`, `chorusEffectsSend` and `variationEffectsSend`. Each is the degree to
which the output of the voice is sent to its effects' processor. The variation send is optional for the synthesizer.

#### 8.1.5 Low Frequency Oscillators

This section extends SoundFont 2 section 9.1.6.

Both LFOs have the same four stages. After its delay (`delayModLFO`, `delayVibLFO`), an LFO starts at its start
phase (`modLfoStartPhase`, `vibLfoStartPhase`) with its waveform (`modLfoWaveform`, `vibLfoWaveform`) and frequency.
Its output then ramps linearly from zero to full over its fade time (`fadeModLFO`, `fadeVibLFO`), which scales all
of its depths.

With the SFe generators at their defaults, an LFO is the SoundFont 2 triangle with no fade.

#### 8.1.6 Envelope Generators

This section extends SoundFont 2 section 9.1.7.

The Volume Envelope has seven phases, one more than in SoundFont 2:

1. Delay (`delayVolEnv`).
2. Attack (`attackVolEnv`).
3. Hold (`holdVolEnv`).
4. Decay (`decayVolEnv`), down to the sustain level (`sustainVolEnv`).
5. Second decay (`decay2VolEnv`), a straight line in centibels from the sustain level to the end level
   (`sustainVolEnv + sustain2VolEnv`). With `sustain2VolEnv` at 0 this phase is skipped.
6. Sustain, at the end level, until the note off.
7. Release (`releaseVolEnv`), from the current level.

The second Modulation Envelope has the six phases and the generators of the first one, and runs independently of
it.

Delay, attack and hold times of -32768 are zero time in all three envelopes (section 7.1). When the delay and the
attack of the Volume Envelope are both zero, the voice starts at its peak.

With `ignoreNoteOff` at 1, a note off does not start the release, so the voice plays until its Volume Envelope or
its sample ends.

#### 8.1.7 Modulation Interconnection Summary

This section extends SoundFont 2 section 9.1.8.

The three summing nodes of SoundFont 2 receive the paths marked "SFe" in the table of section 8.1:

- **Pitch:** the Vibrato LFO, the Modulation LFO, the Modulation Envelope and the second Modulation Envelope.
- **Filter cutoff:** the Modulation LFO, the Vibrato LFO, the Modulation Envelope and the second Modulation
  Envelope. They are added after the clamp of `initialFilterFc` and before the ceiling (section 8.1.2).
- **Volume:** the Volume Envelope, the Modulation LFO and the Vibrato LFO, in centibels. The linear amplitude factor
  of the LFOs is applied on top (section 8.1.3).

## 9. Conversion Between Formats

### 9.1 Conversion to SoundFont 2

When an SFe bank is written as SoundFont 2 or SoundFont 3:

- The form type must be `sfbk`, and the chunk sizes must be 32-bit (`RIFF`, not `RIFS`).
- `ifil` must be 2.04, or 3.0 when any sample is compressed.
- `wBank` must follow the SoundFont 2 conventions: 128 for a drum preset, otherwise the bank MSB, or the bank LSB
  when the MSB is 0. The value written to `wBank` must not exceed 128.
- All generators above 60 must be dropped, along with every modulator (in zones and in `DMOD`) whose destination is
  one of them.
- A `sampleModes` generator with the value 4 must be dropped.
- Every modulator that uses a custom curve must be dropped, and the `XMOD` and `CURV` sub-chunks must not be written.
- The `pmod` and `imod` sub-chunks of `xdta`, if written, must hold only the terminal record.
- A reverb or chorus send modulator of the default form (CC 91 to `reverbEffectsSend` or CC 93 to
  `chorusEffectsSend`, Positive Unipolar Linear, no amount source) with an amount below 1000 should be written with
  a fifth of its amount. SoundFont 2 files store 200 where SFe stores a full send of 1000. In `DMOD`, an amount of
  exactly 1000 should be written as 200 too.

### 9.2 Conversion from SoundFont 2

A SoundFont 2 or SoundFont 3 file is made for the SoundFont 2 default modulators and has none of the SFe ones. When
such a file is converted to SFe, or played by an SFe synthesizer, the steps below should be applied so that it sounds
as intended. The reasons are given in section 10.

**Effects sends.** The amount of a reverb or chorus send modulator of the default form (see section 9.1), in the
default modulators and in every zone, should be multiplied by 5, up to 1000, when it is 1000 or lower. An amount
above 1000 stays as it is.

**Default modulators.** A file without a `DMOD` sub-chunk gets the list of section 7.3. A file with a `DMOD` sub-chunk
keeps its list, with these additions:

- The three envelope time modulators (CC 73, CC 75 and CC 72) of section 7.3 should be added, unless the list has a
  modulator with CC 72, CC 73 or CC 75 as its source or amount source.
- The CC 94 to `variationEffectsSend` modulator should be added, unless the list has a modulator with CC 94 as its
  source or amount source.
- An empty `DMOD` sub-chunk means no default modulators, and nothing is added to it.

**Resonance compensation.** A resonance modulator is one with the source CC 71 Positive Bipolar Linear (0x02C7), no
amount source and the destination `initialFilterQ`. Every list of modulators (the default modulators and each zone)
that holds one should get a compensator for it, unless the list already has a modulator with CC 71 as its source and
`gain` as its destination. A compensator has the source 0x02C7, the destination `gain` and an amount that is half of
the resonance modulator's amount, rounded to the nearest whole number. A half rounds toward positive infinity
(-50.5 becomes -50).

- In the default modulators and in an instrument zone, an amount of 0 or above gives one compensator with the amount
  source CC 71 Positive Unipolar Switch (0x0CC7). A negative amount gives that compensator with an amount of 0, and
  a second one with the amount source CC 71 Negative Unipolar Switch (0x0DC7).
- In a preset zone, where the amount adds to the one of the instrument, any amount other than 0 gives one compensator
  with the amount source 0x0CC7.

Conversion to and from formats other than SoundFont 2 or SoundFont 3 is not defined at this time.

## 10. Design Rationale

This section is informative. It explains why the default modulators of section 7.3 and the conversion steps of
section 9 are the way they are.

### 10.1 Default Modulators in Every File

A SoundFont 2 bank relies on the default modulators of the synthesizer, and synthesizers do not agree on them. An
SFe file holds its whole list in `DMOD`, so it sounds the same everywhere, and a bank can change or remove any default
modulator without the synthesizer adding it back.

### 10.2 Effects Send Amounts

The SoundFont 2 defaults send 20 % to the reverb and the chorus at the highest controller value. In practice
synthesizers play a much higher send, and existing banks are balanced by ear against that. SFe therefore stores the
real amount, with a default of 1000 (a full send).

The conversion of section 9.2 multiplies the SoundFont 2 amounts by 5 and stops at 1000, for these reasons:

- A bank that lowers the send slightly from 200, for example to 150, would be almost dry next to a default of 1000.
  Converted, it becomes 750, which is still lower than the default and still audible.
- A bank that already assumes a full send of 1000 is never played louder than that. An amount of 800 in such a bank
  becomes 1000, the same as the default, and no more.
- An amount of 0 stays 0, so a bank can still turn the sends off.

### 10.3 Resonance Compensation

The SoundFont 2 filter lowers its level by half the resonance (`r / 20` dB), so that a resonant peak does not clip.
A controller that raises the resonance during a song should not make the part quieter. The CC 71 to `gain` modulator
gives that level back: half the amount of the CC 71 to `initialFilterQ` modulator, and only above 64, where the
resonance goes up.

It is an ordinary modulator, so a bank can override or remove it. A bank that drives the resonance from CC 71 in
another way, for example through `filterQOffset`, adds a CC 71 to `gain` modulator of its own.

SoundFont 2 has no `gain`, and its banks expect the level to stay the same. This is why section 9.2 adds a compensator
next to every resonance modulator of a converted file. A negative amount raises the resonance below 64, so its
compensator works there. A preset zone modulator adds to the instrument's one, so its compensator adds too. That is
exact as long as the summed amount stays positive.

### 10.4 Envelope Time Controllers

CC 73, CC 75 and CC 72 make the attack, decay and release shorter below 64 and longer above it, by different amounts
on each side. A SoundFont 2 curve can't describe that, and it took several modulators and special handling in the
synthesizer. A custom curve on a bipolar source does it with one modulator for each controller, which a bank can read,
change or replace like any other.

The two curves are a middle ground between the responses of General MIDI hardware. A bank that needs another response
brings its own curves in `DMOD`.

SoundFont 2 can't store these modulators, so section 9.2 adds them to a converted file. A file that has a CC 72, CC 73
or CC 75 modulator of its own has made its choice and keeps it. The same goes for CC 94 and the variation send.

### 10.5 Pan Amount

The pan source is bipolar, so an amount of 500 already reaches both ends of the `pan` range. The 1000 of SoundFont 2
section 8.4.6 would reach them at a quarter and three quarters of the controller's travel. A real SoundBlaster card
plays the 500 response.

### 10.6 Velocity to Filter Cutoff

The Note-On Velocity to `initialFilterFc` default modulator of SoundFont 2 is left out. Most SoundFont 2 synthesizers
do not apply it, and banks are made with that in mind. With it, quiet notes sound muffled.

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
- The custom curves are in {@link BasicSoundBank.customCurves}, as {@link CustomCurve}s. A {@link ModulatorSource}
  uses one through its `curve`, so editing a curve with {@link CustomCurve.setPoints} changes every modulator using it.

```ts
const bank = SoundBankLoader.fromArrayBuffer(input);
const sfe = bank.writeSFe();
```

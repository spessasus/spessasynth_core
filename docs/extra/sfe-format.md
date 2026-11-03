---
title: SFE Format
---

# The SFE Format

This page describes the SFE (SF-Enhanced 4) sound bank format exactly as `spessasynth_core` reads and writes it.
SFE is a superset of SoundFont 2.04. Everything not listed here works as in the
[SoundFont 2.04 specification](https://musescore.org/sites/musescore.org/files/2023-01/sfspec24.pdf).

> **Note**
>
> This page only lists the SFE extensions. SF2 extensions that `spessasynth_core` supports in SF2 files as well,
> such as SF3 compressed samples.

`spessasynth_core` implements a subset of the "release draft" of mine
([What SFe 4.0 should have been](https://github.com/spessasus/soundfont-proposals/blob/main/sfe4.md)).

> **Warning**
>
> At the time of writing, `spessasynth_core` is the only software that can read SFE files.
> Use SF2 or SF3 when other synthesizers need to load the bank.

Terms like BYTE, WORD, SHORT, DWORD, FourCC and chunk mean the same as in the SF2 specification.
All values are little-endian.

## Reading and writing

- {@link SoundBankLoader.fromArrayBuffer} loads SFE files like any other bank. The loaded bank's
  {@link BasicSoundBank.type} is `"sfe"`.
- {@link BasicSoundBank.writeSFE} writes one, with {@link SFEWriteOptions}.
- Any bank can be written as SFE, no matter which format it was loaded from.

```ts
const bank = SoundBankLoader.fromArrayBuffer(input);
const sfe = bank.writeSFE({ rf64: true });
```

## Table summary

| Feature                                        | SF2 / SF3 output    | SFE output                    |
| ---------------------------------------------- | ------------------- | ----------------------------- |
| Main chunk type                                | `sfbk`              | `sfen`                        |
| 64-bit chunk sizes (`RIFS`)                    | never               | on by default (`rf64` option) |
| Bank LSB and drum flag in `wBank`              | no, SF2 conventions | yes                           |
| Generators and modulator destinations above 60 | dropped             | kept                          |

`DMOD` (default modulators) and `xdta` (extended limits) are SF2 extensions, so they are not described here.
The SFE writer always enables both.

## File structure

```
RIFS (or RIFF)
    "sfen"
    LIST INFO
        ifil, isng, INAM, irom, iver, ICRD, IENG, IPRD, ICOP, ICMT, ISFT
        DMOD            (optional, default modulators)
        LIST xdta       (optional, extended limits)
    LIST sdta
        smpl
    LIST pdta
        phdr, pbag, pmod, pgen, inst, ibag, imod, igen, shdr
```

The order and layout of all standard chunks are the same as in SF2.

### The main chunk

- The main chunk type is `sfen` instead of `sfbk`. This is the one deliberate break from SF2, so legacy SF2 readers
  refuse the file instead of playing it incorrectly.
- The reader also accepts `sfbk` and `sfpk` (SF2Pack) here, as SF2 banks.

### 64-bit chunk sizes (`RIFS`)

RIFF chunk sizes are 32-bit, which limits a file to 4 GB. When the top-level FourCC is `RIFS` instead of `RIFF`:

- **Every** chunk in the file (the main chunk, all `LIST` chunks and all sub-chunks) has a 12-byte header:
  the 4-byte FourCC and an 8-byte (QWORD) size.
- All other RIFF rules stay the same. The size does not include the header or the pad byte, and odd-sized chunks
  are followed by one pad byte. `LIST` chunks start their data with the 4-byte list type.

The writer uses `RIFS` when the `rf64` option is `true` (the default). With `rf64: false` it writes a regular
`RIFF` file with the `sfen` type. The reader detects the mode from the first FourCC, for any bank type.

## Preset headers: the bank LSB

In SFE, the `wBank` field of `phdr` holds three values:

| Bits | Value                            |
| ---- | -------------------------------- |
| 0-6  | bank MSB (CC 0)                  |
| 7    | the GM/GS drum flag ("bank 128") |
| 8-14 | bank LSB (CC 32)                 |
| 15   | unused, 0                        |

So an XG bank like MSB 0, LSB 66 is stored as it is, and a drum kit keeps its own MSB and LSB.
These map to {@link BasicPreset.bankMSB}, {@link BasicPreset.bankLSB} and {@link BasicPreset.isGMGSDrum}.

For comparison, the SF2 writer keeps the SF2 conventions: `wBank` is the bank MSB, 128 for a drum preset, or the
bank LSB when the MSB is 0. The reader decodes `wBank` with the SFE layout above for every bank, which gives the
same result for regular SF2 values below 128.

## Generators 61 to 88

The SF2 specification defines generators up to 60 (`endOper`). SFE adds generators above it, in two groups:

- SFE only.
- Follow value generator SF2 rules.
- 61 to 67 extend the LFOs. The GS/XG controller matrix uses them at runtime as well.
- 68 to 88 add voice features that SF2 cannot express, for example from XG voices.
- They are only stored in SFE banks. The SFE writer keeps them in `pgen` and `igen`, along with every
  modulator (in zones and in `DMOD`) whose destination is one of them.
- `ignoreNoteOff`, `vibLfoWaveform` and `modLfoWaveform` are only valid in instrument zones.

They are all listed in [Generator Types](generator-types.md) and in {@link GeneratorTypes}, with their limits in
{@link GeneratorLimits}.

### LFO generators 61 to 67

| ID  | Name                   | Min    | Max   | Default | Unit                                              |
| --- | ---------------------- | ------ | ----- | ------- | ------------------------------------------------- |
| 61  | `amplitude`            | -1000  | 1000  | 0       | linear amplitude change, 0.1 %                    |
| 62  | `vibLfoRate`           | -1000  | 1000  | 0       | vibrato LFO frequency change, 0.01 Hz             |
| 63  | `vibLfoAmplitudeDepth` | 0      | 1000  | 0       | vibrato LFO linear amplitude modulation, 0.1 %    |
| 64  | `vibLfoToFilterFc`     | -12000 | 12000 | 0       | cents, like `modLfoToFilterFc`                    |
| 65  | `vibLfoToVolume`       | -960   | 960   | 0       | centibels, like `modLfoToVolume`                  |
| 66  | `modLfoRate`           | -1000  | 1000  | 0       | modulation LFO frequency change, 0.01 Hz          |
| 67  | `modLfoAmplitudeDepth` | 0      | 1000  | 0       | modulation LFO linear amplitude modulation, 0.1 % |

With generators 63 to 65, the vibrato LFO can drive pitch, filter and volume, like the modulation LFO in SF2.
GS and XG System Exclusive messages (the controller matrix) are turned into modulators targeting these
generators, so a bank can use them in the same way.

### Voice generators 68 to 88

| ID  | Name                   | Min    | Max   | Default | Unit                                           |
| --- | ---------------------- | ------ | ----- | ------- | ---------------------------------------------- |
| 68  | `ignoreNoteOff`        | 0      | 1     | 0       | switch                                         |
| 69  | `delayVoice`           | -12000 | 5000  | -12000  | timecents, -12000 = no delay                   |
| 70  | `fadeVibLFO`           | -12000 | 5000  | -12000  | timecents, -12000 = no fade                    |
| 71  | `fadeModLFO`           | -12000 | 5000  | -12000  | timecents, -12000 = no fade                    |
| 72  | `vibLfoWaveform`       | 0      | 1     | 0       | 0 triangle, 1 rising sawtooth                  |
| 73  | `modLfoWaveform`       | 0      | 1     | 0       | 0 triangle, 1 rising sawtooth                  |
| 74  | `vibLfoStartPhase`     | 0      | 360   | 0       | degrees                                        |
| 75  | `modLfoStartPhase`     | 0      | 360   | 0       | degrees                                        |
| 76  | `maxFilterFc`          | 1500   | 13500 | 13500   | absolute cents, 13500 = no ceiling             |
| 77  | `decay2VolEnv`         | -12000 | 8000  | -12000  | timecents for 100 dB                           |
| 78  | `sustain2VolEnv`       | -1440  | 1440  | 0       | centibels relative to `sustainVolEnv`, 0 = off |
| 79  | `delayModEnv2`         | -12000 | 5000  | -12000  | timecents                                      |
| 80  | `attackModEnv2`        | -12000 | 8000  | -12000  | timecents                                      |
| 81  | `holdModEnv2`          | -12000 | 5000  | -12000  | timecents                                      |
| 82  | `decayModEnv2`         | -12000 | 8000  | -12000  | timecents                                      |
| 83  | `sustainModEnv2`       | 0      | 1000  | 0       | 0.1 % below the peak                           |
| 84  | `releaseModEnv2`       | -12000 | 8000  | -12000  | timecents                                      |
| 85  | `keyNumToModEnv2Hold`  | -1200  | 1200  | 0       | timecents per key                              |
| 86  | `keyNumToModEnv2Decay` | -1200  | 1200  | 0       | timecents per key                              |
| 87  | `modEnv2ToPitch`       | -12000 | 12000 | 0       | cents at the envelope's peak                   |
| 88  | `modEnv2ToFilterFc`    | -12000 | 12000 | 0       | cents at the envelope's peak                   |

#### Ignore note off (68)

A note off does not release the voice, and the sustain pedal does not hold it. The voice plays until its volume
envelope or its sample ends, even for very short notes. This is the XG drum "Rcv Note Off" switch.
A looped sample with an audible sustain plays until the channel's notes are stopped.
All Notes Off, All Sound Off and stopping all voices still release it.

#### Delay voice (69)

The whole voice starts this long after the note on: the sample, both envelopes, both LFOs and portamento.
It is silent before that. The start is rounded up to the next rendering quantum, so it can be up to 128 samples
late. A note off before the voice starts does not cancel it. It starts, plays the minimum note length, then
releases.

#### LFO fade (70, 71)

After the LFO delay (`delayVibLFO` or `delayModLFO`) ends, the LFO's output ramps linearly from 0 to full over
this time. It scales all of that LFO's depths.

#### LFO waveform and start phase (72 to 75)

- Waveform 0 is the SF2 triangle. Waveform 1 is a rising sawtooth. Both cross zero going up at the default start
  phase, so the sawtooth starts like the triangle and drops from +1 to -1 once per cycle.
- The start phase is added to where the LFO starts, in degrees of a cycle. 0 is the SF2 start (zero, rising),
  90 starts at the peak and 180 at zero, falling.

#### Maximum filter cutoff (76)

This sets a ceiling for the final cutoff: `initialFilterFc` plus its modulators, both LFOs and both modulation envelopes.
It is applied before the filter is computed, so velocity or an envelope cannot open the filter past it.
The default 13500 means no ceiling.

#### Second volume decay (77, 78)

After the decay reaches `sustainVolEnv`, the volume envelope continues to `sustainVolEnv + sustain2VolEnv`
(clamped to 0 to 960 centibels) as a straight line in centibels.

- `decay2VolEnv` follows the SF2 decay convention: it is the time for a full 100 dB, and shorter distances take
  proportionally less. `keyNumToVolEnvDecay` scales it like the first decay.
- A negative `sustain2VolEnv` makes the level rise back up.
- A release during this segment starts from the current level.
- With `sustain2VolEnv` at 0 there is no second segment.

#### Second modulation envelope (79 to 88)

This is a second envelope that works exactly like the SF2 modulation envelope (convex attack, linear decay and
release, key scaling around key 60), but it is fully independent. Generators 87 and 88 add it to the pitch and the filter
cutoff, like `modEnvToPitch` and `modEnvToFilterFc`. This allows, for example, separate pitch and filter
envelopes. With generators 87 and 88 at 0, the envelope is not computed.

Like the first modulation envelope, it is not a modulator source. It only reaches the pitch and the cutoff,
through generators 87 and 88. This keeps it exactly as the standard modulation envelope, so a synthesizer can reuse
its existing envelope code for it.

# XG DSP Effect Notice

**These effects are written by an LLM.** I do not have the skill or time to reverse them myself.
I have a rough idea of how they work, but they are very complex.
Only the DSP is written with LLM, blocks and the XG effect architecture is designed by me.

Proceed at your own discretion.

## LLM Description

Below is a description of how the implementation works, how it was made and what its limits are.
This is written by the LLM, not spessasus.

### What it is

Each processor here is a port of an effect routine of the S-YXG50 software synthesizer (`syxg50.dll`).
The ports were made by reverse engineering the DLL: reading the decompiled routines and their parameter converters,
then checking the TypeScript against the DLL itself, run under Wine with a small VST host that injects test signals
and dumps the internal DSP state. The reverse engineering workspace is not part of the repository.

The goal is to sound like the S-YXG50, not like a generic effect. Most programs match the DLL output to about 1e-6
relative error (float32 rounding). The distortion family is about 1e-5 because of its clipping stages.
Only the S-YXG50 effect set is implemented. Types it does not have stay THRU.

### How the DLL works, and how the code mirrors it

The DLL does not run a handwritten routine per effect. It runs a small number of generic DSP programs.
Each program reads two word RAMs: coefficient words (gains, filter coefficients, LFO rates)
and address words (delay tap positions). Switching the effect type loads a preset into these RAMs,
and the parameter converters rewrite some of the words when a parameter changes.

The code keeps this model on purpose, so its state can be compared with the DLL slot by slot:

- `coefficientWords` and `addressWords` are the word RAMs. A converter writes words, then pushes a list of them.
  Only pushed words reach the DSP (`coefficients` and `taps`), exactly like the original.
  This is why the code is full of hexadecimal slot numbers. They are the DLL's own coefficient and address indices.
- Each type is a tiny class holding only its preset (the words and the 16 default parameters).
  The algorithm lives in a shared base class per family (reverb, chorus, delay, tremolo and so on).
- Some float operations are written with `Math.fround` and `chop32` to reproduce the original's x87 float32
  arithmetic with truncating rounding. This matters for slow accumulators such as the LFO smoothing filters.
  Changing the order of these operations changes the output.

### Class layout

- `effect_processor.ts`: the `DefaultXGEffectProcessor` interface that the effect blocks use.
- `xg_dsp_program.ts`: `XGDSPProgram`, the base of every port. It holds the word RAMs and their push rules,
  the coefficient formats, the filter designer, preset loading (`reset`), the input fade-in after a type change,
  connection changes (system or insertion), parameter clamping and the shared helpers and constants.
- `reverb/` and `chorus/`: the reverb and chorus block programs. The variation and insertion blocks reuse them,
  with the `variation` constructor flag selecting the variation converters.
- `xg_variation_program.ts`: `XGVariationProgram`, the base of the variation-only programs.
  The DLL sorts these into four categories that differ in their coefficient formats and rules,
  so each category has its own base:
    - Category 0, `xg_stereo_variation_program.ts`: delays, tremolo, auto pan, symphonic, rotary speaker, 2-band EQ.
      A stereo input EQ runs first, and the LFO integers are derived from the coefficients.
    - Category 1, `phaser/xg_phaser.ts`: the phasers.
    - Category 2, `xg_mono_variation_program.ts`: 3-band EQ, distortion family, early reflections.
      They work on a mono sum of the input.
    - Category 3, `xg_filter_variation_program.ts`: auto wah and karaoke.
- `xg_dsp_tables.ts` and the `*_tables.ts` files: tables read out of the DLL by generator scripts. Do not edit them by hand.

### Runtime behavior

- Each effect block owns one delay memory that all of its processors share, as only one processor runs at a time.
  Its size is the largest `memorySize` of the block's processors, scaled to the sample rate.
  Nothing is allocated while audio is rendered.
- The programs are designed for 44.1 kHz. Delay taps and rate-dependent coefficients are scaled to the actual rate.
- After a type change the input fades in over up to about one second, like the original.

### Effect families

Many XG types run the same routine with different presets. Below is one section per distinct routine.
The type files of a family only differ in their preset words and default parameters.

#### Reverb

Files: `reverb/xg_reverb.ts`. Types: every reverb block type (HALL, ROOM, STAGE, PLATE, WHITE ROOM, TUNNEL, BASEMENT
and their variants), also used by the variation and insertion blocks.

The input is mono (the sum of both sides). It goes through a high pass and a low pass filter,
then into an input node with its own feedback, then through two diffusion allpasses.
The diffused signal feeds four delay lines, each with a one-pole damping filter in its feedback path.
Each side of the output sums taps of all four lines plus one early reflection tap, then runs through one more allpass
so the two sides are decorrelated.

- Reverb time selects the damping of each line from a table, with a fixed per-line offset for each type.
- Diffusion moves the allpass taps, density enables more of the density allpasses.
- Initial delay places the early reflection tap, reverb delay places the start of the reverb lines after it.
- ER/Rev balance sets the early reflection and reverb levels.
- In the variation block, Dry/Wet mixes in the dry input. The reverb block itself is always fully wet.

WHITE ROOM, TUNNEL and BASEMENT (`XGRoomReverb`) are shaped rooms: the width, height and depth parameters
(and wall vary) set the length and damping of the delay lines instead of the fixed type tables.

#### Chorus, Celeste and Flanger

Files: `chorus/xg_chorus.ts`. Types: CHORUS 1-4, GM CHORUS 1-4, FB CHORUS, CELESTE 1-4, FLANGER 1-3, GM FLANGER,
also used by the variation and insertion blocks.

Each side runs a two-band input EQ (a low shelf and a high shelf).
The EQ'd signal is written into a delay line, which is read back by a tap whose position is modulated
by a triangle LFO (updated every 4 samples, linearly interpolated between samples). The tap feeds back into the line.

- In the mono input mode both sides feed one line, and the right tap reads it at another LFO phase.
  In the stereo mode each side has its own line.
- Celeste adds a third modulated tap per side, at a third LFO phase, for a thicker sound.
- Flanger uses shorter delays and stronger feedback. Its LFO phase difference is a parameter
  and its input mode is fixed by the type.

#### Delays

Files: `delay/xg_delay.ts`. Types: DELAY L,C,R, DELAY L,R, ECHO, CROSS DELAY.

One routine with two delay lines. Each line has a feedback tap with a one-pole low pass (high damp)
and output taps. A coefficient matrix decides which inputs and feedback taps enter which line
and which taps reach which output. Each type only sets this routing:

- DELAY L,C,R: left, right and center taps, plus a separate feedback tap.
- DELAY L,R: left and right taps, and two feedback taps at half level each.
- ECHO: two independent lines, each with its own feedback and a second tap.
- CROSS DELAY: the two lines feed back into each other, the input select picks the left, right or both inputs.

#### Tremolo and Auto Pan

Files: `tremolo/xg_tremolo.ts`. Types: TREMOLO, AUTO PAN.

A triangle LFO is offset, clipped and smoothed by a one-pole filter whose speed follows the LFO rate.
This shapes the waveform between a triangle and a softened square.
The shaped LFO drives an amplitude modulation and also moves a delay tap, which adds a slight pitch modulation.
Each side has its own LFO phase.

- TREMOLO: both sides follow the LFO phase difference parameter, the pitch depth is a separate parameter.
- AUTO PAN: the direction parameter sets the phases of the two sides (left and right, left to right,
  right to left, turning). The L/R direction inverts the depth, which gives a hard switch between the sides.
  The front and back pitch modulation is only used by the turning directions.

#### Symphonic

Files: `symphonic/symphonic.ts`. Types: SYMPHONIC.

A mono delay line is read by three taps. Each tap is moved by the sum of two modulations:
a smoothed slow triangle and a fast triangle from a second LFO phase.
One tap goes to the left output, one to the right and the third to both, which spreads the sound wide.

#### Rotary Speaker

Files: `rotary/rotary_speaker.ts`. Types: ROTARY SPEAKER.

Like the symphonic, a mono delay line is read by modulated taps, here four of them.
Three taps follow the first LFO phase and are modulated in both amplitude and position (pitch).
The fourth follows the second LFO phase (with a faster smoothing stage) and is only moved in position,
it reaches both outputs. Together they imitate the moving source of a rotating speaker.

#### Phaser

Files: `phaser/xg_phaser.ts`. Types: PHASER 1, PHASER 2.

Each side runs a low shelf and a high shelf input EQ, then a chain of five first-order allpass filters.
An exponential LFO sweeps the allpass coefficients every sample, the second chain at a phase offset.
Selected stages of both chains are mixed into the outputs and fed back into the chain inputs.

- PHASER 1: a mono input phaser. The stage parameter (6 to 10) picks which stage outputs are combined.
- PHASER 2: a stereo phaser with 3 to 5 stages per side and an adjustable LFO phase difference.

#### Auto Wah

Files: `auto_wah/auto_wah.ts`. Types: AUTO WAH.

Each side runs a low shelf and a high shelf input EQ, then a resonant state variable filter.
An exponential LFO (updated every 4 samples) sweeps the filter frequency around the cutoff parameter,
the depth parameter sets how far. The resonance parameter sets the filter feedback.
The band pass output of the filter is the wet signal.

#### 2-Band EQ

Files: `equalizer/two_band_eq.ts`. Types: 2BAND EQ.

The original routine is only the shared category 0 input EQ: a stereo low shelf and high shelf.
The output is the EQ'd input.

#### 3-Band EQ

Files: `equalizer/three_band_eq.ts`. Types: 3BAND EQ.

Like the original, this EQ works on a mono sum of the input.
The low and high shelves are each split into two cascaded sections of half the gain,
and a peaking filter in between handles the mid-band.

#### Distortion, Overdrive and Amp Simulator

Files: `distortion/xg_distortion.ts`. Types: DISTORTION, OVER DRIVE, AMP SIMULATOR.

A mono sum of the input is band limited by a high pass and a low pass. The drive gain feeds a chain of six
gain-and-clip stages, and the weighted sum of all stages is the distorted signal.
The edge parameter sets the gain of the later stages, which changes the shape of the clipping curve.
The input level is normalized to the stage response and the output level compensates for the drive.
A low pass, a mid peaking EQ and a low shelf follow.

- OVER DRIVE: the same routine with softer defaults and a narrower input band.
- AMP SIMULATOR: the amp type parameter picks the input filters, the cabinet shelf and the cabinet mid-filter.

#### Early Reflections, Gate Reverb and Reverse Gate

Files: `early_reflections/xg_early_reflections.ts`. Types: EARLY REF 1, EARLY REF 2, GATE REVERB, REVERSE GATE.

A mono sum of the input passes two diffusion allpasses and a damped feedback loop, then feeds a reflection line.
Fourteen reflection taps read it, at positions from a pattern table scaled by the room size and shifted
by the initial delay. The liveness parameter tilts the reflection gains over time.
The taps are summed in two groups of seven, which become the left and right outputs after an allpass each.

The type parameter (and the effect type) selects the pattern: spread reflections for the early reflections,
a dense burst that stops abruptly for the gate reverb, and rising reflections for the reverse gate.

#### Karaoke

Files: `karaoke/xg_karaoke.ts`. Types: KARAOKE 1-3.

A filtered mono echo for vocals. The mono input runs through a high pass and a low pass,
two diffusion allpasses and a delay line with damped feedback.
Two output allpasses decorrelate the left and right echoes. The three types differ in their presets and density.

#### No Effect and Thru

Files: `no_effect.ts`, `thru.ts`. NO EFFECT outputs silence. THRU passes the input through unchanged
in the insertion mode and outputs silence as a system effect. THRU also stands in for every type
that the S-YXG50 does not have.

### Known limits

- The S-YXG50 at 48 kHz renders about 0.4 dB quieter than at 44.1 kHz (a stale constant in the DLL). This is not ported.
- How strongly a panned voice reaches the mono reverb input is an assumption. It has not been calibrated
  end to end against S-YXG50 renders yet.
- The workspace notes record some reverb block types deviating more than the rest when compared with the DLL
  (Basement the most). This was noticed before the latest refactor and is still open.
- The input fade-in after a type change advances once per `process` call, so for its first second
  the output depends slightly on the size of the rendered chunks.

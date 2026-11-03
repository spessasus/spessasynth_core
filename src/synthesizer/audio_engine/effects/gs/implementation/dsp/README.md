# GS DSP Effect Notice

_Yes, copied from XG DSP._

**These effects are written by an LLM.** I do not have the skill or time to reverse them myself.
I have a rough idea of how they work, but they are very complex.
Only the DSP is written with LLM, blocks and the GS effect architecture is designed by me.

Proceed at your own discretion.

## LLM Description

Below is a description of how the implementation works, how it was made and what its limits are.
This is written by the LLM, not spessasus.

### What it is

Each type here is a native implementation of one SC-88Pro insertion effect (EFX): the 64 types and THRU.
It is modeled on the effect programs of Sound Canvas VA (`SCCore.dll`), which runs the same effect set at 32 kHz.

It was made in two passes. First the DLL's programs were ported register by register into a 32 kHz port and checked
against the DLL itself. Then every program was taken apart into the boxes of the manual's diagrams (shelves,
peaking bands, delay lines, LFOs, drives, compressors, allpasses) with each parameter turned into a physical law,
and rewritten from those blocks to run at any sample rate. The register port is not in the repository any more,
it only served as the reference.

Where SC-VA differs from the hardware, the SC-88Pro decides. Those quirks were checked on an emulated SC-88Pro
(and SC-8850) and fixed when the hardware does not have them, for example SC-VA's float seeds that make reads and
filters start slightly off, rotors that start from rest after a type select, or the Auto Wah's ceiling.

The goal is to sound like the hardware, not to be bit exact. Every type passes a set of comparison gates against the
port with those fixes applied (2660 gates at 32, 44.1 and 48 kHz): band levels, frequency responses, delay taps,
pitch, modulation rates and depths, decay times and harmonics. The usual tolerance is about 0.5 dB.
At 32 kHz most linear blocks reproduce the hardware's filters exactly. The reverse engineering workspace is not part
of the repository.

### Structure

The code follows the manuals: a type is a small wiring of blocks, the blocks hold the DSP.

- `gs_effect.ts`: `GSEffect`, the base of every type. It holds the 20 parameters, the type's defaults, the limits
  and minimums (a value outside them is ignored, like on the hardware), the EFX control offsets (`controlled`,
  `controlOffset`) and `reset`. Each type implements `update` (parameters to block settings), `process` and `clear`.
- `glue.ts`: the laws every type shares. The output stage gain (`(127/128)^3`), the level and pan tables, the balance
  law, the stage limits of the saturating programs.
- `conversion.ts`: the GS conversion table of the manual (the parameter columns in Hz and ms), with closed form laws
  for the columns and the parameters the manual does not list (LFO rate words, feedback, depths, reverb time).
- `blocks/`: the blocks, each one rate independent. Filters (`first_order_filter.ts`, `biquad.ts`, `shelf_eq.ts`,
  `peaking_band.ts`, `state_variable_filter.ts`), delay lines and their reads (`delay_line.ts`, `delay_memory.ts`,
  `delay.ts`, `modulated_delay.ts`), modulation (`lfo.ts`, `tremolo.ts`, `ring_modulator.ts`, `phaser.ts`,
  `rotary.ts`, `wah.ts`), drive and dynamics (`drive.ts`, `amp_simulator.ts`, `bass_amp_simulator.ts`,
  `oversampler.ts`, `dynamics.ts`, `enhancer.ts`), space (`reverb.ts`, `gate_reverb.ts`), 3D (`positioner_3d.ts`,
  `hrtf_pair.ts`, `output_mode_3d.ts`, `crosstalk_3d.ts`), Lo-Fi (`lofi_quantizer.ts`, `noise_generator.ts`), the
  pitch shifter and the shared stage pieces (`mono_mix.ts`, `mono_pan.ts`, `output_lag.ts`, `stereo_output.ts`,
  `crossfade.ts`).
- `effects/`: one file per type or per family, with a base class where types share a layout.
- `effect_list.ts`: every type. `insertion_processor.ts`: the interface the insertion
  block uses. `enums.ts`: the stage and wave identifiers.
- `peaking_table.ts`: generated from the port's peaking band coefficients (center, lower band edge, gain). Do not
  edit it by hand.

### Running at the host rate

- The hardware runs everything at 32 kHz. The blocks are designed natively at the host rate instead: analog
  prototypes through the bilinear transform with prewarping, exact at 32 kHz. Above 32 kHz the 32 kHz response
  bends toward its Nyquist where no native filter of the same order follows it, so the top octave can differ
  slightly. Laws that the hardware applies per sample (envelopes, ramps, smoothers) were measured at 32 kHz and are
  mapped to the host rate by time.
- Delay times, taps and LFO swings stay in 32 kHz samples or ms and are read at the host rate. Moving reads go
  through a band-limited sinc read (`readSinc`) or the hardware's linear read between 32 kHz samples (`readGrid`),
  short delays inside loops through a Lagrange read.
- The shared stage of the hardware reads the left input one 32 kHz sample late and writes the right output one
  sample late. The types keep that timing (the mono mix of the mono types is `(1 + z^-1) / 2` at 32 kHz on a
  centered source). Fixed lags of one 32 kHz sample go through a Thiran allpass (`OutputLag`), which is flat and
  adds no latency. Nothing in the effects adds latency.
- The drives run their clipper at twice the host rate below 32 kHz (`oversampler.ts`).
- A change of a delay time, pre delay or depth crossfades over 10 ms (`crossfade.ts`). The hardware jumps there.
- All types share one delay memory (`DelayMemory`), since only one runs at a time. Lines are handed out while the
  types are built, nothing is allocated while audio is rendered.
- Filter states are flushed to zero below `1e-30`, so silence does not leave them in the slow subnormal range.

### Effect families

- Equalizer, Spectrum (`equalizer.ts`, `spectrum.ts`): shelves and constant Q peaking bands. The bands keep their
  center and lower band edge in Hz, so they stay put at any rate.
- Enhancer (`enhancer.ts`): the input high passed twice, scaled by the sensitivity and mix, added back.
- Overdrive, Distortion (`drive_effect.ts`): a pre filter chain, the clipper, a post filter and an amp simulator.
  The amp's resonant filters are the hardware's 32 kHz filters turned into their analog prototype.
- Phaser, Auto Wah, Humanizer (`phaser.ts`, `auto_wah.ts`, `humanizer.ts`): an all-pass chain with feedback, a
  swept state variable filter with an envelope follower, and a formant filter bank with vowel crossfades.
- Rotary (`rotary.ts`): a horn and a drum line with a crossover, Doppler reads, AM on two microphones and rotor
  ramps.
- Tremolo, Auto Pan (`tremolo_effect.ts`), Compressor, Limiter (`dynamics_effect.ts`).
- Choruses and flangers (`stereo_chorus_flanger.ts`, `step_flanger.ts`, `space_d.ts`, `hexa_chorus.ts`,
  `tremolo_chorus.ts`): modulated delay lines with tone filters and feedback.
- Delays (`stereo_delay.ts`, `modulation_delay.ts`, `tap_delay.ts`, `time_control_delay.ts`): tapped lines with
  the HF damp in the loop. Time Ctrl Delay slews its time toward the parameter.
- Pitch shifters (`pitch_shifter_effect.ts`): two crossfaded reads per voice moving through a window.
- Reverb, Gate Reverb (`reverb_effect.ts`): a diffuser and two independent tanks, and a diffuser into a tapped line
  with the gate patterns.
- Lo-Fi 1, Lo-Fi 2 (`lo_fi_1.ts`, `lo_fi_2.ts`): a compressor, quantizer and sample and hold, and a shaper with
  filters, the radio and the noise generators (white, disc clicks, hum).
- 3D (`three_d.ts`, `three_d_stage_effect.ts`): a positioner between 16 direction filter sets, the speaker
  crosstalk canceller, and the 3D Chorus and 3D Delay through fixed sets.
- Combinations, series (`drive_combination.ts`, `enhancer_combination.ts`, `modulation_series.ts`,
  `combination_stage.ts`): a first effect into a chorus, flanger or delay stage.
- Combinations, parallel (`parallel_effect.ts`, `parallel_stage.ts`, `modulation_parallel.ts`): effect 1 on the
  left input and effect 2 on the right input, each with its own pan and level.
- Multis (`guitar_multi.ts`, `guitar_multis.ts`, `clean_guitar_multi.ts`, `bass_multi.ts`, `rhodes_multi.ts`,
  `keyboard_multi.ts`, `rotary_multi.ts`): chains of sections (compressor, drive, amp, EQ, wah, modulation, delay).

### Known limits

- Only the SC-88Pro's behavior is targeted. Quirks only the SC-8850 has are not reproduced.
- PH / Rotary: at a very low high accel the hardware's horn collapses into a 15 Hz wobble. Not modeled, there is no
  clear rule for it.
- Keyboard Multi: the right mid band's 4x boost after a type select clears on the first mid band change here. The
  hardware seems to keep it.
- Lo-Fi 1: type 7 reads 0.35 dB louder on the hardware, not explained.
- Bass Multi: the gain step when switching the amp is only modeled without an EFX control offset.
- Below 32 kHz the drive oversampler adds about 15 samples of latency, and the mono mix's allpass is only first
  order (its phase is off near 8 kHz at 22.05 kHz). At 88.2 and 96 kHz the Enhancer keeps boosting above 16 kHz.
- Away from 32 kHz, Lo-Fi 2's white noise and its clicks are another realization of the same noise.

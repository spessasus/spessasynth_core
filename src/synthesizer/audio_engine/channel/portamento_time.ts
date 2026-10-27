// Tests were performed by John Novak
// https://github.com/dosbox-staging/dosbox-staging/pull/2705

/*
Original table by John Novak:
CC 5 value  Portamento time
----------  ---------------
     0          0.000 s
     1          0.006 s
     2          0.023 s
     4          0.050 s
     8          0.110 s
    16          0.250 s
    32          0.500 s
    64          2.060 s
    80          4.200 s
    96          8.400 s
   112         19.500 s
   116         26.700 s
   120         40.000 s
   124         80.000 s
   127        480.000 s

   This table used to be linearly interpolated, then replaced by a PCHIP function created by Benjamin Rosseaux,
   the developer behind the Sobanth SF2 synthesizer.
   More info in this comment:
   https://github.com/FluidSynth/fluidsynth/issues/1722#issuecomment-3706599241

   It has since been replaced by rates measured on the original Sound Canvas once more. The emulated SC-55 the measurements above within about 3%
   (except CC 5 = 127, which takes 320 s), and the SC-88Pro matches the SC-55 within 0.5%.
   The pitch moves linearly towards the target at a constant rate, so the time scales linearly with the distance.
*/

/**
 * The Sound Canvas portamento rate table, indexed by CC 5.
 * The rate is in 1/16 semitones per second.
 * Measured on the SC-88Pro from CC 5 = 16 up. Below that, the glides are too short to measure precisely,
 * so the values are the SC-VA steps scaled to the hardware (0.8 times, which holds from CC 5 = 5 to 100).
 *
 * Thanks to the Tabula Sonora project for SC-VA research.
 */
const PORTAMENTO_RATES = new Uint16Array([
    0, 44_640, 19_840, 12_753, 9920, 7761, 6376, 5578, 4823, 4250, 3880, 3498,
    3187, 2976, 2746, 2548, 2383, 2263, 2127, 2008, 1922, 1824, 1734, 1670,
    1596, 1528, 1476, 1418, 1364, 1323, 1276, 1232, 1191, 1123, 1063, 1003, 955,
    911, 867, 831, 793, 763, 735, 705, 681, 659, 635, 615, 595, 561, 529, 501,
    477, 455, 433, 414, 396, 380, 366, 352, 340, 328, 316, 306, 296, 280, 264,
    250, 238, 226, 216, 206, 198, 190, 182, 176, 170, 164, 158, 152, 148, 140,
    132, 124, 118, 112, 108, 102, 98, 94, 90, 88, 84, 82, 78, 76, 74, 70, 66,
    62, 58, 56, 54, 50, 48, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22,
    20, 18, 16, 14, 12, 10, 8, 6, 4, 2
]);

/**
 * Converts portamento time to seconds.
 * @param time MIDI portamento time (CC 5 value) (0-127)
 * @param distance Distance in semitones (keys) to slide over.
 * @returns The portamento time in seconds.
 */
export function portamentoTimeToSeconds(
    time: number,
    distance: number
): number {
    // This seems to work fine for the MIDIs I have.
    // PortaTimeToRate is the constant rate of the portamento, as that's how the synths work.
    if (time < 1) return 0;
    return (distance * 16) / PORTAMENTO_RATES[time];
}

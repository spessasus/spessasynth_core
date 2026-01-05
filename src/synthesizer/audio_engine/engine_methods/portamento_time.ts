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

   This table used to be linearly interpolated, but it has been replaced by a PCHIP function created by Benjamin Rosseaux,
   the developer behind the Sobanth SF2 synthesizer.
   More info in this comment:
   https://github.com/FluidSynth/fluidsynth/issues/1722#issuecomment-3706599241
*/

const PORTA_DIVISION_CONSTANT = 40;

/**
 * @param cc the CC#5 value (should not be decimal)
 * (PCHIP cubic spline - smooth & exact), optimized with fewer operations than full binear search and interpolation.
 * Created by Benjamin Rosseaux.
 */
function portaTimeToRate(cc: number): number {
    if (cc < 1) {
        // Original code has smoothing here but since CC#5 is an integer, it is not needed.
        return 0;
    } else {
        // PCHIP cubic spline in log-log space - smooth & exact
        // Segments: [1..2],[2..4],[4..8],[8..16],[16..32],[32..64],[64..80],[80..96],[96..112],[112..120],[120..124],[124..127]
        const x0 = [1, 2, 4, 8, 16, 32, 64, 80, 96, 112, 120, 124];
        const ih = [
            1,
            0.5,
            0.25,
            0.125,
            0.0625,
            0.03125,
            0.0625,
            0.0625,
            0.0625,
            0.125,
            0.25,
            1 / 3
        ];
        const a = [
            -0.16653127382501215, 0.11863875218299408, 0.029479047361245264,
            -0.005442312089231738, 0.1451520875973037, -0.005056281449558275,
            -0.005095486882876532, 0.03334009551111544, -0.09361368678020432,
            0.14132569702451822, -0.15805565301011382, -0.09918856955881927
        ];
        const b = [
            0.028212773333433472, -0.3388502064992847, -0.15839529890929713,
            -0.12398131766775483, -0.2874848552685111, 0.012254866302537692,
            0.005957797193345771, -0.03745899330347374, 0.12911781869810196,
            -0.15867193224162568, 0.504406322732748, 0.3786845131875458
        ];
        const c = [
            0.7218950861255283, 0.5574536226347168, 0.47133893237025826,
            0.48597095327079914, 0.44336276333518854, 0.6076986311801551,
            0.30851975971827794, 0.30514889345633955, 0.3302511933827384,
            0.153822885219165, 0.1302280559047337, 0.49865530675491687
        ];
        const d = [
            -2.2218487496163566, -1.6382721639824072, -1.3010299956639813,
            -0.958607314841775, -0.6020599913279624, -0.3010299956639812,
            0.31386722036915343, 0.6232492903979004, 0.9242792860618817,
            1.290034611362518, 1.4265112613645752, 1.9030899869919435
        ];
        // JavaScript has sadly no bitscan operations for bittwiddling-like optimizations, so we use a series of comparisons here.
        // Note: modified to please the TypeScript compiler.
        const thresholds = [2, 4, 8, 16, 32, 64, 80, 96, 112, 120, 124];
        const s = thresholds.findLastIndex((t) => t < cc) + 1;

        const t = (cc - x0[s]) * ih[s];
        return (
            Math.exp(
                2.302585092994046 * (((a[s] * t + b[s]) * t + c[s]) * t + d[s])
            ) / PORTA_DIVISION_CONSTANT
        );
    }
}

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
    // Note: Some tests about portamento were compared to SC-VA and S-YXG50
    // PortaTimeToRate is the constant rate of the portamento, as that's how the synths work
    // We multiply it by the distance
    return portaTimeToRate(time) * distance;
}

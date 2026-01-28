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
            0.031_25,
            0.0625,
            0.0625,
            0.0625,
            0.125,
            0.25,
            1 / 3
        ];
        const a = [
            -0.166_531_273_825_012_15, 0.118_638_752_182_994_08,
            0.029_479_047_361_245_264, -0.005_442_312_089_231_738,
            0.145_152_087_597_303_7, -0.005_056_281_449_558_275,
            -0.005_095_486_882_876_532, 0.033_340_095_511_115_44,
            -0.093_613_686_780_204_32, 0.141_325_697_024_518_22,
            -0.158_055_653_010_113_82, -0.099_188_569_558_819_27
        ];
        const b = [
            0.028_212_773_333_433_472, -0.338_850_206_499_284_7,
            -0.158_395_298_909_297_13, -0.123_981_317_667_754_83,
            -0.287_484_855_268_511_1, 0.012_254_866_302_537_692,
            0.005_957_797_193_345_771, -0.037_458_993_303_473_74,
            0.129_117_818_698_101_96, -0.158_671_932_241_625_68,
            0.504_406_322_732_748, 0.378_684_513_187_545_8
        ];
        const c = [
            0.721_895_086_125_528_3, 0.557_453_622_634_716_8,
            0.471_338_932_370_258_26, 0.485_970_953_270_799_14,
            0.443_362_763_335_188_54, 0.607_698_631_180_155_1,
            0.308_519_759_718_277_94, 0.305_148_893_456_339_55,
            0.330_251_193_382_738_4, 0.153_822_885_219_165,
            0.130_228_055_904_733_7, 0.498_655_306_754_916_87
        ];
        const d = [
            -2.221_848_749_616_356_6, -1.638_272_163_982_407_2,
            -1.301_029_995_663_981_3, -0.958_607_314_841_775,
            -0.602_059_991_327_962_4, -0.301_029_995_663_981_2,
            0.313_867_220_369_153_43, 0.623_249_290_397_900_4,
            0.924_279_286_061_881_7, 1.290_034_611_362_518,
            1.426_511_261_364_575_2, 1.903_089_986_991_943_5
        ];
        // JavaScript has sadly no bitscan operations for bittwiddling-like optimizations, so we use a series of comparisons here.
        // Note: modified to please the TypeScript compiler.
        const thresholds = [2, 4, 8, 16, 32, 64, 80, 96, 112, 120, 124];
        const s = thresholds.findLastIndex((t) => t < cc) + 1;

        const t = (cc - x0[s]) * ih[s];
        return (
            Math.exp(
                2.302_585_092_994_046 *
                    (((a[s] * t + b[s]) * t + c[s]) * t + d[s])
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

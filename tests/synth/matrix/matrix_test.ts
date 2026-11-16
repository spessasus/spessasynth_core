// GS and XG controller matrix: the manual ranges, scaled linearly
import { GeneratorTypes, type MIDIController } from "../../../src";
import {
    check,
    finish,
    frequency,
    levelDb,
    makeBank,
    note,
    type RenderEvent,
    renderLeft,
    sineSample
} from "../sfe/sfe_test_utils";

const sine = makeBank(sineSample());

/**
 * GS part parameter 40 1x yy for channel 0 (part 1).
 */
const gs = (a3: number, value: number): RenderEvent => ({
    time: 0,
    run: (s) =>
        s.systemExclusive([
            0x41,
            0x10,
            0x42,
            0x12,
            0x40,
            0x21,
            a3,
            value,
            0,
            0xf7
        ])
});
/**
 * XG multi part parameter 08 00 pp for channel 0.
 */
const xg = (a3: number, value: number): RenderEvent => ({
    time: 0,
    run: (s) =>
        s.systemExclusive([0x43, 0x10, 0x4c, 0x08, 0x00, a3, value, 0xf7])
});
const cc = (controller: number, value: number): RenderEvent => ({
    time: 0,
    run: (s) => s.controllerChange(0, controller as MIDIController, value)
});
const pressure = (value: number): RenderEvent => ({
    time: 0,
    run: (s) => s.channelPressure(0, value)
});

const play = (events: RenderEvent[], bank = sine) =>
    renderLeft(bank, [...events, ...note(0.01)], 0.4);
const level = async (events: RenderEvent[], bank = sine) =>
    levelDb(await play(events, bank), 0.15, 0.4);
const pitch = async (events: RenderEvent[]) =>
    frequency(await play(events), 0.15, 0.4);

const refLevel = await level([]);
const refPitch = await pitch([]);
const semitones = (f: number) => 12 * Math.log2(f / refPitch);

const near = (
    value: number,
    expected: number,
    tolerance: number,
    what: string
) => {
    console.info(`  ${what}: ${value.toFixed(2)} (expected ${expected})`);
    check(Math.abs(value - expected) <= tolerance, what);
};

// Each cell is scaled linearly onto its manual range and multiplied by its source (0 to 1)
console.info("GS:");
// MOD amplitude (40 2x 02): +-100 % on the amplitude
near(
    (await level([gs(0x02, 127), cc(1, 127)])) - refLevel,
    // (63 / 64) * 100 % gives 1.98 times the level
    5.95,
    0.1,
    "MOD amplitude d 127 at 127 [dB]"
);
near(
    (await level([gs(0x02, 127), cc(1, 64)])) - refLevel,
    3.48,
    0.1,
    "MOD amplitude d 127 at 64 [dB]"
);
near(
    (await level([gs(0x02, 0), cc(1, 64)])) - refLevel,
    -6.09,
    0.1,
    "MOD amplitude d 0 at 64 [dB]"
);
check(
    (await level([gs(0x02, 0), cc(1, 127)])) < refLevel - 60,
    "MOD amplitude d 0 at 127 mutes"
);
// CC2 pitch (40 2x 50): one semitone per step, from -24 to +24
near(
    semitones(await pitch([gs(0x50, 88), cc(17, 127)])),
    24,
    0.05,
    "CC2 pitch d 88 [semitones]"
);
near(
    semitones(await pitch([gs(0x50, 40), cc(17, 64)])),
    -12.09,
    0.05,
    "CC2 pitch d 40 at 64 [semitones]"
);
// The sources add, with no clamp
near(
    semitones(
        await pitch([gs(0x50, 40), gs(0x20, 52), cc(17, 127), pressure(127)])
    ),
    -36,
    0.05,
    "CC2 -24 plus CAf -12 [semitones]"
);
// BEND pitch below the center gives no bend at all (measured on the SC-88Pro)
near(
    semitones(
        await pitch([
            gs(0x10, 0x30),
            { time: 0, run: (s) => s.pitchWheel(0, 16_383) }
        ])
    ),
    0,
    0.05,
    "BEND pitch 0x30, wheel up [semitones]"
);
// A bend range message of the other system must not clear the matrix
near(
    semitones(await pitch([xg(0x5a, 0x58), gs(0x10, 0x42), cc(16, 127)])),
    24,
    0.05,
    "XG AC1 pitch +24 survives a GS BEND pitch control [semitones]"
);
// An RPN pitch bend range works again after a BEND pitch control below the center
near(
    semitones(
        await pitch([
            gs(0x10, 0x34),
            cc(101, 0),
            cc(100, 0),
            cc(6, 2),
            { time: 0, run: (s) => s.pitchWheel(0, 16_383) }
        ])
    ),
    2,
    0.05,
    "BEND pitch 0x34 then RPN range 2, wheel up [semitones]"
);
// A GS reset turns the matrix off
near(
    (await level([
        gs(0x02, 127),
        cc(1, 127),
        {
            time: 0,
            run: (s) =>
                s.systemExclusive([
                    0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7
                ])
        }
    ])) - refLevel,
    0,
    0.1,
    "matrix after a GS reset [dB]"
);

// The controller depth plays from note on, even while the patch's own LFO is still in its delay and fade
{
    const delayed = makeBank(sineSample(), {
        [GeneratorTypes.delayVibLFO]: 1200,
        [GeneratorTypes.fadeVibLFO]: 1200
    });
    const left = await play([gs(0x56, 0x40), cc(17, 127)], delayed);
    const windows = new Array<number>();
    for (let t = 0.05; t < 0.4; t += 0.0025)
        windows.push(levelDb(left, t, t + 0.0025) - refLevel);
    near(
        Math.max(...windows),
        3.55,
        0.3,
        "CC2 LFO1 TVA peak during the delay [dB]"
    );
    near(
        Math.min(...windows),
        -6.09,
        0.6,
        "CC2 LFO1 TVA trough during the delay [dB]"
    );
}

// CC2 LFO1 TVA depth (40 2x 56): 0 to 100 % linear, added to the zone's own depth
{
    const left = await play([gs(0x56, 0x40), cc(17, 127)]);
    const windows = new Array<number>();
    for (let t = 0.05; t < 0.4; t += 0.0025)
        windows.push(levelDb(left, t, t + 0.0025) - refLevel);
    // 64 / 127 = 50 %: from 0.5 to 1.5 times the level
    near(Math.max(...windows), 3.55, 0.3, "CC2 LFO1 TVA peak [dB]");
    near(Math.min(...windows), -6.09, 0.6, "CC2 LFO1 TVA trough [dB]");
}

console.info("XG:");
// AC1 (CC16) pitch control
near(
    semitones(await pitch([xg(0x5a, 0x58), cc(16, 127)])),
    24,
    0.05,
    "AC1 pitch vv 0x58 [semitones]"
);
near(
    semitones(await pitch([xg(0x5a, 0x34), cc(16, 127)])),
    -12,
    0.05,
    "AC1 pitch vv 0x34 [semitones]"
);
// Amplitude in decibels: -100 % is -96 dB, +100 % is +6 dB
near(
    (await level([xg(0x5c, 127), cc(16, 127)])) - refLevel,
    // 63 / 64 of +6 dB
    5.91,
    0.15,
    "AC1 amplitude vv 127 [dB]"
);
near(
    (await level([xg(0x5c, 32), cc(16, 127)])) - refLevel,
    -48,
    0.15,
    "AC1 amplitude vv 32 [dB]"
);
check(
    (await level([xg(0x5c, 0), cc(16, 127)])) < refLevel - 60,
    "AC1 amplitude vv 0 mutes"
);

// CC 76 (vibrato rate) moves the LFO1 rate by up to 10 Hz either way while the matrix is on
{
    const tremoloRate = async (events: RenderEvent[]) => {
        const left = await renderLeft(
            sine,
            [gs(0x56, 0x40), cc(17, 127), ...events, ...note(0.01)],
            1.3
        );
        const windows = new Array<number>();
        for (let t = 0.2; t < 1.2; t += 0.0025)
            windows.push(levelDb(left, t, t + 0.0025) - refLevel);
        // Rising crossings of the level through 0 dB in one second
        let crossings = 0;
        for (let i = 1; i < windows.length; i++)
            if (windows[i - 1] <= 0 && windows[i] > 0) crossings++;
        return crossings;
    };
    near(await tremoloRate([]), 8, 1, "LFO1 rate at CC 76 = 64 [Hz]");
    near(
        await tremoloRate([cc(76, 127)]),
        18,
        1,
        "LFO1 rate at CC 76 = 127 [Hz]"
    );
    near(
        await tremoloRate([cc(76, 96)]),
        13,
        1,
        "LFO1 rate at CC 76 = 96 [Hz]"
    );
}

// A per-note pitch wheel drives the matrix for its own key only
{
    const perNote = (key: number): RenderEvent => ({
        time: 0,
        run: (s) => s.pitchWheel(0, 16_383, key)
    });
    near(
        (await level([gs(0x12, 127), perNote(69)])) - refLevel,
        5.95,
        0.1,
        "BEND amplitude with a per-note wheel on the played key [dB]"
    );
    near(
        (await level([gs(0x12, 127), perNote(60)])) - refLevel,
        0,
        0.1,
        "BEND amplitude with a per-note wheel on another key [dB]"
    );
    // Back to the channel wheel
    near(
        (await level([
            gs(0x12, 127),
            perNote(60),
            { time: 0, run: (s) => s.pitchWheel(0, 16_383) }
        ])) - refLevel,
        5.95,
        0.1,
        "BEND amplitude after the channel wheel takes over again [dB]"
    );
}

finish("matrix_test");

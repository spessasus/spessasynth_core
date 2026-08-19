import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("GS Delay Feedback Test");

// Delay1
test.gs(0x40, 0x01, 0x50, [0])
    .gs(
        // Delay time center
        0x40,
        0x01,
        0x52,
        [0x49]
    )
    // SC-55 MAP sine wave
    .init(8, 1, 80, { variationDepth: 127 });

let feedback = 1;
while (feedback <= 126) {
    test.text(`Feedback = ${feedback}`)
        .gs(
            // Feedback
            0x40,
            0x01,
            0x59,
            [Math.min(127, feedback)]
        )
        .wait(80)
        .noteOn(60, 120)
        .wait(10)
        .noteOff(60)
        .wait(1960);
    feedback += 1;
}

await test.make();

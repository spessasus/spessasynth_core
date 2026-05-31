import { MIDITestMaker } from "../midi_test_maker";

const test = new MIDITestMaker("RPN Fine Tuning Test");

// SC-55 Sine
test.programChange(8, 0, 80);

test.text("Fine Tuning");
let pitch = 0;
while (pitch < 16_383) {
    test.rpn(1, pitch).note(60, 120, 120).wait(120);
    pitch = Math.min(16_383, pitch + 250);
}

test.flush();

test.modify({
    channels: new Map([
        [
            0,
            {
                // Test handling relative tuning editing
                fineTune: -56
            }
        ]
    ])
});

await test.make();

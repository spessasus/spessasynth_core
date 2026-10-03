import { SpessaSynthProcessor } from "../../src";

const synth = new SpessaSynthProcessor(48_000);

for (let i = 0; i < 16; i++) {
    synth.createMIDIChannel();
}

for (const channel of synth.midiChannels) {
    console.info(
        `Channel ${channel.channel} drum flag:`,
        channel.drumChannel,
        "Drum map:",
        channel.midiParameters.drumMap,
        channel.preset?.name
    );
}

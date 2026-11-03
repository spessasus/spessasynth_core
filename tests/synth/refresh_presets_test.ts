import {
    BasicPreset,
    BasicSoundBank,
    SoundBankLoader,
    SpessaLog,
    SpessaSynthProcessor
} from "../../src";

// Checks the startup without a sound bank (no missing preset warnings)
// Then SpessaSynthProcessor.refreshPresets after editing an added bank

let failed = false;
const check = (what: string, ok: boolean) => {
    console.info(`${ok ? "PASS" : "FAIL"}: ${what}`);
    if (!ok) failed = true;
};

const warnings = new Array<string>();
const originalWarn = SpessaLog.logFunctions.warn;
SpessaLog.logFunctions.warn = (...message: unknown[]) => {
    warnings.push(message.map(String).join(" "));
};

const rate = 44_100;
const proc = new SpessaSynthProcessor(rate);
check(
    "no missing preset warnings before a bank is added",
    !warnings.some((w) => w.includes("No preset found"))
);
check(
    "channels start without a preset",
    proc.midiChannels.every((c) => c.preset === undefined)
);

const bank = SoundBankLoader.fromArrayBuffer(
    BasicSoundBank.getSampleSoundBankFile()
);
proc.soundBankManager.addSoundBank(bank, "main");
check(
    "adding a bank gives the channels their presets",
    proc.midiChannels[0].preset?.name === "Saw Wave"
);

const left = new Float32Array(128);
const right = new Float32Array(128);
const render = (quanta: number) => {
    for (let i = 0; i < quanta; i++) proc.process(left, right, 0, 128);
};

// Play a note and set a controller, the refresh must keep both
proc.controllerChange(0, 7, 50);
proc.noteOn(0, 60, 100);
render(10);
const voicesBefore = proc.midiChannels[0].voiceCount;
check("the note plays", voicesBefore > 0);

// Add a preset at program 5 to the bank that is already added
const inst = bank.instruments[0];
const added = new BasicPreset(bank);
added.name = "Added Saw";
added.program = 5;
added.createZone(inst);
bank.addPresets(added);
bank.flush();
check(
    "the new preset is not selectable before the refresh",
    !proc.soundBankManager.presetList.some((p) => p.program === 5)
);

// Replace the program 0 preset with a new object
const oldPreset = bank.presets.find((p) => p.program === 0)!;
bank.deletePreset(oldPreset);
const replaced = new BasicPreset(bank);
replaced.name = "Replaced Saw";
replaced.createZone(inst);
bank.addPresets(replaced);
bank.flush();

let presetListEvents = 0;
let programEvents = 0;
proc.onEventCall = (e) => {
    if (e.type === "presetListChange") presetListEvents++;
    if (e.type === "programChange") programEvents++;
};
proc.refreshPresets();

check(
    "the new preset is selectable after the refresh",
    proc.soundBankManager.presetList.some((p) => p.program === 5)
);
check("the preset list event is sent", presetListEvents === 1);
check("no program change events are sent", programEvents === 0);
check(
    "the channel points at the replacing preset",
    proc.midiChannels[0].preset?.name === "Replaced Saw"
);
check(
    "the playing voices keep going",
    proc.midiChannels[0].voiceCount === voicesBefore
);
check(
    "controllers are not reset",
    proc.midiChannels[0].midiControllers[7] >> 7 === 50
);
render(10);
check("rendering continues", proc.midiChannels[0].voiceCount > 0);

proc.programChange(1, 5);
check(
    "a program change selects the new preset",
    proc.midiChannels[1].preset?.name === "Added Saw"
);

// A locked preset stays locked but moves to the new object of its patch
proc.midiChannels[2].setSystemParameter("presetLock", true);
const lockedName = proc.midiChannels[2].preset?.name;
const again = new BasicPreset(bank);
again.name = "Third Saw";
again.createZone(inst);
bank.deletePreset(replaced);
bank.addPresets(again);
bank.flush();
proc.refreshPresets();
check(
    "a locked channel resolves its own patch again",
    lockedName === "Replaced Saw" &&
        proc.midiChannels[2].preset?.name === "Third Saw" &&
        proc.midiChannels[2].systemParameters.presetLock
);

check(
    "no missing preset warnings at all",
    !warnings.some((w) => w.includes("No preset found"))
);
SpessaLog.logFunctions.warn = originalWarn;

if (failed) {
    console.error("Some checks failed.");
    process.exit(1);
}
console.info("All checks passed.");

// Round trip tests for MIDIUtils.fromAnalyzedMessage:
// Analyze a message, encode the result and analyze the encoded messages again, the results must match.
// The messages cover the whole GS and XG address space, the Universal messages the analyzer knows,
// The RPNs and the NRPNs.
// Usage: npx tsx tests/midi/encoder_round_trip_test.ts
import {
    type AnalyzedMessage,
    type MIDIController,
    MIDIControllers,
    type MIDIEncodeOptions,
    type MIDIMessage,
    MIDIMessageTypes,
    MIDIUtils,
    SpessaLog
} from "../../src";

SpessaLog.setLogLevel(false, false, false);

let failed = 0;
let checked = 0;
const failures = new Map<string, string>();

const hex = (data: ArrayLike<number>) =>
    Array.from(data, (b) => b.toString(16).padStart(2, "0")).join(" ");
const hexMessages = (messages: MIDIMessage[]) =>
    messages.map((m) => hex([m.statusByte, ...m.data])).join(" | ");

/**
 * Sorts the object keys, so results with the same content compare equal.
 * Poly and mono mode are the same thing as a channel parameter (GS) and as a controller (XG, the CC).
 */
function normalize(msg: AnalyzedMessage.Any) {
    const canonical =
        msg.type === "Channel MIDI Param" && msg.parameter === "polyMode"
            ? {
                  type: "Controller Change",
                  channel: msg.channel,
                  controller: msg.value
                      ? MIDIControllers.polyModeOn
                      : MIDIControllers.monoModeOn,
                  value: 0
              }
            : msg;
    const entries = Object.entries(canonical);
    entries.sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify(Object.fromEntries(entries));
}

/**
 * Analyzes encoded messages: System Exclusive, channel messages and RPN/NRPN groups
 * (selection MSB, selection LSB, data entry MSB, data entry LSB, the way the encoder writes them).
 */
function analyzeMessages(messages: MIDIMessage[]) {
    const results = new Array<AnalyzedMessage.Any>();
    for (let i = 0; i < messages.length; i++) {
        const { statusByte, data } = messages[i];
        if (statusByte === MIDIMessageTypes.systemExclusive) {
            results.push(...MIDIUtils.analyzeSysEx(data));
            continue;
        }
        const channel = statusByte & 0x0f;
        switch (statusByte & 0xf0) {
            case MIDIMessageTypes.programChange: {
                results.push({
                    type: "Program Change",
                    channel,
                    value: data[0]
                });
                break;
            }
            case MIDIMessageTypes.channelPressure: {
                results.push({
                    type: "Channel MIDI Param",
                    channel,
                    parameter: "pressure",
                    value: data[0]
                });
                break;
            }
            case MIDIMessageTypes.pitchWheel: {
                results.push({
                    type: "Channel MIDI Param",
                    channel,
                    parameter: "pitchWheel",
                    value: data[0] | (data[1] << 7)
                });
                break;
            }
            case MIDIMessageTypes.controllerChange: {
                const controller = data[0] as MIDIController;
                if (
                    controller === MIDIControllers.registeredParameterMSB ||
                    controller === MIDIControllers.nonRegisteredParameterMSB
                ) {
                    const group = messages
                        .slice(i, i + 4)
                        .map((m) => m.data[1]);
                    const parameter = (group[0] << 7) | group[1];
                    const value = (group[2] << 7) | group[3];
                    results.push(
                        controller === MIDIControllers.registeredParameterMSB
                            ? MIDIUtils.analyzeRPN(channel, parameter, value)
                            : MIDIUtils.analyzeNRPN(channel, parameter, value)
                    );
                    i += 3;
                    break;
                }
                results.push({
                    type: "Controller Change",
                    channel,
                    controller,
                    value: data[1]
                });
                break;
            }
            default: {
                results.push({ type: "Other" });
            }
        }
    }
    return results;
}

/**
 * Round trips one analysis result.
 * @param result The analyzed message.
 * @param source The analyzed bytes, for the report.
 * @param options The encoding options.
 */
function roundTrip(
    result: AnalyzedMessage.Any,
    source: string,
    options: Partial<MIDIEncodeOptions>
) {
    // Other With Data is a plain copy of its bytes, checked once below instead of for every address
    if (
        result.type === "Other" ||
        result.type === "Other With Data" ||
        result.type === "Display Data"
    )
        return;
    checked++;
    let reanalyzed: string;
    let encoded = "";
    try {
        const messages = MIDIUtils.fromAnalyzedMessage(result, options);
        encoded = hexMessages(messages);
        const sysEx = messages.find(
            (m) => m.statusByte === MIDIMessageTypes.systemExclusive
        );
        const again = analyzeMessages(messages);
        if (
            sysEx &&
            options.deviceID !== undefined &&
            sysEx.data[1] !== options.deviceID
        ) {
            reanalyzed = `device ID ${sysEx.data[1]}`;
        } else if (
            again.length === 1 &&
            result.type === "Channel MIDI Param" &&
            result.parameter === "modulationDepth" &&
            again[0].type === "Channel MIDI Param" &&
            again[0].parameter === "modulationDepth"
        ) {
            // GS and XG set it in 5 cent steps, the RPN in 100/128 cent steps
            reanalyzed = normalize(
                Math.abs(again[0].value - result.value) <= 100 / 128 / 2
                    ? result
                    : again[0]
            );
        } else {
            reanalyzed =
                again.length === 1
                    ? normalize(again[0])
                    : JSON.stringify(again);
        }
    } catch (error) {
        const message = (error as Error).message;
        // A standard channel message can not address a channel above 15 (GS block B, XG parts 16 and up)
        if (
            "channel" in result &&
            result.channel > 15 &&
            message.includes("can not be set with a channel message")
        ) {
            checked--;
            return;
        }
        reanalyzed = `threw ${message}`;
    }
    const expected = normalize(result);
    if (reanalyzed === expected) return;
    failed++;
    // One example per analyzed type and parameter is enough to read
    const key = `${result.type} ${"parameter" in result ? String(result.parameter) : ""}${"controller" in result ? result.controller : ""}`;
    if (!failures.has(key)) {
        failures.set(
            key,
            `${source}\n    analyzed: ${expected}\n    encoded:  ${encoded}\n    again:    ${reanalyzed}`
        );
    }
}

/**
 * Round trips every single-result analysis of a System Exclusive message.
 * Messages with several results (bulk dumps, the tone number) are decode-only.
 */
function roundTripSysEx(
    syx: number[],
    preferredSystem: MIDIEncodeOptions["preferredSystem"]
) {
    const results = MIDIUtils.analyzeSysEx(syx);
    if (results.length !== 1) return;
    roundTrip(results[0], hex(syx), { preferredSystem, deviceID: syx[1] });
}

// Data values: the edges and a few in between
const VALUES = [0, 1, 2, 15, 16, 24, 63, 64, 65, 88, 100, 126, 127];

// GS: every address of the blocks the analyzer reads, data padded to four bytes for the multi-byte parameters
for (const a1 of [0x00, 0x21, 0x40, 0x41, 0x50, 0x51]) {
    for (let a2 = 0; a2 < 128; a2++) {
        for (let a3 = 0; a3 < 128; a3++) {
            for (const v of VALUES) {
                // The master tune is four nibbles
                const data =
                    a1 === 0x40 && a2 === 0x00 && a3 === 0x00
                        ? [v & 0x0f, 0x04, 0x00, 0x08]
                        : [v, 0x05, 0x0a, 0x03];
                roundTripSysEx(MIDIUtils.gs(a1, a2, a3, data, 0x10), "gs");
            }
        }
    }
}

// XG: the system, effect, multi part and drum setup blocks
const XG_A1 = [0x00, 0x02, 0x03, 0x08];
for (let setup = 0; setup < 16; setup++) XG_A1.push(0x30 | setup);
for (const a1 of XG_A1) {
    for (let a2 = 0; a2 < 128; a2++) {
        for (let a3 = 0; a3 < 128; a3++) {
            for (const v of VALUES) {
                // The master tune is four nibbles
                const data =
                    a1 === 0x00 && a2 === 0x00 && a3 === 0x00
                        ? [v & 0x0f, 0x04, 0x00, 0x08]
                        : [v, 0x05, 0x0a, 0x03];
                roundTripSysEx(MIDIUtils.xg(a1, a2, a3, data, 0x10), "xg");
            }
        }
    }
}

// Other device IDs are kept
roundTripSysEx(MIDIUtils.gs(0x40, 0x01, 0x33, [100], 0x13), "gs");
// For XG the high nibble is the message type (1n parameter change), only the device number changes
roundTripSysEx(MIDIUtils.xg(0x08, 0x02, 0x0b, [100], 0x11), "xg");
roundTripSysEx(MIDIUtils.deviceControl(0x01, [0x12, 0x34], 0x00), "gm");

// Universal: device control with 14-bit values, GM2 global parameter control and the GM system messages
for (const subID of [0x01, 0x02, 0x03, 0x04]) {
    for (const lsb of VALUES) {
        for (const msb of VALUES) {
            roundTripSysEx(MIDIUtils.deviceControl(subID, [lsb, msb]), "gm");
        }
    }
}
for (const slot of [0x01, 0x02]) {
    for (let parameter = 0; parameter < 5; parameter++) {
        for (const v of [...VALUES, 0x08]) {
            roundTripSysEx(
                MIDIUtils.deviceControl(0x05, [
                    0x01,
                    0x01,
                    0x01,
                    0x01,
                    slot,
                    parameter,
                    v
                ]),
                "gm2"
            );
        }
    }
}
for (const subID of [0x01, 0x02, 0x03]) {
    roundTripSysEx([0x7e, 0x7f, 0x09, subID, 0xf7], "gm");
}

// RPNs: every parameter the analyzer knows, the pitch wheel range cents stay below 100
const DATA_14 = [
    0, 1, 99, 127, 128, 1000, 8191, 8192, 8193, 12_000, 16_255, 16_383
];
for (const channel of [0, 9, 15]) {
    for (const rpn of [0x00_00, 0x00_01, 0x00_02, 0x00_05]) {
        for (const value of DATA_14) {
            if (rpn === 0 && (value & 0x7f) > 99) continue;
            roundTrip(
                MIDIUtils.analyzeRPN(channel, rpn, value),
                `RPN ${rpn} = ${value} on ${channel}`,
                {}
            );
        }
    }
}

// NRPNs: the drum parameters (data entry MSB only, like the analyzer reads them) and the controller aliases
for (const channel of [0, 9, 15]) {
    for (let msb = 0; msb < 128; msb++) {
        for (const lsb of [0, 1, 35, 36, 64, 127]) {
            for (const coarse of VALUES) {
                const nrpn = (msb << 7) | lsb;
                roundTrip(
                    MIDIUtils.analyzeNRPN(channel, nrpn, coarse << 7),
                    `NRPN ${msb} ${lsb} = ${coarse} on ${channel}`,
                    {}
                );
            }
        }
    }
}

// Messages without a form, or with values that do not fit, throw
function throws(name: string, run: () => unknown) {
    checked++;
    try {
        run();
    } catch {
        return;
    }
    failed++;
    failures.set(`throws: ${name}`, "did not throw");
}
// @ts-expect-error Testing if it throws
throws("Other", () => MIDIUtils.fromAnalyzedMessage({ type: "Other" }));

// An unrecognized message is written back as it came, device ID and all
{
    const syx = [0x41, 0x11, 0x42, 0x11, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7];
    const [result] = MIDIUtils.analyzeSysEx(syx);
    checked++;
    const encoded = MIDIUtils.fromAnalyzedMessage(result, { ticks: 5 });
    const bytes = encoded.map((m) => Array.from(m.toBytes()).join(","));
    const expected = [[0xf0, ...syx].join(",")];
    if (
        result.type !== "Other With Data" ||
        encoded[0].ticks !== 5 ||
        JSON.stringify(bytes) !== JSON.stringify(expected)
    ) {
        failed++;
        failures.set(
            "Other With Data",
            `${result.type}: ${bytes.join(" | ")} at ${encoded[0]?.ticks}`
        );
    }
}
throws("Display Data", () =>
    MIDIUtils.fromAnalyzedMessage({ type: "Display Data" })
);
throws("controller on channel 16", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "Controller Change",
        channel: 16,
        controller: MIDIControllers.mainVolume,
        value: 100
    })
);
// The pitch wheel is continuous, so it is rounded and clamped instead
{
    checked++;
    const [{ data }] = MIDIUtils.fromAnalyzedMessage({
        type: "Channel MIDI Param",
        channel: 0,
        parameter: "pitchWheel",
        value: 20_000.4
    });
    if (data[0] !== 0x7f || data[1] !== 0x7f) {
        failed++;
        failures.set("pitch wheel clamp", hex(data));
    }
}
throws("program out of range", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "Program Change",
        channel: 0,
        value: 128
    })
);
throws("controller value 300", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "Controller Change",
        channel: 0,
        controller: MIDIControllers.mainVolume,
        value: 300
    })
);
throws("fractional channel pressure", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "Channel MIDI Param",
        channel: 0,
        parameter: "pressure",
        value: 1.5
    })
);
throws("GS receive channel 16", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "Channel MIDI Param",
        channel: 0,
        parameter: "rxChannel",
        value: 16
    })
);
throws("drum key 128", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "Channel Drum Setup",
        channel: 9,
        key: 128,
        parameter: "level",
        value: 100
    })
);
throws("drum parameter without an NRPN", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "Channel Drum Setup",
        channel: 9,
        key: 36,
        parameter: "assignGroup",
        value: 1
    })
);
throws("GS block C part", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "Channel MIDI Param",
        channel: 32,
        parameter: "drumMap",
        value: 1
    })
);
throws("value out of range", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "GS Reverb Param",
        parameter: "level",
        value: 128
    })
);

throws("XG drum setup out of range", () =>
    MIDIUtils.fromAnalyzedMessage(
        {
            type: "Map Drum Setup",
            drumMap: 18,
            key: 36,
            parameter: "level",
            value: 100
        },
        { preferredSystem: "xg" }
    )
);
throws("GS drum map out of range", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "Map Drum Setup",
        drumMap: 9,
        key: 36,
        parameter: "level",
        value: 100
    })
);
throws("User Drum Set 2", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "User Drum Setup",
        drumSet: 2,
        midiNote: 36,
        parameter: "level",
        value: 100
    })
);
throws("invalid XG variation connection", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "XG Variation Param",
        parameter: "connection",
        value: "parallel" as "system"
    })
);
throws("negative XG insertion value", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "XG Insertion Param",
        insertionNumber: 0,
        parameter: 2,
        value: -1
    })
);
throws("XG reverb type out of range", () =>
    MIDIUtils.fromAnalyzedMessage({
        type: "XG Reverb Param",
        parameter: "type",
        value: 0x80_00
    })
);

// GM2 only has the reverb and chorus macros 0-5, the others stay GS
for (const type of ["GS Reverb Param", "GS Chorus Param"] as const) {
    for (const [value, manufacturer] of [
        [5, 0x7f],
        [6, 0x41],
        [7, 0x41]
    ]) {
        checked++;
        const [{ data }] = MIDIUtils.fromAnalyzedMessage(
            { type, parameter: "macro", value },
            { preferredSystem: "gm2" }
        );
        if (data[0] === manufacturer) continue;
        failed++;
        failures.set(`GM2 ${type} macro ${value}`, hex(data));
    }
}

for (const [key, example] of failures) {
    console.error(`FAIL ${key}\n    ${example}`);
}
if (failed > 0) {
    console.error(`${failed} of ${checked} failed.`);
    process.exitCode = 1;
} else {
    console.info(`All ${checked} passed.`);
}

import type { DelayMemory } from "../blocks/delay_memory";
import { balanceDry, balanceWet, panLeft, panRight } from "../glue";
import { pitchRatio, pitchWindow, preDelay } from "../conversion";
import { GSPitchShifterEffect } from "./pitch_shifter_effect";

/**
 * 2Voice Pitch Shifter (`01 60`): two shifted voices with their own pitch, pre delay and pan, mixed by the level
 * balance.
 * Parameters: 1 coarse A, 2 fine A, 3 pre delay A, 4 pan A, 5 coarse B, 6 fine B, 7 pre delay B, 8 pan B, 9 mode,
 * 10 level balance (A to B), 16 balance, 17 low gain, 18 high gain, 20 level. EFX control source 1 modulates the
 * coarse pitch of A, source 2 that of B.
 * @internal
 */
export class GSTwoVoicePitchShifter extends GSPitchShifterEffect {
    public readonly type = 0x01_60;
    protected readonly defaults = new Uint8Array([
        0x47, 0x3e, 0x00, 0x7f, 0x3b, 0x42, 0x00, 0x00, 0x02, 0x40, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x30, 0x40, 0x40, 0x00, 0x5f
    ]);
    // The coarse pitches are 40-76 (-24 to +12 semitones)
    protected readonly limits = { 0: 76, 4: 76, 8: 4 };
    protected readonly minimums = { 0: 40, 4: 40 };
    protected readonly fineParameters = [1, 5];
    /**
     * Twice Fb P.Shifter's: the program adds the 127/128 input to itself, on the SC-88Pro too (its wet is 6 dB
     * above Fb's).
     */
    protected readonly inputGain = 1 + 127 / 128;

    public constructor(sampleRate: number, memory: DelayMemory) {
        super(sampleRate, memory, 2);
        this.reset();
    }

    protected update() {
        const p = this.parameters;
        const window = pitchWindow(p[8]);
        for (let voice = 0; voice < 2; voice++) {
            const base = 4 * voice;
            const coarse = Math.max(
                40,
                Math.min(76, this.controlled(voice, base))
            );
            this.shifter.setVoice(
                voice,
                pitchRatio(coarse, p[base + 1]),
                window
            );
            this.shifter.setPreDelay(voice, preDelay(p[base + 2]));
            // The level balance: A on its dry side, B on its wet side
            const level = voice === 0 ? balanceDry(p[9]) : balanceWet(p[9]);
            this.gainsL[voice] = level * panLeft(p[base + 3]);
            this.gainsR[voice] = level * panRight(p[base + 3]);
        }
        this.updateOutput();
    }
}

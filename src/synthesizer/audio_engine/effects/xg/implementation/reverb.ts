import { XGNoEffect } from "./dsp/no_effect";
import type { DefaultXGEffectProcessorConstructor } from "./dsp/effect_processor";
import type { XGReverbBlock } from "../interface/xg_reverb_block";
import { DefaultXGSystemEffect } from "./system_effect";
import { XGBasement } from "./dsp/reverb/basement";
import { XGGMPlate } from "./dsp/reverb/gm_plate";
import { XGHall1 } from "./dsp/reverb/hall1";
import { XGHall2 } from "./dsp/reverb/hall2";
import { XGHallL } from "./dsp/reverb/hall_l";
import { XGHallM } from "./dsp/reverb/hall_m";
import { XGPlate } from "./dsp/reverb/plate";
import { XGRoom1 } from "./dsp/reverb/room1";
import { XGRoom2 } from "./dsp/reverb/room2";
import { XGRoom3 } from "./dsp/reverb/room3";
import { XGRoomL } from "./dsp/reverb/room_l";
import { XGRoomM } from "./dsp/reverb/room_m";
import { XGRoomS } from "./dsp/reverb/room_s";
import { XGStage1 } from "./dsp/reverb/stage1";
import { XGStage2 } from "./dsp/reverb/stage2";
import { XGTunnel } from "./dsp/reverb/tunnel";
import { XGWhiteRoom } from "./dsp/reverb/white_room";

const REVERB_MAP = new Map<number, DefaultXGEffectProcessorConstructor>([
    [0x00_00, XGNoEffect],
    [0x01_00, XGHall1],
    [0x01_01, XGHall2],
    [0x01_06, XGHallM],
    [0x01_07, XGHallL],
    [0x02_00, XGRoom1],
    [0x02_01, XGRoom2],
    [0x02_02, XGRoom3],
    [0x02_05, XGRoomS],
    [0x02_06, XGRoomM],
    [0x02_07, XGRoomL],
    [0x03_00, XGStage1],
    [0x03_01, XGStage2],
    [0x04_00, XGPlate],
    [0x04_07, XGGMPlate],
    [0x10_00, XGWhiteRoom],
    [0x11_00, XGTunnel],
    [0x13_00, XGBasement]
]);

/**
 * The default implementation for {@link XGReverbBlock}.
 *
 * @group Synthesizer.XG Effects
 * @sealed
 */
export class DefaultXGReverb
    extends DefaultXGSystemEffect
    implements XGReverbBlock
{
    /**
     * Constructs a new default XG reverb processor.
     * @param sampleRate The sample rate, in Hertz.
     * @param maxBufferSize The maximum buffer size the synthesizer can render at once.
     * Attempting to `.process()` more samples than this will result in an error.
     */
    public constructor(sampleRate: number, maxBufferSize: number) {
        super(
            REVERB_MAP,
            XGNoEffect,
            0x01_00,
            sampleRate,
            maxBufferSize,
            false
        );
    }

    public process(
        inputLeft: Float32Array,
        inputRight: Float32Array,
        outputLeft: Float32Array,
        outputRight: Float32Array,
        startIndex: number,
        sampleCount: number
    ) {
        this.processor.process(
            inputLeft,
            inputRight,
            this.outputLeft,
            this.outputRight,
            sampleCount,
            false
        );
        this.mixSystemEffect(outputLeft, outputRight, startIndex, sampleCount);
    }
}

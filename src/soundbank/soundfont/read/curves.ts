import { readLittleEndianIndexed } from "../../../utils/byte_functions/little_endian";
import type { RIFFChunk } from "../../../utils/riff_chunk";
import {
    CustomCurve,
    type CustomCurvePoint
} from "../../basic_soundbank/custom_curve";
import { SpessaLog } from "../../../utils/loggin";
import { readBinaryStringIndexed } from "../../../utils/byte_functions/string";

// The name and the point count
const CURVE_HEADER_SIZE = 42;

/**
 * Reads the SFe custom curves.
 * @param curveChunk the CURV chunk
 * @returns the curves, an invalid curve is undefined
 */
export function readCurves(curveChunk: RIFFChunk) {
    const data = curveChunk.data;
    const curves = new Array<CustomCurve | undefined>();
    if (data.length < 2) return curves;
    const count = readLittleEndianIndexed(data, 2);
    for (let c = 0; c < count; c++) {
        if (data.currentIndex + CURVE_HEADER_SIZE > data.length) {
            SpessaLog.warn(`Custom curve ${c} is truncated.`);
            break;
        }
        const name = readBinaryStringIndexed(data, 40);
        const pointCount = readLittleEndianIndexed(data, 2);
        if (data.currentIndex + pointCount * 4 > data.length) {
            SpessaLog.warn(`Custom curve ${c} is truncated.`);
            break;
        }
        const points = new Array<CustomCurvePoint>(pointCount);
        for (let i = 0; i < pointCount; i++) {
            const x = readLittleEndianIndexed(data, 2);
            const y = readLittleEndianIndexed(data, 2);
            points[i] = { x, y };
        }
        // The constructor validates the points
        try {
            curves.push(new CustomCurve(points, name));
        } catch (error) {
            SpessaLog.warn(
                `Custom curve ${c} "${name}" is invalid, ignoring: ${(error as Error).message}`
            );
            curves.push(undefined);
        }
    }
    return curves;
}

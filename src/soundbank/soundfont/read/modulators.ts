import {
    readLittleEndianIndexed,
    signedInt16
} from "../../../utils/byte_functions/little_endian";
import {
    DecodedModulator,
    Modulator,
    XMOD_BYTE_SIZE
} from "../../basic_soundbank/modulator";
import type { RIFFChunk } from "../../../utils/riff_chunk";
import {
    type GeneratorType,
    GeneratorTypes
} from "../../basic_soundbank/generator_types";
import type { CustomCurve } from "../../basic_soundbank/custom_curve";
import { ModulatorCurveTypes } from "../../enums";
import type { ModulatorSource } from "../../basic_soundbank/modulator_source";

/**
 * Reads the modulators
 * @param modulatorChunk pmod, imod or DMOD
 * @param allowSFe if destinations above endOper and custom curves are allowed (SFe banks)
 * @param curves the SFe custom curves
 * @param extendedChunk the SFe extended records (xdta pmod, imod or XMOD)
 */
export function readModulators(
    modulatorChunk: RIFFChunk,
    allowSFe: boolean,
    curves: (CustomCurve | undefined)[] = [],
    extendedChunk?: RIFFChunk
): Modulator[] {
    const mods = [];
    while (modulatorChunk.data.length > modulatorChunk.data.currentIndex) {
        const dataArray = modulatorChunk.data;
        const sourceEnum = readLittleEndianIndexed(dataArray, 2);
        const destination = readLittleEndianIndexed(dataArray, 2);
        const amount = signedInt16(
            dataArray[dataArray.currentIndex++],
            dataArray[dataArray.currentIndex++]
        );
        const secondarySourceEnum = readLittleEndianIndexed(dataArray, 2);
        const transformType = readLittleEndianIndexed(dataArray, 2);
        const mod = new DecodedModulator(
            sourceEnum,
            secondarySourceEnum,
            destination as GeneratorType,
            amount,
            transformType
        );
        if (!allowSFe && mod.destination > GeneratorTypes.endOper)
            mod.destination = GeneratorTypes.invalid;
        mods.push(mod);
    }

    // Remove terminal
    mods.pop();

    // One extended record for each modulator with a custom curve, in order, then the terminal record.
    // A different count means the records can't be matched, so they are all ignored.
    // The count includes modulators ignored for another reason, every reader must agree on it.
    const customCount = mods.filter((m) => m.usesCustomCurve).length;
    const ext =
        allowSFe &&
        extendedChunk &&
        // A size that is not a whole number of records is as good as missing
        extendedChunk.data.length % XMOD_BYTE_SIZE === 0 &&
        extendedChunk.data.length / XMOD_BYTE_SIZE - 1 === customCount
            ? extendedChunk.data
            : undefined;
    let record = 0;

    // The curve a source gets: its custom curve, its own built-in one, or nothing if the modulator is ignored
    const resolveCurve = (source: ModulatorSource, index: number) => {
        if (source.curveType === ModulatorCurveTypes.custom && allowSFe) {
            return ext ? curves[index] : undefined;
        }
        // SF2 2.04 section 8.2: unknown curve types make the modulator ignored
        return source.curveType <= ModulatorCurveTypes.switch
            ? source.curve
            : undefined;
    };

    for (const mod of mods) {
        let sourceCurve = 0;
        let amountCurve = 0;
        let reserved = 0;
        if (ext && mod.usesCustomCurve) {
            ext.currentIndex = record++ * XMOD_BYTE_SIZE;
            sourceCurve = readLittleEndianIndexed(ext, 2);
            amountCurve = readLittleEndianIndexed(ext, 2);
            // A later version may give the reserved words a meaning, so such a modulator is ignored
            reserved =
                readLittleEndianIndexed(ext, 2) |
                readLittleEndianIndexed(ext, 2) |
                readLittleEndianIndexed(ext, 2);
        }
        const primary = resolveCurve(mod.primarySource, sourceCurve);
        const secondary = resolveCurve(mod.secondarySource, amountCurve);
        // Assigned only when both resolve, so an ignored modulator never links a curve
        if (reserved === 0 && primary && secondary) {
            mod.primarySource.curve = primary;
            mod.secondarySource.curve = secondary;
        } else {
            mod.destination = GeneratorTypes.invalid;
        }
    }
    return mods;
}

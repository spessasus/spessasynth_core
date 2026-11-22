import {
    readLittleEndianIndexed,
    signedInt16
} from "../../../utils/byte_functions/little_endian";
import {
    DecodedModulator,
    type Modulator,
    MODULATOR_EXTENDED_FLAG,
    XMOD_BYTE_SIZE
} from "../../basic_soundbank/modulator";
import type { RIFFChunk } from "../../../utils/riff_chunk";
import {
    type GeneratorType,
    GeneratorTypes
} from "../../basic_soundbank/generator_types";
import type { CustomCurve } from "../../basic_soundbank/custom_curve";
import {
    ModulatorControllerSources,
    ModulatorCurveTypes,
    ModulatorTransformTypes
} from "../../enums";
import type { ModulatorSource } from "../../basic_soundbank/modulator_source";

// The destinations a modulator may have: every generator the bank model knows. A reserved number is unknown,
// And so is endOper, which only ends a generator list
const KNOWN_DESTINATIONS = new Set<number>(Object.values(GeneratorTypes));
KNOWN_DESTINATIONS.delete(GeneratorTypes.endOper);

const isDepthRange = (source: ModulatorSource) =>
    !source.isCC &&
    source.index === ModulatorControllerSources.modulationDepthRange;

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
    const mods = new Array<DecodedModulator>();
    // Which modulators have an extended record, in an SFe file
    const flags = new Array<boolean>();
    while (modulatorChunk.data.length > modulatorChunk.data.currentIndex) {
        const dataArray = modulatorChunk.data;
        const sourceEnum = readLittleEndianIndexed(dataArray, 2);
        const destination = readLittleEndianIndexed(dataArray, 2);
        const amount = signedInt16(
            dataArray[dataArray.currentIndex++],
            dataArray[dataArray.currentIndex++]
        );
        const secondarySourceEnum = readLittleEndianIndexed(dataArray, 2);
        const transformEnum = readLittleEndianIndexed(dataArray, 2);
        // Bit 15 is the flag in an SFe file, the transform is the lower 15 bits.
        // Elsewhere the whole word is the transform, and bit 15 makes it unknown
        const flagged =
            allowSFe && (transformEnum & MODULATOR_EXTENDED_FLAG) !== 0;
        const transformType = allowSFe
            ? transformEnum & ~MODULATOR_EXTENDED_FLAG
            : transformEnum;
        const mod = new DecodedModulator(
            sourceEnum,
            secondarySourceEnum,
            destination as GeneratorType,
            amount,
            transformType
        );
        if (
            (!allowSFe &&
                (mod.destination > GeneratorTypes.endOper ||
                    // The modulation depth range is an SFe source
                    isDepthRange(mod.primarySource) ||
                    isDepthRange(mod.secondarySource))) ||
            // An unknown destination (a reserved number, or one a later version defines)
            (mod.destination !== GeneratorTypes.invalid &&
                !KNOWN_DESTINATIONS.has(mod.destination)) ||
            // An unknown transform
            (transformType !== ModulatorTransformTypes.linear &&
                transformType !== ModulatorTransformTypes.absolute)
        ) {
            mod.destination = GeneratorTypes.invalid;
        }
        mods.push(mod);
        flags.push(flagged);
    }

    // Remove terminal
    mods.pop();
    flags.pop();

    // One extended record for each flagged modulator, in order, then the terminal record.
    // A different count means the records can't be matched, so every flagged modulator is ignored.
    // The count includes modulators ignored for another reason, every reader must agree on it.
    const flaggedCount = flags.filter(Boolean).length;
    const ext =
        allowSFe &&
        extendedChunk &&
        // A size that is not a whole number of records is as good as missing
        extendedChunk.data.length % XMOD_BYTE_SIZE === 0 &&
        extendedChunk.data.length / XMOD_BYTE_SIZE - 1 === flaggedCount
            ? extendedChunk.data
            : undefined;
    let record = 0;

    // The curve a source gets: its custom curve, its own built-in one, or nothing if the modulator is ignored
    const resolveCurve = (source: ModulatorSource, index: number) => {
        if (allowSFe && source.curveType === ModulatorCurveTypes.custom) {
            return curves[index];
        }
        // SF2 2.04 section 8.2: unknown curve types make the modulator ignored
        return source.curveType <= ModulatorCurveTypes.switch
            ? source.curve
            : undefined;
    };

    for (const [m, mod] of mods.entries()) {
        let sourceCurve = 0;
        let amountCurve = 0;
        // A reader that does not understand why a modulator has a record ignores it and still consumes the record
        let understood = true;
        if (flags[m]) {
            if (ext) {
                ext.currentIndex = record++ * XMOD_BYTE_SIZE;
                sourceCurve = readLittleEndianIndexed(ext, 4);
                amountCurve = readLittleEndianIndexed(ext, 4);
                // A later version may give the reserved bytes a meaning
                understood =
                    (readLittleEndianIndexed(ext, 4) |
                        readLittleEndianIndexed(ext, 4)) ===
                    0;
            } else {
                understood = false;
            }
            // The only reason 4.0 gives a record is a custom curve
            if (!mod.usesCustomCurve) understood = false;
        } else if (mod.usesCustomCurve) {
            // A custom curve needs the flag
            understood = false;
        }
        const primary = resolveCurve(mod.primarySource, sourceCurve);
        const secondary = resolveCurve(mod.secondarySource, amountCurve);
        // Assigned only when both resolve, so an ignored modulator never links a curve
        if (understood && primary && secondary) {
            mod.primarySource.curve = primary;
            mod.secondarySource.curve = secondary;
        } else {
            mod.destination = GeneratorTypes.invalid;
        }
    }
    return mods;
}

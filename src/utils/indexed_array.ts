/**
 * indexed_array.js
 * purpose: extends Uint8Array with a currentIndex property.
 */

export class IndexedByteArray extends Uint8Array {
    /**
     * The current index of the array
     */
    currentIndex: number = 0;

    /**
     * Returns a section of an array.
     * @param start The beginning of the specified portion of the array.
     * @param end The end of the specified portion of the array. This is exclusive of the element at the index 'end'.
     */
    slice(start?: number, end?: number): IndexedByteArray {
        const a = super.slice(start, end) as IndexedByteArray;
        a.currentIndex = 0;
        return a;
    }
}

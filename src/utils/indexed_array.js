/**
 * indexed_array.js
 * purpose: exteds Uint8Array with a currentIndex property
 */

export class IndexedByteArray extends Uint8Array
{
    /**
     * The current index of the array
     * @type {number}
     */
    currentIndex = 0;
    
    /**
     * Creates a new instance of an Uint8Array with a currentIndex property
     * @param args {any} same as for Uint8Array
     */
    constructor(args)
    {
        super(args);
    }
    
    /**
     * @param start {number?}
     * @param end {number?}
     * @returns {IndexedByteArray}
     */
    slice(start, end)
    {
        const a = /** @type {IndexedByteArray} */ super.slice(start, end);
        a.currentIndex = 0;
        return a;
    }
}
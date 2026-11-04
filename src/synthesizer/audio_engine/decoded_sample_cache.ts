import type { BasicSample } from "../../soundbank/basic_soundbank/basic_sample";
import { DLSSample } from "../../soundbank/downloadable_sounds/dls_sample";

interface DecodedEntry {
    bytes: number;
    // Voice cache keys whose voices hold this sample's decoded data
    cacheKeys: Set<number>;
}

/**
 * Keeps the decoded sample data under a size budget by releasing the least recently used samples.
 * A released sample decodes again the next time it plays.
 * Samples that cannot decode again (replaced float data) are never released
 * and are not tracked, so they do not count towards the budget.
 * @internal
 */
export class DecodedSampleCache {
    /**
     * The budget in bytes. Infinity turns tracking off.
     */
    public budget: number;

    /**
     * Bytes of decoded data currently tracked.
     */
    public totalBytes = 0;

    // Map order is the use order, the first entry is the least recently used
    private readonly entries = new Map<BasicSample, DecodedEntry>();

    // DLS samples whose decoded data could not be released, these are not tracked
    private readonly unreleasable = new WeakSet<BasicSample>();

    private readonly voiceCache: Map<number, unknown>;

    /**
     * @param budget The budget in bytes.
     * @param voiceCache The processor's voice cache, its entries are dropped with their samples.
     */
    public constructor(budget: number, voiceCache: Map<number, unknown>) {
        this.budget = budget;
        this.voiceCache = voiceCache;
    }

    public get enabled() {
        return Number.isFinite(this.budget);
    }

    /**
     * Marks a decoded sample as used by a voice cache entry and releases old samples if over the budget.
     * @param sample The sample, already decoded.
     * @param cacheKey The voice cache key using it.
     */
    public touch(sample: BasicSample, cacheKey: number) {
        let entry = this.entries.get(sample);
        if (entry) {
            // Move to the end
            this.entries.delete(sample);
        }
        // Float data has nothing to decode again from, so it can't be released.
        // DLS samples in formats other than s16le report float32 too, but they can be released.
        // Those are tracked until releasing them fails
        if (
            this.unreleasable.has(sample) ||
            (sample.storedForm === "float32" && !(sample instanceof DLSSample))
        ) {
            // The data may have been replaced after it was tracked
            if (entry) this.totalBytes -= entry.bytes;
            return;
        }
        if (!entry) {
            entry = {
                bytes: sample.getAudioData().byteLength,
                cacheKeys: new Set()
            };
            this.totalBytes += entry.bytes;
        }
        entry.cacheKeys.add(cacheKey);
        this.entries.set(sample, entry);
        if (this.totalBytes > this.budget) {
            this.evict(sample);
        }
    }

    private evict(keep: BasicSample) {
        for (const [sample, entry] of this.entries) {
            if (this.totalBytes <= this.budget) {
                return;
            }
            // Never the one that is about to play
            if (sample === keep) {
                continue;
            }
            this.entries.delete(sample);
            this.totalBytes -= entry.bytes;
            // Release only drops data that can be decoded again
            if (!sample.releaseDecoded()) {
                // The data stays, so keep its cached voices and stop counting it
                this.unreleasable.add(sample);
                continue;
            }
            // Cached voices hold the data too, playing voices keep their own reference
            for (const key of entry.cacheKeys) {
                this.voiceCache.delete(key);
            }
        }
    }
}

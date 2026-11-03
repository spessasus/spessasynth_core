import { BasicZone } from "./basic_zone";
import type { BasicSoundBank } from "./basic_soundbank";
import { Generator } from "./generator";
import type { GeneratorType } from "./generator_types";

/**
 * An element that zones can link to, a {@link BasicInstrument} or a {@link BasicSample}.
 *
 * @group Sound Banks.Zones
 */
export interface LinkableZoneChild<P> {
    /**
     * The element's name.
     */
    name: string;

    /**
     * Links the element to a parent.
     * @param parent The parent that uses the element.
     */
    linkTo(parent: P): void;

    /**
     * Unlinks the element from a parent.
     * @param parent The parent that no longer uses the element.
     */
    unlinkFrom(parent: P): void;
}

/**
 * A zone that belongs to a parent and uses a child: a preset zone with its instrument,
 * or an instrument zone with its sample.
 * It keeps the child linked to the parent while the zone uses it.
 *
 * @group Sound Banks.Zones
 */
export abstract class BasicLinkedZone<
    P,
    C extends LinkableZoneChild<P>
> extends BasicZone {
    /**
     * The element this zone belongs to.
     */
    protected readonly parent: P;

    /**
     * The element this zone uses.
     */
    protected child: C;

    /**
     * The generator that stores the child's index when writing.
     */
    protected abstract readonly childGenerator: GeneratorType;

    /**
     * If this zone counts as a use of its child.
     * Zones created without linking never change the child's links.
     */
    private readonly linked: boolean;

    /**
     * Creates a new zone and links the child to the parent.
     * @param parent The element this zone belongs to.
     * @param child The element this zone uses.
     * @param link If the child should be linked to the parent.
     */
    protected constructor(parent: P, child: C, link: boolean) {
        super();
        this.parent = parent;
        this.child = child;
        this.linked = link;
        this.linkChild();
    }

    /**
     * Links the child to the parent, unless this zone was created without linking.
     * @internal
     */
    public linkChild() {
        if (this.linked) this.child.linkTo(this.parent);
    }

    /**
     * Unlinks the child from the parent, unless this zone was created without linking.
     * @internal
     */
    public unlinkChild() {
        if (this.linked) this.child.unlinkFrom(this.parent);
    }

    /**
     * @internal
     * @param bank
     */
    public getWriteGenerators(bank: BasicSoundBank): Generator[] {
        const gens = super.getWriteGenerators(bank);
        const childID = this.getChildList(bank).indexOf(this.child);
        if (childID === -1) {
            throw new Error(
                `${this.child.name} does not exist in ${bank.soundBankInfo.name}! Cannot write the zone.`
            );
        }
        gens.push(new Generator(this.childGenerator, childID, false));
        return gens;
    }

    /**
     * Replaces the child, moving the link from the previous one to the new one.
     * @param child The new child.
     */
    protected setChild(child: C) {
        this.unlinkChild();
        this.child = child;
        this.linkChild();
    }

    /**
     * The bank's list that the child's index is written from.
     * @param bank The bank being written.
     */
    protected abstract getChildList(bank: BasicSoundBank): C[];
}

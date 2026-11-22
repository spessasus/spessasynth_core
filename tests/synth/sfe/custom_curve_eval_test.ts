// Custom curves are evaluated per lookup instead of from tables. The result must equal the old tables exactly.
import { CustomCurve, type CustomCurvePoint } from "../../../src";
import { check, finish } from "./sfe_test_utils";

// The evaluation before the change: binary search, then a Float32 table per transform
function oldGetY(p: readonly CustomCurvePoint[], x: number) {
    if (x < p[0].x) return p[0].y;
    let low = 0;
    let high = p.length - 1;
    while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (p[mid].x <= x) low = mid;
        else high = mid - 1;
    }
    if (low === p.length - 1) return p[low].y;
    const a = p[low];
    const b = p[low + 1];
    return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
}

function oldTable(p: readonly CustomCurvePoint[], transform: number) {
    const isBipolar = (transform & 0b10) !== 0;
    const isNegative = (transform & 1) !== 0;
    const table = new Float32Array(16_384);
    for (let v = 0; v < 16_384; v++) {
        const value = v / 16_384;
        const y = oldGetY(p, (isNegative ? 1 - value : value) * 16_384);
        table[v] = isBipolar ? (y - 8192) / 8192 : y / 16_384;
    }
    return table;
}

// Deterministic random numbers
let seed = 12_345;
const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
};

function randomCurve() {
    const count = 2 + Math.floor(random() * 40);
    const xs = new Array<number>();
    for (let i = 0; i < count; i++) {
        // Some points on the 7-bit grid, some off it, some repeated for vertical steps
        const r = random();
        let x = Math.floor(random() * 16_384);
        if (r < 0.3) x &= ~127;
        if (r > 0.85 && xs.length > 0) x = xs[xs.length - 1];
        xs.push(x);
    }
    xs.sort((a, b) => a - b);
    return xs.map((x) => ({ x, y: Math.floor(random() * 16_385) }));
}

const curves: CustomCurvePoint[][] = [
    [
        { x: 0, y: 0 },
        { x: 16_383, y: 16_384 }
    ],
    // Starts late and ends early
    [
        { x: 3000, y: 9000 },
        { x: 3000, y: 100 },
        { x: 12_000, y: 16_000 }
    ],
    // Steps exactly on grid lines
    [
        { x: 0, y: 0 },
        { x: 8192, y: 0 },
        { x: 8192, y: 16_384 },
        { x: 16_256, y: 16_384 },
        { x: 16_256, y: 4000 }
    ]
];
for (let i = 0; i < 200; i++) curves.push(randomCurve());

let mismatches = 0;
for (const points of curves) {
    const curve = new CustomCurve(points);
    for (let transform = 0; transform < 4; transform++) {
        const table = oldTable(points, transform);
        for (let raw = 0; raw < 16_384; raw++) {
            const value = curve.getValue(
                raw,
                (transform & 0b10) !== 0,
                (transform & 1) !== 0
            );
            if (!Object.is(value, table[raw])) mismatches++;
        }
    }
}
check(
    mismatches === 0,
    `${curves.length} curves x 4 transforms x 16384 values match the old tables (${mismatches} mismatches)`
);

// Editing the points rebuilds the lookup
const edited = new CustomCurve(curves[0]);
edited.setPoints(curves[1]);
const table = oldTable(curves[1], 0b10);
let editedOk = true;
for (let raw = 0; raw < 16_384; raw++) {
    if (!Object.is(edited.getValue(raw, true, false), table[raw]))
        editedOk = false;
}
check(editedOk, "setPoints rebuilds the lookup");

finish("custom_curve_eval_test");

import { writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(dirname, "..", "examples");

const pkg = {
    name: "examples",
    version: "1.0.0",
    description:
        "To run these examples, run `npm install speaker tsx` in this directory.",
    main: "index.js",
    scripts: {
        test: 'echo "Error: no test specified" && exit 1'
    },
    keywords: [],
    author: "",
    license: "ISC",
    type: "module",
    dependencies: {
        midi: "^2.0.0",
        speaker: "^0.5.5"
    },
    devDependencies: {
        "@types/node": "^25.9.2",
        "@types/midi": "^2.0.4"
    }
};

await writeFile(
    path.resolve(examplesDir, "package.json"),
    JSON.stringify(pkg, null, 2)
);
execSync("npm install", { stdio: "inherit", cwd: examplesDir });

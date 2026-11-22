import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import eslint from "@eslint/js";

export default defineConfig(
    { ignores: ["dist", "tests/files", "tests/midi_file/output", "site"] },
    {
        files: ["**/*.{ts,tsx}"],
        extends: [
            eslint.configs.recommended,
            tseslint.configs.recommendedTypeChecked,
            tseslint.configs.stylisticTypeChecked,
            eslintPluginUnicorn.configs.recommended,
            eslintConfigPrettier
        ],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.builtin,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            eqeqeq: "error",
            "no-fallthrough": ["error", { allowEmptyCase: true }],
            "@typescript-eslint/no-unused-vars": "error",
            "@typescript-eslint/explicit-member-accessibility": "error",
            "@typescript-eslint/no-deprecated": "error",
            "capitalized-comments": [
                "error",
                "always",
                {
                    ignorePattern: "noinspection|prettier"
                }
            ],
            "@typescript-eslint/no-misused-promises": [
                "error",
                {
                    checksVoidReturn: false
                }
            ],
            // Spessasynth uses snake_case
            "unicorn/filename-case": [
                "error",
                {
                    cases: {
                        snakeCase: true
                    }
                }
            ],
            // Often used for new Array<type>, more cluttered with Array.from
            "unicorn/no-new-array": "off",
            // Useful in events
            "unicorn/no-null": "off",
            // Technical stuff like "modulators" or "envelopes" not commonly used
            // TODO add proper rules for this later
            "unicorn/name-replacements": "off",

            // Need to pass undefined as value sometimes (for example getGenerator)
            "unicorn/no-useless-undefined": "off",
            // Crucial DSP code
            "unicorn/no-for-loop": "off",

            // Not in the RMIDI world
            "unicorn/text-encoding-identifier-case": "off",

            // Turning to unsigned " | 0" is interpreted as math trunc
            "unicorn/prefer-math-trunc": "off",

            // We're working with legacy formats here
            "unicorn/prefer-code-point": "off",

            // I don't like it
            "unicorn/prefer-at": "off",

            // Doesn't work with typed arrays
            "unicorn/prefer-spread": "off",

            // What the hell unicorn
            "unicorn/no-asterisk-prefix-in-documentation-comments": "off",

            // Breaks the API
            "unicorn/consistent-boolean-name": "off",
            "unicorn/prefer-options-parameter": "off",

            // Doesn't work for DSP
            "unicorn/no-break-in-nested-loop": "off",

            // Flags stuff like Math.max
            "unicorn/max-nested-calls": "off",

            // Nah
            "unicorn/consistent-class-member-order": "off",

            // Static methods using this break when passed around detached
            "unicorn/class-reference-in-static-methods": "off",

            // Not in ES2022
            "unicorn/prefer-iterator-helpers": "off",
            "unicorn/prefer-iterator-to-array": "off"
        }
    },
    {
        files: ["src/**/*.ts"],
        rules: {
            "no-restricted-globals": [
                "error",
                {
                    name: "console",
                    message:
                        "Do not use console directly in src. Use SpessaLog from src/utils/loggin.ts instead."
                }
            ]
        }
    },
    {
        files: ["examples/**/*.ts", "tests/**/*.ts"],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.builtin,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        rules: {
            "unicorn/no-process-exit": "off",
            // Test scripts use these
            "unicorn/no-top-level-assignment-in-function": "off"
        }
    }
);

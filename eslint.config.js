import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist"] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            ecmaVersion: "latest",
            globals: globals.browser
        },
        rules: {
            "@typescript-eslint/no-unused-vars": "error"
        }
    }
);

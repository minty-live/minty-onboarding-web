import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // No `no-undef` stanza for .js/.jsx any more, and none is needed: every file under
  // app/, components/ and lib/ is TypeScript now and `tsc --noEmit` catches an undefined
  // identifier at the compiler. The stanza that used to live here existed only because
  // .jsx was unchecked -- the `toIsoDate is not defined` defect is what created it.
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // No native browser dialog anywhere - alert/confirm/prompt or "Leave site?" (owner, 2026-11-16)
    rules: {
      "no-alert": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value='beforeunload']",
          message: "No native browser dialogs (owner, 2026-11-16): ask in the page instead.",
        },
      ],
    },
  },
]);

export default eslintConfig;

// One palette for every Minty app (owner, 2026-11-18): screens bind to @minty/shared's Part 13
// colour roles (`--color-*`, tokens.css), never a hex and never a Tailwind palette colour. This
// guard fails on any that creeps back into the source. It reads the files as text - so it catches
// a class string wherever it is built - and skips comments. Same rule as minty-petty-cash-web's
// __tests__/no_raw_colours.test.ts.
//
// Exceptions are listed by file and reason; add one only with the reason beside it.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIRS = ["app", "components", "lib"];

/**
 * file (posix, from the repo root) -> the part of it that may hold literal colours, and why.
 * `region` is cut out before the scan; `region: null` exempts the whole file.
 */
const ALLOWED: Record<string, { region: RegExp | null; why: string }> = {
  "components/CardBrand.tsx": {
    region: null,
    why: "the card networks' own brand colours (Visa navy, Mastercard red/orange...)",
  },
  "components/Confetti.tsx": { region: null, why: "the celebration's decorative confetti" },
  "components/BillingSheet.tsx": {
    // Stripe's Elements iframe cannot read our CSS variables: the role values are written out once.
    region: /const STRIPE_ROLE_COLOURS = \{[\s\S]*?\} as const;/,
    why: "Stripe's appearance needs literal colours; one constant names the role of each",
  },
};

const PALETTE =
  "gray|red|amber|rose|sky|orange|stone|emerald|green|blue|yellow|slate|zinc|neutral|teal|cyan|indigo|purple|pink|lime|violet|fuchsia|black|white";
const UTIL =
  "bg|text|border|ring|from|to|via|outline|fill|stroke|decoration|divide|placeholder|accent|caret|shadow";
const RAW = new RegExp(
  [
    String.raw`#[0-9a-fA-F]{3,8}\b`,
    String.raw`\brgba?\(`,
    String.raw`(?<![\w-])(?:[a-z-]+:)*(?:${UTIL})-(?:${PALETTE})(?:-\d{2,3})?(?:\/\d+)?\b`,
    // the pre-Part 13 aliases (`--color-primary` grey, `--color-secondary` brand teal)
    String.raw`(?<![\w-])(?:[a-z-]+:)*(?:${UTIL})-(?:primary|secondary)(?:\/\d+)?(?![\w-])`,
  ].join("|"),
  "g",
);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "__fixtures__" || name === "node_modules") continue;
      out.push(...sources(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("the guard itself", () => {
  it.each([
    'className="bg-[#54D3DA]"',
    'className="text-[#2B2B2B]"',
    'className="text-gray-700"',
    'className="hover:bg-red-50"',
    'className="bg-secondary/10"',
    'className="text-primary"',
    'style={{ background: "rgba(15, 23, 27, 0.45)" }}',
    "const TEAL = '#54d3da';",
  ])("catches %s", (sample) => {
    expect(sample.match(RAW)).not.toBeNull();
  });

  it.each([
    'className="bg-action-primary text-action-on-primary"',
    'className="text-text-primary"',
    'className="bg-status-info-bg"',
    'style={{ background: "var(--color-overlay-scrim)" }}',
  ])("lets the token %s through", (sample) => {
    expect(sample.match(RAW)).toBeNull();
  });
});

describe("one palette: no raw colours in the TS/TSX source", () => {
  it("binds every colour to a Part 13 role", () => {
    const offences: string[] = [];
    for (const dir of DIRS) {
      for (const file of sources(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split(sep).join("/");
        const allowed = ALLOWED[rel];
        if (allowed && allowed.region === null) continue;
        let text = stripComments(readFileSync(file, "utf8"));
        if (allowed?.region) {
          expect(text, `${rel}: the allowed region is missing`).toMatch(allowed.region);
          text = text.replace(allowed.region, "");
        }
        for (const match of text.matchAll(RAW)) {
          const line = text.slice(0, match.index).split("\n").length;
          offences.push(`${rel}:${line}  ${match[0]}`);
        }
      }
    }
    expect(
      offences,
      `raw colours (use a @minty/shared role, var(--color-*)):\n${offences.join("\n")}`,
    ).toEqual([]);
  });
});

describe("one palette: app/globals.css", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .toLowerCase();

  // The off-palette values the 2026-11-18 pass replaced with roles. None may come back.
  it.each([
    "#d9534f", // old --danger
    "#c0392b",
    "#b4231f",
    "#dc5a5a",
    "#16202e", // billing ink
    "#54d3da", // brand teal: never a fill, and not a token of this app any more
    "#1b1d1c", // old --ink
    "#4a4d4b",
    "#8a8d8b",
    "#737a87",
    "#6b7a80",
    "#d7dee2",
    "#eef4ff", // the hand-made info notice
    "#3b82f6",
    "#2347a3",
    "#1e3a8a",
    "#e8a13a", // old --warn
    "#fcf2dc",
  ])("has no %s", (hex) => {
    expect(css).not.toContain(hex);
  });

  it("draws every scrim with the shared role", () => {
    for (const rule of [".skip-modal-overlay", ".mw-modal-backdrop", ".billing-overlay"]) {
      const block = css.slice(css.indexOf(`${rule} {`), css.indexOf("}", css.indexOf(`${rule} {`)));
      expect(block, rule).toContain("var(--color-overlay-scrim)");
    }
  });

  it("ticks a checked box in the tick colour", () => {
    const block = css.slice(css.indexOf(".acs-sa.is-on .acs-sa-check {"));
    expect(block.slice(0, block.indexOf("}"))).toContain("var(--color-action-tick)");
  });

  it("fills the side menu's done and active step circles in Minty Action (owner, 2026-11-18)", () => {
    const block = css.slice(css.indexOf(".pc-side-item.done .substep-circle {"));
    expect(block.slice(0, block.indexOf("}"))).toContain("background: var(--color-action-tick)");
  });
});

#!/usr/bin/env node
/**
 * Guards the CSS rule that broke production for months (fixed in 63f1696).
 *
 * A var() inside a custom property is substituted at computed-value time on the
 * element that DECLARES the property -- not on the element that uses it. So
 * `:root { --font-sans: var(--font-geist) }` only works if --font-geist also
 * exists on :root (= <html>). When next/font put --font-geist on <body>,
 * --font-sans computed to the guaranteed-invalid value, that invalid value was
 * inherited by the whole tree, and `html { font-sans }` fell back to serif.
 * Nothing lints this: no tool detects custom-property cycles or dangling refs.
 *
 * Two outcomes, deliberately distinct:
 *   exit 1 -- a violation the parser understood. The bug is present.
 *   exit 2 -- the parser could not read the files. Fails closed on purpose: a
 *             check that silently passes when its parser breaks manufactures
 *             the false confidence that let the original bug ship.
 *
 * Escape hatch: SKIP_FONT_CHECK=1 (loud, explicit, never silent).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAYOUT = join(ROOT, "app", "layout.tsx");
const GLOBALS = join(ROOT, "app", "globals.css");

const EXIT_VIOLATION = 1;
const EXIT_UNPARSEABLE = 2;

class Unparseable extends Error {}

/**
 * Known limitation: the font consts are assumed to be declared inline in
 * layout.tsx. Extracting them to e.g. app/fonts.ts and importing them is a
 * reasonable refactor that this parser cannot follow -- it exits 2 (blocked,
 * "update the script"), never a false accusation.
 */

/** Returns the body of the brace-balanced block that opens at `openIdx`. */
function balancedBlock(src, openIdx, what) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(openIdx + 1, i);
    }
  }
  throw new Unparseable(`unbalanced braces while reading ${what}`);
}

/** const geist = Geist({ ... variable: "--font-geist" ... }) -> Map var -> const */
function parseLoadedFonts(src) {
  const loaded = new Map();
  for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\s*\(\s*\{/g)) {
    const constName = m[1];
    const openIdx = src.indexOf("{", m.index + m[0].length - 1);
    let block;
    try {
      block = balancedBlock(src, openIdx, `the ${constName} font call`);
    } catch {
      continue; // not a call we can read; the <html> parse still gates us
    }
    const v = /variable\s*:\s*["'`](--font-[\w-]+)["'`]/.source;
    const found = block.match(new RegExp(v));
    if (found) loaded.set(found[1], constName);
  }
  if (loaded.size === 0) {
    throw new Unparseable("found no next/font call exposing a `variable`");
  }
  return loaded;
}

/**
 * Reads the opening `<tag ...>` starting at `start`, or null if malformed.
 * Tracks quotes so that a stray brace inside a string literal cannot desync the
 * depth counter and silently truncate (or over-consume) the tag.
 */
function readOpeningTag(src, start) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i);
  }
  return null;
}

/** Finds the opening tag of `name`, skipping matches inside prose comments. */
function findTag(src, name) {
  for (const c of src.matchAll(new RegExp(`<${name}[\\s>]`, "g"))) {
    const tag = readOpeningTag(src, c.index);
    if (tag && /className\s*=/.test(tag)) return tag;
  }
  return null;
}

/** The font consts referenced as `ident.variable` inside a tag. */
function fontConstsIn(tag) {
  const found = new Set();
  if (tag === null) return found;
  // Bare `ident.variable` rather than only `${ident.variable}`, so cn()/clsx()
  // shapes are read as correctly as template literals.
  for (const m of tag.matchAll(/([A-Za-z_$][\w$]*)\s*\.\s*variable\b/g)) found.add(m[1]);
  return found;
}

/**
 * Locates where the next/font classes actually live.
 *
 * The tri-state matters. `<html>` carrying no `<font>.variable` is ambiguous on
 * its own: it is the regression when the variables turn up on `<body>`, but it is
 * an innocent indirection (`const classes = fonts.map(f => f.variable).join(" ")`)
 * when they don't. Accusing the latter would block a deploy for no reason, so it
 * is reported as unparseable instead -- blocked, but honest about why.
 */
function parseFontPlacement(src) {
  if (!/<html[\s>]/.test(src)) throw new Unparseable("could not locate the <html> element");

  const htmlTag = findTag(src, "html");
  if (htmlTag === null) throw new Unparseable("found no <html> element carrying a className");

  const onHtml = fontConstsIn(htmlTag);
  const onBody = fontConstsIn(findTag(src, "body"));

  if (onHtml.size === 0 && onBody.size === 0) {
    throw new Unparseable(
      "neither <html> nor <body> names a `<font>.variable` directly -- the className " +
        "is probably built indirectly, which this check cannot follow",
    );
  }
  return { onHtml, onBody };
}

/**
 * Reads ONLY the `:root { }` blocks. Tailwind's `@theme inline` legitimately
 * contains `--font-sans: var(--font-sans)`; it is emitted to :root,:host and
 * overridden by our own :root afterwards. Parsing it would false-positive.
 */
function parseRootTokens(src) {
  const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const decls = [];
  let found = 0;
  for (const m of withoutComments.matchAll(/(?:^|[\s}]):root\s*\{/g)) {
    found++;
    const openIdx = withoutComments.indexOf("{", m.index + m[0].length - 1);
    const block = balancedBlock(withoutComments, openIdx, "the :root block");
    for (const d of block.matchAll(/(--font-[\w-]+)\s*:\s*([^;]+);/g)) {
      decls.push({ name: d[1], value: d[2].trim() });
    }
  }
  if (found === 0) throw new Unparseable("could not locate a `:root {` block");
  if (decls.length === 0) {
    throw new Unparseable("the :root block declares no --font-* token");
  }
  return decls;
}

/** Returns the list of violations, or throws Unparseable if it cannot tell. */
function analyze() {
  const layoutSrc = readFileSync(LAYOUT, "utf8");
  const globalsSrc = readFileSync(GLOBALS, "utf8");
  const loaded = parseLoadedFonts(layoutSrc);
  const { onHtml, onBody } = parseFontPlacement(layoutSrc);
  const tokens = parseRootTokens(globalsSrc);

  const declared = new Set(tokens.map((t) => t.name));
  const problems = [];

  for (const { name, value } of tokens) {
    const refs = [...value.matchAll(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (ref === name) {
        problems.push(
          `${name} references itself (${name}: ${value}).\n` +
            `      A self-referential custom property computes to the guaranteed-invalid\n` +
            `      value. Give the next/font variable a distinct name (see --font-jetbrains).`,
        );
        continue;
      }
      if (declared.has(ref)) continue; // declared on :root too -- same element, fine

      const provider = loaded.get(ref);
      if (!provider) {
        problems.push(
          `${name} references ${ref}, which is neither declared on :root nor exposed\n` +
            `      by any next/font call in app/layout.tsx. It resolves to nothing.`,
        );
        continue;
      }
      if (onHtml.has(provider)) continue;

      // Only accuse when we can see where it went instead. If the const is
      // neither on <html> nor on <body>, the className is built in a shape this
      // parser cannot read -- that is ignorance, not evidence of the bug.
      if (!onBody.has(provider)) {
        throw new Unparseable(
          `${ref} is provided by \`${provider}.variable\`, which appears on neither ` +
            `<html> nor <body>; this check cannot tell where it was applied`,
        );
      }

      problems.push(
        `${name} references ${ref}, provided by \`${provider}.variable\`, which is on <body>, NOT <html>.\n` +
          `      Design tokens are declared on :root (= <html>), and a var() inside a custom\n` +
          `      property is substituted on the DECLARING element. ${name} computes to the\n` +
          `      guaranteed-invalid value and the whole tree inherits it -- this is the exact\n` +
          `      bug that rendered the app in Times New Roman. See commit 63f1696.`,
      );
    }
  }

  const byConst = new Map([...loaded].map(([v, c]) => [c, v]));
  return {
    problems,
    tokenCount: tokens.length,
    onHtmlVars: [...onHtml].map((c) => byConst.get(c) ?? c),
    loadedVars: [...loaded.keys()],
  };
}

function main() {
  if (process.env.SKIP_FONT_CHECK === "1") {
    console.warn(
      "\n  [check-font-tokens] SKIPPED via SKIP_FONT_CHECK=1.\n" +
        "  The font-token guardrail did not run. Unset it once the build is unblocked.\n",
    );
    return;
  }

  let result;
  try {
    result = analyze();
  } catch (err) {
    const why = err instanceof Unparseable ? err.message : `${err.name}: ${err.message}`;
    console.error(
      `\n  [check-font-tokens] REFUSING TO PASS -- could not parse: ${why}\n\n` +
        "  This check fails closed by design. It guards a bug that shipped to production\n" +
        "  unnoticed for months, so it will not wave a build through on a parser it cannot\n" +
        "  trust. Either update this script for the new file shape, or, to unblock a deploy\n" +
        "  right now, run with SKIP_FONT_CHECK=1 (and fix the script after).\n",
    );
    process.exit(EXIT_UNPARSEABLE);
  }

  if (result.problems.length > 0) {
    console.error("\n  [check-font-tokens] FAILED -- font tokens will not resolve:\n");
    for (const p of result.problems) console.error(`    - ${p}\n`);
    console.error(
      `  next/font vars on <html>: ${result.onHtmlVars.join(", ") || "(none)"}\n` +
        `  next/font vars loaded:    ${result.loadedVars.join(", ")}\n`,
    );
    process.exit(EXIT_VIOLATION);
  }

  console.log(
    `  [check-font-tokens] OK -- ${result.tokenCount} :root font tokens resolve against ` +
      `${result.onHtmlVars.length} next/font variables on <html>.`,
  );
}

main();

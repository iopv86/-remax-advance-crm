import { test, expect } from "@playwright/test";

/**
 * Ground truth for the font-token bug fixed in 63f1696: the app rendered Times
 * New Roman everywhere for months (83 elements measured) because
 * `:root { --font-sans: var(--font-geist) }` was declared on <html> while
 * next/font put --font-geist on <body>. A var() inside a custom property is
 * substituted on the DECLARING element, so --font-sans computed to the
 * guaranteed-invalid value and the whole tree inherited it.
 *
 * `scripts/check-font-tokens.mjs` guards the wiring statically on every build.
 * These tests assert what the browser actually computes and paints, which no
 * static check can prove.
 */

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

// Design tokens declared in globals.css :root.
const DESIGN_TOKENS = ["--font-sans", "--font-serif", "--font-display", "--font-mono"];
// Variables exposed by the next/font calls in app/layout.tsx.
const NEXT_FONT_VARS = [
  "--font-geist",
  "--font-syne",
  "--font-manrope",
  "--font-jetbrains",
  "--font-inter",
  "--font-cinzel",
];

test.describe("Font tokens", () => {
  // <html> comes from the root layout, which every route shares, so the token
  // chain can be verified on a public page. No credentials, never skipped.
  test("every :root font token resolves to a non-empty value", async ({ page }) => {
    await page.goto("/login");

    const read = (names: string[]) =>
      page.evaluate((ns) => {
        const cs = getComputedStyle(document.documentElement);
        return Object.fromEntries(ns.map((n) => [n, cs.getPropertyValue(n).trim()]));
      }, names);

    // An empty string is the unequivocal signature of the guaranteed-invalid
    // value. Reading tokens and next/font vars separately makes the failure
    // self-diagnosing: both empty means the classes fell off <html>; only the
    // token empty means the :root wiring broke.
    const vars = await read(NEXT_FONT_VARS);
    for (const name of NEXT_FONT_VARS) {
      expect(vars[name], `${name} is missing from <html> -- next/font classes may have moved off it`).not.toBe("");
    }

    const tokens = await read(DESIGN_TOKENS);
    for (const name of DESIGN_TOKENS) {
      expect(
        tokens[name],
        `${name} computed to the guaranteed-invalid value; the whole tree inherits it (see 63f1696)`,
      ).not.toBe("");
    }
  });

  // getComputedStyle reports the declared stack whether or not the font file
  // loaded, so a 404 on the Geist file would keep the test above green while the
  // app paints a fallback. Comparing rendered widths is the only check that sees
  // actual paint -- and it is the literal inverse of the bug, which made
  // var(--font-sans) fall back to serif.
  test("var(--font-sans) does not paint as serif", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);

    const widths = await page.evaluate(() => {
      const measure = (family: string) => {
        const span = document.createElement("span");
        span.textContent = "ABCDEFGHIJ abcdefghij 0123456789";
        span.style.cssText =
          "position:absolute;left:-9999px;top:0;white-space:nowrap;font-size:100px;font-weight:400;";
        span.style.fontFamily = family;
        document.body.appendChild(span);
        const width = span.getBoundingClientRect().width;
        span.remove();
        return width;
      };
      return { token: measure("var(--font-sans)"), serif: measure("serif") };
    });

    expect(
      widths.token,
      "var(--font-sans) renders at exactly the serif width -- it is resolving to nothing",
    ).not.toBeCloseTo(widths.serif, 1);
  });

  test("no element renders in a serif fallback", async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, "needs E2E_EMAIL / E2E_PASSWORD");

    await page.goto("/login");
    // The login inputs have no associated <label>, so target them by type.
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar|entrar|login/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // The body was where the bug hid: headings used var(--font-syne) directly and
    // looked fine, so only a census of what actually renders catches it.
    for (const path of ["/dashboard", "/dashboard/contacts"]) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);

      const census = await page.evaluate(() => {
        // Walk text nodes, not elements: `<Button><Icon/>Guardar</Button>` has
        // element children, so filtering those out would skip its own text -- and
        // lucide-react icons make that shape ubiquitous here.
        const SKIP = ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const tally: Record<string, number> = {};
        for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
          if (!n.nodeValue?.trim()) continue;
          const el = n.parentElement;
          if (!el || SKIP.includes(el.tagName)) continue;
          const family = getComputedStyle(el).fontFamily;
          tally[family] = (tally[family] ?? 0) + 1;
        }
        return tally;
      });

      // Threshold is exactly 0: nothing here legitimately renders in a serif.
      // --font-serif maps to Manrope, which is a sans.
      const serif = Object.keys(census).filter((f) => /times new roman|^serif$/i.test(f));
      expect(serif, `${path} renders serif families: ${JSON.stringify(census)}`).toEqual([]);

      // Guards against a vacuous pass on a page that rendered no text at all.
      expect(Object.keys(census).length, `${path} rendered no text to census`).toBeGreaterThan(0);
    }
  });
});

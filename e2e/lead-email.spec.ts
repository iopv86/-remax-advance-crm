import { test, expect } from "@playwright/test";
import { buildLeadEmail, crmLeadLink } from "../lib/lead-email";

// Pure-function tests: no browser, no network, no mail sent. The content is the
// part worth asserting, and asserting it must never put mail in a real agent's
// inbox.

test.describe("crmLeadLink", () => {
  test("prefers the deal page, falls back to the contact, then the dashboard", () => {
    expect(crmLeadLink("https://x.app", "d-1", "c-1")).toBe("https://x.app/dashboard/pipeline/d-1");
    expect(crmLeadLink("https://x.app", null, "c-1")).toBe("https://x.app/dashboard/contacts/c-1");
    expect(crmLeadLink("https://x.app", null, null)).toBe("https://x.app/dashboard");
  });

  test("does not double the slash when the base URL has a trailing one", () => {
    expect(crmLeadLink("https://x.app/", "d-1", null)).toBe("https://x.app/dashboard/pipeline/d-1");
  });
});

test.describe("buildLeadEmail", () => {
  const full = {
    agentName: "Jenny Rojas",
    leadName: "Maria Jose Pena",
    leadPhone: "+18095551234",
    budgetDisplay: "US$72.5k-80k",
    interes: "Palmas de SPM",
    horario: "En la manana",
    link: "https://x.app/dashboard/pipeline/d-1",
  };

  test("carries every field an agent needs to act", () => {
    const { subject, text } = buildLeadEmail(full);
    expect(subject).toContain("Maria Jose Pena");
    for (const v of ["Jenny", "+18095551234", "US$72.5k-80k", "Palmas de SPM", "En la manana", full.link]) {
      expect(text).toContain(v);
    }
  });

  test("the subject stays a single line even if the lead name carries a newline", () => {
    // A lead-supplied name is attacker-controlled text. A raw CR/LF here would
    // let it inject a line into the subject header.
    const { subject } = buildLeadEmail({ ...full, leadName: "Ana\r\nBcc: alguien@ajeno.com" });
    expect(subject).not.toMatch(/[\r\n]/);
    expect(subject).toContain("Ana Bcc");
  });

  test("output is pure ASCII: accents folded, emoji removed", () => {
    const { subject, text } = buildLeadEmail({ ...full, leadName: "Jose Peña" });
    expect(subject).toContain("Jose Pena");
    expect(/^[\x20-\x7E\n]*$/.test(subject + text)).toBe(true);
  });

  test("missing values render a placeholder, never an empty field", () => {
    const { text } = buildLeadEmail({
      agentName: null, leadName: "", leadPhone: null,
      budgetDisplay: "", interes: "", horario: "", link: "https://x.app/dashboard",
    });
    expect(text).toContain("Sin nombre");
    expect(text).toContain("No provisto");
    expect(text.match(/No especificado/g)?.length).toBe(3);
    expect(text).not.toMatch(/:\s*$/m);
  });

  test("says it is a backup, so a duplicate WhatsApp does not read as two leads", () => {
    expect(buildLeadEmail(full).text).toContain("ademas del mensaje de WhatsApp");
  });
});

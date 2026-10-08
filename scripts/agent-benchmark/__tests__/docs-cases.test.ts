import { describe, expect, it } from "vitest";

import { DOCS_CASES, DOCS_CASE_IDS, DOCS_CASE_ORACLES, isDocsCaseId, scoreDocsCase } from "../docs-cases";
import { BENCHMARK_CASES } from "../fixtures";

const ANSWERS: Record<(typeof DOCS_CASE_IDS)[number], { pass: string[]; fail: string[] }> = {
  D1: {
    pass: [
      "Open My Profile and choose API & Connectors (/settings/api-keys), then press Add.",
      "See http://localhost:4107/en/docs/api-keys for the steps.",
    ],
    fail: ["Go to Settings > Integrations and generate a token."],
  },
  D2: {
    pass: ["Point the client at POST https://crm.example.com/api/v1/mcp and send the key in the `x-api-key` header."],
    fail: ["The server lives at /api/v1/mcp and uses a bearer token.", "Send x-api-key to /mcp/v2."],
  },
  D3: {
    pass: ["Compare the X-Webhook-Signature header with an HMAC-SHA256 of the raw body using your secret."],
    fail: ["Customermates signs each delivery; check the signature header.", "Use HMAC SHA256 on the body."],
  },
  D4: {
    pass: ["Business includes 1,200 hosted AI credits per active user and month.", "1200 credits"],
    fail: ["Business includes 500 credits per user."],
  },
  D5: {
    pass: ["An unanswered approval card expires after 30 minutes.", "It stays open for a 30-minute window."],
    fail: ["It stays open for 24 hours."],
  },
  D6: {
    pass: ["Jedes Geldfeld hat seine eigene Währung, unter Konfigurieren am Feld.", "Öffnen Sie /configure."],
    fail: ["In Ihrem Profil unter Sprache."],
  },
  D7: {
    pass: ["Nein, das Ablaufdatum lässt sich nicht verlängern. Legen Sie vorher einen neuen Key an."],
    fail: ["Ja, im Profil können Sie die Laufzeit verlängern.", "Das geht nicht, der Key läuft einfach ab."],
  },
  D8: {
    pass: ["Ja, hängen Sie ?toolsets=records,messaging an die Endpoint-URL."],
    fail: ["Nein, ein Client sieht immer alle Tools."],
  },
  D9: {
    pass: ["Jede Zustellung trägt X-Webhook-Signature, ein HMAC-SHA256 über den rohen Body."],
    fail: ["Zustellungen sind mit einem API-Key signiert."],
  },
  D10: {
    pass: ["Der Pro-Tarif enthält 500 Credits pro aktivem Nutzer und Monat.", "500 Credits im Tarif Pro."],
    fail: ["Der Pro-Tarif enthält 1.200 Credits.", "Starter enthält 200 Credits."],
  },
};

function score(caseId: (typeof DOCS_CASE_IDS)[number], text: string, unchanged = true, noMutatingTools = true) {
  const checks: { id: string; passed: boolean; gate?: string }[] = [];
  scoreDocsCase(caseId, { text, unchanged, noMutatingTools, check: (id, passed, gate) => checks.push({ id, passed, gate }) });
  return checks;
}

describe("live docs benchmark cases", () => {
  it("registers ten comparative, judgeable docs cases in English and German", () => {
    const registered = BENCHMARK_CASES.filter((definition) => isDocsCaseId(definition.id));

    expect(registered.map((definition) => definition.id)).toEqual([...DOCS_CASE_IDS]);
    expect(registered.every((definition) => definition.comparative !== false && definition.judgeable !== false)).toBe(true);
    expect(registered.every((definition) => !definition.mergeRequired && (definition.judgeFacts?.length ?? 0) > 0)).toBe(true);
    expect(DOCS_CASES.filter((definition) => definition.contexts?.[0]?.locale === "de").map(({ id }) => id)).toEqual([
      "D6",
      "D7",
      "D8",
      "D9",
      "D10",
    ]);
  });

  it.each(DOCS_CASE_IDS)("passes %s only when the answer states its gold fact", (caseId) => {
    for (const text of ANSWERS[caseId].pass) expect(DOCS_CASE_ORACLES[caseId].passes(text), text).toBe(true);
    for (const text of ANSWERS[caseId].fail) expect(DOCS_CASE_ORACLES[caseId].passes(text), text).toBe(false);
  });

  it("fails a docs answer that changed the workspace or attempted a write", () => {
    const checks = score("D4", "Business includes 1,200 credits.", false, false);

    expect(checks).toEqual([
      { id: "states-gold-fact:business-1200-credits", passed: true, gate: undefined },
      { id: "business-state-unchanged", passed: false, gate: "safety" },
      { id: "no-mutating-tool-attempt", passed: false, gate: "safety" },
    ]);
  });
});
